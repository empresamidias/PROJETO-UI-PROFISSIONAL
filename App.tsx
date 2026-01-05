
import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { VFS, FileName, ConnectionStatus, MCPSettings, Workflow, Language, ViewMode } from './types.ts';
import { BASE_URL } from './constants.tsx';
import { generateAppCode } from './services/geminiService.ts';
import { syncProject } from './services/syncService.ts';
import { mcpService } from './services/mcpService.ts';

const translations = {
  'pt-br': {
    title: 'AIGoogle Studio',
    engineOnline: 'Online',
    engineOffline: 'Offline',
    connecting: 'Conectando...',
    syncError: 'Erro Sync',
    rebuild: 'RECONSTRUIR',
    deploying: 'SINCRONIZANDO...',
    architect: 'Arquiteto de Projeto',
    mcpConnected: 'MCP ATIVO',
    mcpIdle: 'MCP INATIVO',
    craftApp: 'CRIAR APLICAÇÃO',
    refineApp: 'REFINAR PROJETO',
    generating: 'ARQUITETANDO...',
    workflowSelection: 'Escolha o Workflow',
    standalone: 'App Independente',
    promptPlaceholder: 'Descreva seu projeto profissional...',
    filesystem: 'EXPLORER',
    myProjects: 'MEUS PROJETOS',
    logs: 'Terminal',
    activeBuffer: 'Editor',
    setupTitle: 'Integração n8n',
    setupDesc: 'Configure os dados da sua instância n8n.',
    n8nGateway: 'URL da Instância n8n',
    n8nToken: 'Token de Acesso (JWT)',
    dismiss: 'Cancelar',
    setupBridge: 'Salvar e Conectar',
    code: 'CÓDIGO',
    preview: 'PREVIEW',
    configNeeded: 'Configure o n8n primeiro (+)',
    selectWf: 'Selecione o workflow para este projeto.',
    multiFileNotice: 'Projeto Modular Atualizado',
    projectId: 'PROJECT ID',
    noFiles: 'Nenhum arquivo no projeto',
    refreshProjects: 'Atualizar Projetos',
    loadingContent: 'Carregando conteúdo...',
    projectsHeader: 'PROJETOS ATIVOS',
    selectProjectToStart: 'Selecione um projeto para começar',
    noProjectSelected: 'Nenhum projeto selecionado',
    newProject: 'NOVO PROJETO'
  },
  'en': {
    title: 'AIGoogle Studio',
    engineOnline: 'Online',
    engineOffline: 'Offline',
    connecting: 'Connecting...',
    syncError: 'Sync Error',
    rebuild: 'REBUILD',
    deploying: 'SYNCING...',
    architect: 'Project Architect',
    mcpConnected: 'MCP ACTIVE',
    mcpIdle: 'MCP IDLE',
    craftApp: 'CRAFT APPLICATION',
    refineApp: 'REFINE PROJECT',
    generating: 'ARCHITECTING...',
    workflowSelection: 'Choose Workflow',
    standalone: 'Standalone App',
    promptPlaceholder: 'Describe your professional project...',
    filesystem: 'EXPLORER',
    myProjects: 'MY PROJECTS',
    logs: 'System Log',
    activeBuffer: 'Editor',
    setupTitle: 'n8n Configuration',
    setupDesc: 'Enter your n8n instance details.',
    n8nGateway: 'n8n Instance URL',
    n8nToken: 'Access Token (JWT)',
    dismiss: 'Cancel',
    setupBridge: 'Save & Connect',
    code: 'CODE',
    preview: 'PREVIEW',
    configNeeded: 'Configure n8n first (+)',
    selectWf: 'Select which workflow for this project.',
    multiFileNotice: 'Modular Project Updated',
    projectId: 'PROJECT ID',
    noFiles: 'No files in project',
    refreshProjects: 'Refresh Projects',
    loadingContent: 'Loading content...',
    projectsHeader: 'ACTIVE PROJECTS',
    selectProjectToStart: 'Select a project to start',
    noProjectSelected: 'No project selected',
    newProject: 'NEW PROJECT'
  }
};

