
import React, { useState, useCallback, useEffect } from 'react';
import { VFS, FileName, ConnectionStatus, MCPSettings, Workflow, Language, ViewMode } from './types';
import { INITIAL_VFS, BASE_URL } from './constants';
import { generateAppCode } from './services/geminiService';
import { syncProject } from './services/syncService';
import { mcpService } from './services/mcpService';

const translations = {
  'pt-br': {
    title: 'AI-CRAFT STUDIO',
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
    generating: 'ARQUITETANDO...',
    workflowSelection: 'Escolha o Workflow',
    standalone: 'App Independente',
    promptPlaceholder: 'Descreva seu projeto profissional...',
    filesystem: 'Project Explorer',
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
    multiFileNotice: 'Projeto Modular Gerado'
  },
  'en': {
    title: 'AI-CRAFT STUDIO',
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
    generating: 'ARCHITECTING...',
    workflowSelection: 'Choose Workflow',
    standalone: 'Standalone App',
    promptPlaceholder: 'Describe your professional project...',
    filesystem: 'Project Explorer',
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
    multiFileNotice: 'Modular Project Generated'
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

export default function App() {
  const [lang, setLang] = useState<Language>('pt-br');
  const [viewMode, setViewMode] = useState<ViewMode>('preview');
  const [vfs, setVfs] = useState<VFS>(INITIAL_VFS);
  const [activeFile, setActiveFile] = useState<FileName>('App.tsx');
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [connStatus, setConnStatus] = useState<ConnectionStatus>(ConnectionStatus.CONNECTED);
  const [previewKey, setPreviewKey] = useState(Date.now());
  const [logs, setLogs] = useState<{msg: string, type: 'info' | 'error'}[]>([]);

  // MCP States
  const [showSettings, setShowSettings] = useState(false);
  const [showWorkflowPicker, setShowWorkflowPicker] = useState(false);
  const [mcpSettings, setMcpSettings] = useState<MCPSettings & { n8nUrl: string }>({ 
    serverUrl: 'https://lineable-maricela-primly.ngrok-free.dev', 
    apiToken: '', 
    n8nUrl: '' 
  });
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [isMcpActive, setIsMcpActive] = useState(false);

  const t = translations[lang];

  const addLog = useCallback((msg: string, type: 'info' | 'error' = 'info') => {
    setLogs(prev => [...prev.slice(-15), { msg, type }]);
  }, []);

  const handleSync = useCallback(async (currentVfs: VFS) => {
    setIsSyncing(true);
    setConnStatus(ConnectionStatus.CONNECTING);
    const result = await syncProject(currentVfs);
    if (result.success) {
      setPreviewKey(Date.now());
      setConnStatus(ConnectionStatus.CONNECTED);
    } else {
      setConnStatus(ConnectionStatus.ERROR);
      addLog(`Sync error: ${result.message}`, 'error');
    }
    setIsSyncing(false);
  }, [addLog]);

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

  useEffect(() => {
    const saved = localStorage.getItem('mcp_settings_v5');
    if (saved) {
      const parsed = JSON.parse(saved);
      setMcpSettings(parsed);
      loadWorkflows();
    }
  }, []);

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

      const newVfs = await generateAppCode(prompt, details || undefined);
      setVfs(newVfs);
      setPrompt('');
      
      const bestMain = Object.keys(newVfs).find(k => k === 'App.tsx') || Object.keys(newVfs)[0];
      setActiveFile(bestMain);

      await handleSync(newVfs);
      setViewMode('preview');
      addLog(t.multiFileNotice);
    } catch (err) {
      addLog(err instanceof Error ? err.message : "Error", 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const fileList = Object.keys(vfs).sort((a, b) => {
    const aDir = a.includes('/');
    const bDir = b.includes('/');
    if (aDir && !bDir) return -1;
    if (!aDir && bDir) return 1;
    return a.localeCompare(b);
  });

  const getFileIcon = (file: string) => {
    if (file.endsWith('.html')) return 'fa-html5 text-orange-500';
    if (file.endsWith('.tsx')) return 'fa-react text-sky-400';
    if (file.endsWith('.ts')) return 'fa-code text-indigo-400';
    if (file.includes('services/')) return 'fa-gears text-indigo-400';
    if (file.includes('components/')) return 'fa-puzzle-piece text-violet-400';
    return 'fa-file-code text-slate-500';
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#020617] text-slate-300 font-sans overflow-hidden">
      {/* Header */}
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

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setLang(lang === 'pt-br' ? 'en' : 'pt-br')}
            className="text-[10px] font-black text-slate-500 hover:text-indigo-400 transition-colors uppercase"
          >
            {lang}
          </button>
          <StatusBadge status={connStatus} lang={lang} />
          <button 
            onClick={() => handleSync(vfs)}
            disabled={isSyncing}
            className="px-4 py-1.5 bg-slate-800 border border-white/5 hover:bg-slate-700 disabled:opacity-50 text-white text-[10px] font-black rounded-lg transition-all"
          >
            {isSyncing ? <i className="fas fa-sync fa-spin"></i> : <i className="fas fa-bolt text-indigo-400"></i>}
          </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Architect Side */}
        <aside className="w-80 border-r border-slate-800 bg-[#020617] flex flex-col z-10 shadow-2xl">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/10">
            <div>
              <h2 className="text-[10px] font-black uppercase tracking-widest text-indigo-400">{t.architect}</h2>
              <div className="flex items-center gap-2">
                 <span className={`w-1.5 h-1.5 rounded-full ${isMcpActive ? 'bg-indigo-500 shadow-[0_0_8px_#6366f1]' : 'bg-slate-700'}`}></span>
                 <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tighter">{isMcpActive ? t.mcpConnected : t.mcpIdle}</p>
              </div>
            </div>
            <button 
              onClick={() => setShowSettings(true)}
              className="w-8 h-8 rounded-lg bg-slate-900 border border-white/5 hover:bg-indigo-600/20 hover:text-indigo-400 flex items-center justify-center text-slate-400 transition-all shadow-inner"
            >
              <i className="fas fa-plus"></i>
            </button>
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
              disabled={isGenerating || !prompt.trim()}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 text-white rounded-xl font-black text-[10px] tracking-[0.2em] shadow-xl shadow-indigo-600/10 active:scale-[0.98] flex items-center justify-center gap-3 transition-all ring-1 ring-white/10"
            >
              {isGenerating ? <i className="fas fa-atom fa-spin"></i> : <i className="fas fa-wand-magic-sparkles"></i>}
              {isGenerating ? t.generating : t.craftApp}
            </button>

            {viewMode === 'code' && (
              <div className="mt-4">
                <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <i className="fas fa-folder-tree text-xs"></i> {t.filesystem}
                </h3>
                <div className="space-y-1">
                  {fileList.map(file => (
                    <button
                      key={file}
                      onClick={() => setActiveFile(file)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-[10px] transition-all flex items-center justify-between group overflow-hidden ${
                        activeFile === file ? 'bg-indigo-500/10 text-indigo-400 ring-1 ring-indigo-500/20 shadow-lg border-l-2 border-indigo-500' : 'text-slate-500 hover:bg-slate-900/50 hover:text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 overflow-hidden">
                         <i className={`fas ${getFileIcon(file)} opacity-70`}></i>
                         <span className="font-bold truncate" title={file}>{file}</span>
                      </div>
                      {activeFile === file && <div className="w-1 h-1 rounded-full bg-indigo-500"></div>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-800 bg-slate-950/40">
            <h3 className="text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] mb-3">{t.logs}</h3>
            <div className="space-y-2 h-32 overflow-y-auto font-mono text-[9px] scrollbar-thin">
              {logs.map((log, i) => (
                <div key={i} className={`flex gap-3 leading-relaxed border-l pl-2 ${log.type === 'error' ? 'border-rose-500 text-rose-400/80' : 'border-indigo-500/30 text-slate-500'}`}>
                  <span className="break-words font-medium">{log.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* Center Workspace */}
        <main className="flex-1 flex flex-col bg-[#020617] relative">
          {viewMode === 'code' ? (
            <div className="flex flex-col h-full">
              <div className="h-10 bg-slate-950/20 border-b border-slate-800 flex items-center px-6 shrink-0">
                <div className="text-[10px] text-slate-500 uppercase font-black tracking-widest flex items-center gap-3">
                  <i className="fas fa-file-code text-indigo-500"></i>
                  <span className="text-slate-200">{activeFile}</span>
                </div>
              </div>
              <div className="flex-1 relative font-mono text-sm overflow-hidden bg-[#020617]">
                <div className="absolute left-0 top-0 bottom-0 w-10 bg-slate-950/10 border-r border-slate-800/30 flex flex-col items-center py-8 text-[9px] text-slate-800 select-none pointer-events-none">
                  {Array.from({length: 40}).map((_, i) => <div key={i} className="h-6 leading-6">{i+1}</div>)}
                </div>
                <textarea
                  value={vfs[activeFile] || ''}
                  onChange={(e) => setVfs(prev => ({ ...prev, [activeFile]: e.target.value }))}
                  className="absolute inset-0 pl-14 pr-8 py-8 w-full h-full bg-transparent text-slate-400 outline-none resize-none leading-relaxed selection:bg-indigo-500/20 scrollbar-thin scroll-smooth"
                  spellCheck={false}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full bg-white relative">
              <iframe
                key={previewKey}
                src={`${BASE_URL}?t=${previewKey}`}
                className="w-full h-full border-none"
                title="Application Preview"
              />
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

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-sm p-8 shadow-2xl ring-1 ring-white/5">
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

      {/* Workflow Picker */}
      {showWorkflowPicker && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl w-full max-w-md p-8 shadow-2xl ring-1 ring-white/5">
            <h2 className="text-xl font-black text-white mb-2 tracking-tight">{t.workflowSelection}</h2>
            <p className="text-[10px] text-slate-500 mb-6 font-bold uppercase tracking-widest">{t.selectWf}</p>
            
            <div className="space-y-2 max-h-80 overflow-y-auto pr-2 scrollbar-thin">
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

      {/* Minimal Footer */}
      <footer className="h-6 bg-[#020617] border-t border-slate-800 flex items-center justify-between px-6 text-[8px] text-slate-700 font-black uppercase tracking-[0.3em]">
        <div className="flex items-center gap-4">
          <span>AI-CRAFT ROOT-MODULAR v3.2</span>
          <span className="text-slate-800">|</span>
          <span className={isMcpActive ? 'text-indigo-900' : 'text-slate-900'}>HYBRID MCP BRIDGE</span>
        </div>
        <div>
          {fileList.length} workspace files
        </div>
      </footer>
    </div>
  );
}
