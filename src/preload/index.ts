import { contextBridge, ipcRenderer } from 'electron';
import type { PopupPayload } from '../shared/types.js';

const api = {
  onShow(callback: (payload: PopupPayload) => void): void {
    ipcRenderer.on('popup:show', (_event, payload: PopupPayload) => callback(payload));
  },
  drank(): void {
    ipcRenderer.send('popup:drank');
  },
  snooze(minutes: number): void {
    ipcRenderer.send('popup:snooze', minutes);
  },
  skip(): void {
    ipcRenderer.send('popup:skip');
  },
};

contextBridge.exposeInMainWorld('water', api);

export type WaterApi = typeof api;