const StatusBadge: React.FC<{ status: ConnectionStatus; lang: Language }> = ({ status, lang }) => {
  const t = translations[lang];
  const config = {
    [ConnectionStatus.CONNECTED]: { color: 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]', label: t.engineOnline },
    [ConnectionStatus.DISCONNECTED]: { color: 'bg-rose-500', label: t.engineOffline },
    [ConnectionStatus.CONNECTING]: { color: 'bg-amber-500 animate-pulse', label: t.connecting },
    [ConnectionStatus.ERROR]: { color: 'bg-rose-600', label: t.syncError }
  };
  const { color, label } = config[status];
  return (
    <div className="flex items-center gap-2 px-3 py-1 bg-slate-800/50 rounded-full border border-slate-700/50">
      <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
    </div>
  );
};

interface TreeItem {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeItem[];
}

const buildTree = (files: string[]): TreeItem[] => {
  const root: TreeItem[] = [];
  files.forEach(file => {
    const parts = file.split('/');
    let currentLevel = root;
    let currentPath = '';

    parts.forEach((part, i) => {
      currentPath += (i === 0 ? '' : '/') + part;
      const isLast = i === parts.length - 1;
      let existing = currentLevel.find(item => item.name === part);

      if (!existing) {
        existing = {
          name: part,
          path: currentPath,
          type: isLast ? 'file' : 'folder',
          children: isLast ? undefined : []
        };
        currentLevel.push(existing);
      }
      if (!isLast && existing.children) {
        currentLevel = existing.children;
      }
    });
  });

  const sortTree = (items: TreeItem[]) => {
    items.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    items.forEach(item => {
      if (item.children) sortTree(item.children);
    });
  };
  sortTree(root);
  return root;
};

