import { contextBridge, ipcRenderer } from 'electron';
import type { Config } from '../shared/types.js';
import type { PackSummary, PackWriteResult } from '../shared/types.js';

const api = {
  get(): Promise<{ config: Config; packs: PackSummary[] }> {
    return ipcRenderer.invoke('settings:get') as Promise<{ config: Config; packs: PackSummary[] }>;
  },
  patch(partial: Partial<Config>): Promise<Config> {
    return ipcRenderer.invoke('settings:patch', partial) as Promise<Config>;
  },
  readPack(id: string): Promise<string> {
    return ipcRenderer.invoke('settings:packs:read', id) as Promise<string>;
  },
  writePack(id: string, text: string): Promise<PackWriteResult> {
    return ipcRenderer.invoke('settings:packs:write', id, text) as Promise<PackWriteResult>;
  },
  revertPack(id: string): Promise<PackSummary[]> {
    return ipcRenderer.invoke('settings:packs:revert', id) as Promise<PackSummary[]>;
  },
  revealPacks(): void {
    ipcRenderer.send('settings:packs:reveal');
  },
  onChanged(callback: (config: Config) => void): () => void {
    const handler = (_e: unknown, config: Config): void => callback(config);
    ipcRenderer.on('settings:changed', handler);
    // Returned so the React effect can clean up. The popup preload's missing
    // remover double-registers under StrictMode; do not repeat that here.
    return () => ipcRenderer.removeListener('settings:changed', handler);
  },
};

contextBridge.exposeInMainWorld('waterSettings', api);

export type SettingsApi = typeof api;
