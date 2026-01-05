
export type Language = 'pt-br' | 'en';
export type ViewMode = 'code' | 'preview';

/**
 * VFS now supports any file path as a key (e.g., 'src/components/Header.tsx')
 */
export type VFS = Record<string, string>;

export type FileName = string;

export interface SyncResponse {
  success: boolean;
  message?: string;
}

export enum ConnectionStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  ERROR = 'ERROR'
}

export interface MCPSettings {
  serverUrl: string;
  apiToken: string;
}

export interface Workflow {
  id: string;
  name: string;
  nodes?: any[];
  schema?: any;
  active?: boolean;
}