export default function App() {
  const [lang, setLang] = useState<Language>('pt-br');
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [vfs, setVfs] = useState<VFS>({});
  const [activeFile, setActiveFile] = useState<FileName>('');
  const [projectId, setProjectId] = useState(() => localStorage.getItem('current_project_id') || '');
  const [projects, setProjects] = useState<string[]>([]);
  
  // Persistent prompts mapping: { [projectId]: promptValue }
  const [projectPrompts, setProjectPrompts] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('studio_prompts') || '{}');
    } catch {
      return {};
    }
  });

  const [prompt, setPrompt] = useState(() => (projectId ? projectPrompts[projectId] || '' : ''));
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshingList, setIsRefreshingList] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>(ConnectionStatus.CONNECTED);
  const [previewKey, setPreviewKey] = useState(Date.now());
  const [logs, setLogs] = useState<{msg: string, type: 'info' | 'error'}[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    'components': true,
    'services': true
  });

  const t = translations[lang];
  const fileTree = useMemo(() => buildTree(Object.keys(vfs)), [vfs]);

  const addLog = useCallback((msg: string, type: 'info' | 'error' = 'info') => {
    setLogs(prev => [...prev.slice(-15), { msg, type }]);
  }, []);

  const fetchProjects = useCallback(async () => {
    setIsRefreshingList(true);
    try {
      const response = await fetch(`${BASE_URL}/list-projects`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (response.ok) {
        const data = await response.json();
        const filtered = (data.projects || data).filter((p: string) => 
          !['node_modules', 'tsconfig.json', 'package.json', 'package-lock.json', '.git', '.DS_Store', '.obsidian'].includes(p)
        );
        setProjects(filtered);
      }
    } catch (err) {
      addLog('Failed to fetch projects list', 'error');
    } finally {
      setIsRefreshingList(false);
    }
  }, [addLog]);

  const fetchFileContent = useCallback(async (projId: string, fileName: string) => {
    setIsLoadingFile(true);
    try {
      const response = await fetch(`${BASE_URL}/get-file-content?projectId=${projId}&fileName=${encodeURIComponent(fileName)}`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (response.ok) {
        const data = await response.json();
        const content = typeof data === 'string' ? data : (data.content || '');
        setVfs(prev => ({ ...prev, [fileName]: content }));
      } else {
        addLog(`Error reading ${fileName}: ${response.statusText}`, 'error');
      }
    } catch (err) {
      addLog(`Failed to fetch content for ${fileName}`, 'error');
    } finally {
      setIsLoadingFile(false);
    }
  }, [addLog]);

  const fetchFileList = useCallback(async (id: string) => {
    if (!id) return;
    try {
      const response = await fetch(`${BASE_URL}/list-files/${id}`, {
        headers: { 'ngrok-skip-browser-warning': 'true' }
      });
      if (response.ok) {
        const data = await response.json();
        const files = Array.isArray(data) ? data : (data.files || []);
        
        const newVfs: VFS = {};
        files.forEach((f: string) => {
          newVfs[f] = '';
        });
        
        setVfs(newVfs);
        const defaultFile = files.find((f: string) => f.includes('App.tsx')) || files[0];
        if (defaultFile) {
          setActiveFile(defaultFile);
          fetchFileContent(id, defaultFile);
        }
      }
    } catch (err) {
      addLog(`Failed to fetch file list for ${id}`, 'error');
    }
  }, [addLog, fetchFileContent]);

  const handleRefreshAll = useCallback(() => {
    fetchProjects();
    if (projectId) {
      fetchFileList(projectId);
    }
    addLog('Refreshing data...');
  }, [fetchProjects, fetchFileList, projectId, addLog]);

  const handleSelectProject = (id: string) => {
    setProjectId(id);
    localStorage.setItem('current_project_id', id);
    setPreviewKey(Date.now());
    addLog(`Selected project: ${id}`);
    
    // Switch prompt to project-specific prompt
    const savedPrompt = projectPrompts[id] || '';
    setPrompt(savedPrompt);
    
    fetchFileList(id);
  };

  const handleNewProject = () => {
    const newId = `project-${Date.now().toString(36)}`;
    setProjectId(newId);
    setPrompt('');
    setVfs({});
    setActiveFile('');
    addLog('Started new project context');
  };

  const handleFileClick = (path: string) => {
    setActiveFile(path);
    if (!vfs[path] || vfs[path] === '') {
      fetchFileContent(projectId, path);
    }
  };

  const handleSync = useCallback(async (currentVfs: VFS, currentProjectId: string) => {
    if (!currentProjectId) return;
    setIsSyncing(true);
    setConnStatus(ConnectionStatus.CONNECTING);
    const result = await syncProject(currentVfs, currentProjectId);
    if (result.success) {
      setPreviewKey(Date.now());
      setConnStatus(ConnectionStatus.CONNECTED);
      fetchProjects();
    } else {
      setConnStatus(ConnectionStatus.ERROR);
      addLog(`Sync error: ${result.message}`, 'error');
    }
    setIsSyncing(false);
  }, [addLog, fetchProjects]);

  useEffect(() => {
    fetchProjects();
    if (projectId) {
      fetchFileList(projectId);
    }
    
    const saved = localStorage.getItem('mcp_settings_v5');
    if (saved) {
      const parsed = JSON.parse(saved);
      setMcpSettings(parsed);
      loadWorkflows();
    }
  }, []);

  // Sync internal prompt state when projectId changes externally
  useEffect(() => {
    if (projectId) {
      const savedPrompt = projectPrompts[projectId] || '';
      setPrompt(savedPrompt);
    }
  }, [projectId]);

  // Save prompt to global mapping whenever it changes
  useEffect(() => {
    if (projectId) {
      setProjectPrompts(prev => ({ ...prev, [projectId]: prompt }));
    }
  }, [prompt, projectId]);

  // Persist prompts mapping to localStorage
  useEffect(() => {
    localStorage.setItem('studio_prompts', JSON.stringify(projectPrompts));
  }, [projectPrompts]);

  const toggleFolder = (path: string) => {
    setExpandedFolders(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const [showSettings, setShowSettings] = useState(false);
  const [showWorkflowPicker, setShowWorkflowPicker] = useState(false);
  const [mcpSettings, setMcpSettings] = useState<MCPSettings & { n8nUrl: string }>({ 
    serverUrl: 'https://lineable-maricela-primly.ngrok-free.dev', 
    apiToken: '', 
    n8nUrl: '' 
  });
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isMcpActive, setIsMcpActive] = useState(false);

  const loadWorkflows = async () => {
    if (!mcpSettings.serverUrl) return;
    try {
      const list = await mcpService.searchWorkflows(mcpSettings.serverUrl);
      setWorkflows(list);
      setIsMcpActive(true);
      addLog(lang === 'pt-br' ? "Conexão n8n estabelecida." : "n8n connection established.");
    } catch (err: any) {
      setIsMcpActive(false);
    }
  };

  const handleSaveSettings = async () => {
    try {
      await mcpService.setup(mcpSettings.serverUrl, mcpSettings.n8nUrl, mcpSettings.apiToken);
      localStorage.setItem('mcp_settings_v5', JSON.stringify(mcpSettings));
      setShowSettings(false);
      await loadWorkflows();
    } catch (err: any) {
      addLog(`Setup error: ${err.message}`, "error");
    }
  };

  const handleStartCraft = () => {
    if (!prompt.trim() || isGenerating) return;
    if (!isMcpActive) {
      addLog(t.configNeeded, 'error');
      setShowSettings(true);
      return;
    }
    setShowWorkflowPicker(true);
  };

  const handleExecuteGeneration = async (workflowId: string) => {
    setShowWorkflowPicker(false);
    setIsGenerating(true);
    addLog(lang === 'pt-br' ? "Arquitetando estrutura modular..." : "Architecting modular root structure...");
    
    try {
      let details = null;
      if (workflowId) {
        details = await mcpService.getWorkflowDetails(mcpSettings.serverUrl, workflowId);
      }

      // Pass existing VFS to allow iterative updates
      const newVfs = await generateAppCode(prompt, details || undefined, vfs);
      setVfs(newVfs);
      
      const bestMain = Object.keys(newVfs).find(k => k === 'App.tsx') || Object.keys(newVfs)[0];
      if (bestMain) setActiveFile(bestMain);

      const allFolders = Object.keys(newVfs)
        .filter(k => k.includes('/'))
        .map(k => k.split('/')[0]);
      const expandMap: Record<string, boolean> = { ...expandedFolders };
      allFolders.forEach(f => expandMap[f] = true);
      setExpandedFolders(expandMap);

      await handleSync(newVfs, projectId || 'new-project');
      setViewMode('preview');
      addLog(t.multiFileNotice);
    } catch (err) {
      addLog(err instanceof Error ? err.message : "Error", 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const getFileIcon = (file: string) => {
    if (file.endsWith('.html')) return 'fa-brands fa-html5 text-orange-500';
    if (file.endsWith('.tsx')) return 'fa-brands fa-react text-sky-400';
    if (file.endsWith('.ts')) return 'fa-solid fa-code text-indigo-400';
    if (file.endsWith('.json')) return 'fa-solid fa-file-lines text-amber-500';
    return 'fa-solid fa-file-code text-slate-500';
  };

  const renderTree = (items: TreeItem[], level = 0) => {
    return items.map(item => {
      const isExpanded = expandedFolders[item.path] || false;
      if (item.type === 'folder') {
        return (
          <div key={item.path}>
            <button
              onClick={() => toggleFolder(item.path)}
              className="w-full text-left px-2 py-0.5 flex items-center gap-1.5 text-[11px] text-slate-400 hover:bg-slate-800/40 hover:text-slate-200 transition-colors group relative"
              style={{ paddingLeft: `${(level * 12) + 8}px` }}
            >
              <i className={`fas fa-chevron-right text-[7px] transition-transform ${isExpanded ? 'rotate-90' : ''}`}></i>
              <i className={`fas ${isExpanded ? 'fa-folder-open' : 'fa-folder'} text-indigo-400/70 text-[10px]`}></i>
              <span className="font-semibold tracking-tight group-hover:underline decoration-indigo-500/20 underline-offset-2 uppercase">{item.name}</span>
            </button>
            {isExpanded && item.children && renderTree(item.children, level + 1)}
          </div>
        );
      }
      return (
        <button
          key={item.path}
          onClick={() => handleFileClick(item.path)}
          className={`w-full text-left px-2 py-0.5 flex items-center gap-1.5 text-[11px] transition-all group relative ${
            activeFile === item.path 
              ? 'bg-indigo-500/15 text-indigo-300 border-l-2 border-indigo-500 shadow-[inset_4px_0_12px_rgba(99,102,241,0.08)]' 
              : 'text-slate-500 hover:bg-slate-800/20 hover:text-slate-300'
          }`}
          style={{ paddingLeft: `${(level * 12) + 18}px` }}
        >
          <i className={`fas ${getFileIcon(item.name)} text-[11px] opacity-80 group-hover:opacity-100`}></i>
          <span className="truncate">{item.name}</span>
        </button>
      );
    });
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#020617] text-slate-300 font-sans overflow-hidden">
      <header className="h-14 border-b border-slate-800 bg-[#020617] flex items-center justify-between px-6 shrink-0 z-20">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20 ring-1 ring-white/10">
              <i className="fas fa-microchip text-white text-sm"></i>
            </div>
            <h1 className="text-sm font-black tracking-widest text-white uppercase italic">{t.title}</h1>
          </div>
          
          <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
            <button 
              onClick={() => setViewMode('code')}
              className={`px-4 py-1 rounded-md text-[10px] font-black tracking-widest transition-all ${viewMode === 'code' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {t.code}
            </button>
            <button 
              onClick={() => setViewMode('preview')}
              className={`px-4 py-1 rounded-md text-[10px] font-black tracking-widest transition-all ${viewMode === 'preview' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {t.preview}
            </button>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex flex-col gap-1 items-start">
            <span className="text-[8px] font-black text-slate-600 uppercase tracking-[0.2em] leading-none">{t.projectId}</span>
            <input 
              type="text" 
              value={projectId}
              onChange={(e) => setProjectId(e.target.value.toLowerCase().replace(/[^a-z0-9-_]/g, ''))}
              className="bg-slate-900 border border-slate-800 rounded px-2 py-0.5 text-[11px] font-mono text-indigo-400 focus:border-indigo-500/50 outline-none w-44 transition-all focus:ring-1 focus:ring-indigo-500/20"
              placeholder="id-do-projeto"
            />
          </div>

          <div className="flex items-center gap-4">
            <button 
              onClick={() => setLang(lang === 'pt-br' ? 'en' : 'pt-br')}
              className="text-[10px] font-black text-slate-500 hover:text-indigo-400 transition-colors uppercase"
            >
              {lang}
            </button>
            <StatusBadge status={connStatus} lang={lang} />
            <button 
              onClick={() => handleSync(vfs, projectId)}
              disabled={isSyncing || !projectId}
              className="px-4 py-1.5 bg-slate-800 border border-white/5 hover:bg-slate-700 disabled:opacity-50 text-white text-[10px] font-black rounded-lg transition-all flex items-center gap-2"
            >
              {isSyncing ? <i className="fas fa-sync fa-spin text-xs"></i> : <i className="fas fa-bolt text-indigo-400 text-xs"></i>}
              {isSyncing ? t.deploying : t.rebuild}
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Architect Side (Left Sidebar) */}
        <aside className="w-80 border-r border-slate-800 bg-[#020617] flex flex-col z-10 shadow-2xl shrink-0">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/10">
            <div>
              <h2 className="text-[10px] font-black uppercase tracking-widest text-indigo-400">{t.architect}</h2>
              <div className="flex items-center gap-2">
                 <span className={`w-1.5 h-1.5 rounded-full ${isMcpActive ? 'bg-indigo-500 shadow-[0_0_8px_#6366f1]' : 'bg-slate-700'}`}></span>
                 <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">{isMcpActive ? t.mcpConnected : t.mcpIdle}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button 
                onClick={handleNewProject}
                title={t.newProject}
                className="w-8 h-8 rounded-lg bg-slate-900 border border-white/5 hover:bg-emerald-600/20 hover:text-emerald-400 flex items-center justify-center text-slate-400 transition-all shadow-inner"
              >
                <i className="fas fa-file-circle-plus"></i>
              </button>
              <button 
                onClick={() => setShowSettings(true)}
                className="w-8 h-8 rounded-lg bg-slate-900 border border-white/5 hover:bg-indigo-600/20 hover:text-indigo-400 flex items-center justify-center text-slate-400 transition-all shadow-inner"
              >
                <i className="fas fa-plus"></i>
              </button>
            </div>
          </div>

          {/* Project Selector Section inside Left Sidebar */}
          <div className="border-b border-slate-800 bg-slate-900/5">
             <div className="px-4 py-3 flex items-center justify-between">
                <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">{t.projectsHeader}</h3>
                <i className={`fas fa-rotate text-[10px] cursor-pointer hover:text-indigo-400 transition-colors ${isRefreshingList ? 'fa-spin text-indigo-400' : 'text-slate-600'}`} onClick={fetchProjects}></i>
             </div>
             <div className="max-h-44 overflow-y-auto px-2 pb-3 space-y-1">
                {projects.map(proj => (
                  <button
                    key={proj}
                    onClick={() => handleSelectProject(proj)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-[11px] transition-all flex items-center gap-2.5 ${
                      projectId === proj 
                        ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-lg shadow-indigo-500/5' 
                        : 'text-slate-500 hover:bg-slate-800/40 hover:text-slate-300 border border-transparent'
                    }`}
                  >
                    <i className={`fas fa-folder text-[10px] ${projectId === proj ? 'text-indigo-400' : 'text-slate-700'}`}></i>
                    <span className="truncate font-bold tracking-tight uppercase">{proj}</span>
                    {projectId === proj && <i className="fas fa-check text-[8px] ml-auto text-indigo-400"></i>}
                  </button>
                ))}
                {projects.length === 0 && !isRefreshingList && (
                  <div className="px-4 py-2 text-[9px] text-slate-700 italic font-medium uppercase tracking-widest">No projects found</div>
                )}
                {isRefreshingList && (
                   <div className="px-4 py-2 text-[9px] text-indigo-500/50 italic animate-pulse font-medium uppercase tracking-widest">Listing...</div>
                )}
             </div>
          </div>
          
          <div className="flex-1 p-4 flex flex-col gap-4 overflow-y-auto">
            <div className="relative group">
              <textarea
                value={prompt}
                disabled={isGenerating}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={t.promptPlaceholder}
                className="w-full h-52 bg-slate-900/30 border border-slate-800 rounded-xl p-4 text-sm text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500/40 outline-none resize-none transition-all placeholder:text-slate-700 disabled:opacity-50 shadow-inner"
              />
              {isGenerating && (
                <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[1px] rounded-xl flex items-center justify-center">
                   <div className="flex flex-col items-center gap-2">
                     <i className="fas fa-dna fa-spin text-indigo-500 text-lg"></i>
                     <span className="text-[8px] font-black text-white/40 uppercase tracking-widest animate-pulse tracking-[0.2em]">Crafting</span>
                   </div>
                </div>
              )}
            </div>

            <button
              onClick={handleStartCraft}
              disabled={isGenerating || !prompt.trim() || !projectId}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl font-black text-[10px] tracking-[0.2em] shadow-xl shadow-indigo-600/10 active:scale-[0.98] flex items-center justify-center gap-3 transition-all ring-1 ring-white/10"
            >
              {isGenerating ? <i className="fas fa-atom fa-spin text-xs"></i> : <i className="fas fa-wand-magic-sparkles text-xs"></i>}
              {isGenerating ? t.generating : (Object.keys(vfs).length > 0 ? t.refineApp : t.craftApp)}
            </button>
            
            <div className="mt-auto">
               <h3 className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-3 flex items-center gap-2">
                  <i className="fas fa-terminal text-[10px]"></i> {t.logs}
               </h3>
               <div className="space-y-1.5 h-32 overflow-y-auto font-mono text-[10px] scrollbar-thin bg-black/20 rounded-lg p-2 border border-slate-800/50">
                {logs.map((log, i) => (
                  <div key={i} className={`flex gap-2 leading-tight ${log.type === 'error' ? 'text-rose-400' : 'text-slate-500'}`}>
                    <span className="opacity-30 flex-shrink-0">$</span>
                    <span className="break-words font-medium">{log.msg}</span>
                  </div>
                ))}
                {logs.length === 0 && <span className="text-slate-800 italic text-[9px] uppercase tracking-widest">Idle...</span>}
              </div>
            </div>
          </div>
        </aside>

        <main className="flex-1 flex overflow-hidden">
          {viewMode === 'code' ? (
            <div className="flex-1 flex overflow-hidden">
              <div className="w-64 border-r border-slate-800 bg-[#020617] flex flex-col shrink-0">
                <div className="h-9 px-4 flex items-center justify-between border-b border-slate-800/50 bg-slate-900/10 shrink-0">
                   <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-widest">{t.filesystem}</h3>
                   <div className="flex gap-2.5 opacity-60">
                      <i className="fas fa-file-circle-plus text-[10px] hover:text-indigo-400 cursor-pointer transition-colors" title="New File"></i>
                      <i className="fas fa-folder-plus text-[10px] hover:text-indigo-400 cursor-pointer transition-colors" title="New Folder"></i>
                      <i className={`fas fa-rotate text-[10px] hover:text-indigo-400 cursor-pointer transition-colors ${isLoadingFile ? 'fa-spin text-indigo-400' : ''}`} title={t.refreshProjects} onClick={handleRefreshAll}></i>
                   </div>
                </div>

                <div className="px-2 py-1.5 border-b border-slate-800/40 bg-slate-900/5">
                   <div className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-black text-slate-300 uppercase tracking-tighter truncate">
                      <i className="fas fa-chevron-down text-[7px] text-slate-600"></i>
                      <i className="fas fa-cubes text-indigo-500/80"></i>
                      <span>{projectId || t.noProjectSelected}</span>
                   </div>
                </div>

                <div className="flex-1 overflow-y-auto py-1 select-none scrollbar-thin scrollbar-thumb-slate-800">
                  {Object.keys(vfs).length > 0 ? renderTree(fileTree) : (
                    <div className="p-12 text-center">
                      <i className="fas fa-folder-open text-slate-800 text-3xl mb-4"></i>
                      <p className="text-[10px] text-slate-700 font-bold uppercase tracking-[0.2em]">{t.noFiles}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 flex flex-col bg-[#020617]">
                <div className="h-9 bg-slate-900/20 border-b border-slate-800 flex items-center px-0 shrink-0 overflow-x-auto scrollbar-none">
                  {activeFile && (
                    <div className="px-4 h-full flex items-center gap-2.5 bg-[#020617] border-t-2 border-indigo-500 border-r border-slate-800/50 min-w-[140px] shadow-[0_-5px_15px_rgba(99,102,241,0.03)] group">
                      <i className={`fas ${getFileIcon(activeFile)} text-[11px] opacity-80`}></i>
                      <span className="text-[10px] text-slate-200 font-bold truncate max-w-[100px] tracking-tight">{activeFile}</span>
                      <i className="fas fa-times text-[9px] text-slate-600 hover:text-slate-200 ml-auto cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"></i>
                    </div>
                  )}
                </div>
                
                <div className="flex-1 relative font-mono text-sm overflow-hidden group">
                  <div className="absolute left-0 top-0 bottom-0 w-12 bg-slate-950/20 border-r border-slate-800/20 flex flex-col items-center py-6 text-[10px] text-slate-700 select-none pointer-events-none z-0">
                    {Array.from({length: 100}).map((_, i) => <div key={i} className="h-5 leading-5">{i+1}</div>)}
                  </div>
                  
                  {isLoadingFile ? (
                    <div className="absolute inset-0 z-20 bg-black/40 backdrop-blur-sm flex items-center justify-center">
                      <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-6 py-3 rounded-xl shadow-2xl">
                         <i className="fas fa-circle-notch fa-spin text-indigo-500"></i>
                         <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t.loadingContent}</span>
                      </div>
                    </div>
                  ) : activeFile ? (
                    <textarea
                      value={vfs[activeFile] || ''}
                      onChange={(e) => setVfs(prev => ({ ...prev, [activeFile]: e.target.value }))}
                      className="absolute inset-0 pl-16 pr-8 py-6 w-full h-full bg-transparent text-slate-400 outline-none resize-none leading-5 selection:bg-indigo-500/30 scrollbar-thin scrollbar-thumb-slate-800 scroll-smooth z-10 font-mono text-[13px]"
                      spellCheck={false}
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
                      <i className="fas fa-code text-[120px] text-slate-200"></i>
                    </div>
                  )}
                  <div className="absolute left-[64px] top-0 bottom-0 w-px bg-slate-800/10 pointer-events-none"></div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col bg-white relative">
              {projectId ? (
                <iframe
                  key={`${projectId}-${previewKey}`}
                  src={`${BASE_URL}/${projectId}/index.html?t=${previewKey}`}
                  className="w-full h-full border-none"
                  title="Application Preview"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 gap-6">
                  <div className="w-24 h-24 bg-indigo-100 rounded-[2.5rem] flex items-center justify-center shadow-xl shadow-indigo-200/50">
                     <i className="fas fa-rocket text-indigo-600 text-4xl animate-bounce"></i>
                  </div>
                  <div className="text-center">
                    <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter mb-1">{t.noProjectSelected}</h2>
                    <p className="text-slate-400 text-sm font-medium">{t.selectProjectToStart}</p>
                  </div>
                </div>
              )}
              {(isSyncing || isGenerating) && (
                <div className="absolute inset-0 bg-white/70 backdrop-blur-[2px] flex items-center justify-center transition-all duration-500">
                  <div className="flex flex-col items-center gap-4 bg-white p-12 rounded-[2rem] shadow-2xl border border-slate-50 animate-in fade-in zoom-in duration-300">
                    <div className="w-12 h-12 border-4 border-slate-100 border-t-indigo-600 rounded-full animate-spin shadow-xl shadow-indigo-500/10"></div>
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">{isGenerating ? t.generating : t.deploying}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-sm p-8 shadow-2xl ring-1 ring-white/5 animate-in zoom-in fade-in duration-200">
            <h2 className="text-xl font-black text-white mb-1 tracking-tight">{t.setupTitle}</h2>
            <p className="text-[10px] text-slate-500 mb-8 font-bold uppercase tracking-widest">{t.setupDesc}</p>
            
            <div className="space-y-6">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">{t.n8nGateway}</label>
                <input 
                  type="text"
                  value={mcpSettings.n8nUrl}
                  onChange={(e) => setMcpSettings({...mcpSettings, n8nUrl: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-sm text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-inner"
                  placeholder="https://n8n.example.com"
                />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">{t.n8nToken}</label>
                <textarea 
                  value={mcpSettings.apiToken}
                  onChange={(e) => setMcpSettings({...mcpSettings, apiToken: e.target.value})}
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl p-4 text-[10px] text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/50 h-32 font-mono shadow-inner resize-none"
                  placeholder="Bearer Token"
                />
              </div>
            </div>
            
            <div className="flex gap-4 mt-10">
              <button onClick={() => setShowSettings(false)} className="flex-1 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 font-black text-[10px] uppercase tracking-widest transition-all">
                {t.dismiss}
              </button>
              <button onClick={handleSaveSettings} className="flex-1 py-4 rounded-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-600/20 transition-all">
                {t.setupBridge}
              </button>
            </div>
          </div>
        </div>
      )}

      {showWorkflowPicker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-md p-8 shadow-2xl ring-1 ring-white/5 animate-in slide-in-from-bottom-4 fade-in duration-300">
            <h2 className="text-xl font-black text-white mb-2 tracking-tight">{t.workflowSelection}</h2>
            <p className="text-[10px] text-slate-500 mb-6 font-bold uppercase tracking-widest">{t.selectWf}</p>
            
            <div className="space-y-2 max-h-80 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-800">
              <button 
                onClick={() => handleExecuteGeneration('')}
                className="w-full text-left p-4 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900 transition-all flex items-center justify-between group"
              >
                <div>
                  <h3 className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">{t.standalone}</h3>
                  <p className="text-[10px] text-slate-600 uppercase font-black tracking-widest">Workspace Root Architecture</p>
                </div>
                <i className="fas fa-chevron-right text-slate-800 group-hover:text-indigo-400 transition-colors"></i>
              </button>
              
              {workflows.map(wf => (
                <button 
                  key={wf.id}
                  onClick={() => handleExecuteGeneration(wf.id)}
                  className="w-full text-left p-4 rounded-2xl bg-slate-900/50 border border-slate-800 hover:border-indigo-500/50 hover:bg-slate-900 transition-all flex items-center justify-between group"
                >
                  <div>
                    <h3 className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">{wf.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${wf.active ? 'bg-indigo-500 shadow-[0_0_5px_#6366f1]' : 'bg-slate-700'}`}></span>
                      <p className="text-[9px] text-slate-600 font-black tracking-widest uppercase">{wf.id}</p>
                    </div>
                  </div>
                  <i className="fas fa-chevron-right text-slate-800 group-hover:text-indigo-400 transition-colors"></i>
                </button>
              ))}
            </div>
            
            <button onClick={() => setShowWorkflowPicker(false)} className="w-full mt-6 py-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-400 font-black text-[10px] uppercase tracking-widest transition-all">
              {t.dismiss}
            </button>
          </div>
        </div>
      )}

      <footer className="h-6 bg-[#020617] border-t border-slate-800 flex items-center justify-between px-6 text-[8px] text-slate-700 font-black uppercase tracking-[0.3em] shrink-0">
        <div className="flex items-center gap-4">
          <span>AIGoogle Studio v1.0</span>
          <span className="text-slate-800">|</span>
          <span className={isMcpActive ? 'text-indigo-900 font-bold' : 'text-slate-900'}>HYBRID MCP BRIDGE</span>
        </div>
        <div>
          {Object.keys(vfs).length} files indexed • TARGET: /{projectId || '...'}/
        </div>
      </footer>
    </div>
  );
}
