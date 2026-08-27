import { BrowserWindow, app } from 'electron';
import { join } from 'node:path';
import type { Config } from '../shared/types.js';

export class SettingsWindow {
  private window: BrowserWindow | null = null;

  open(): void {
    if (this.window !== null && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      // With the dock hidden (LSUIElement), a plain focus() often leaves the
      // window behind the frontmost app. This is the documented Phase 2 check.
      if (process.platform === 'darwin') app.focus({ steal: true });
      return;
    }

    const window = new BrowserWindow({
      width: 720,
      height: 560,
      minWidth: 600,
      minHeight: 460,
      show: false,
      title: 'Water Reminder Settings',
      webPreferences: {
        preload: join(__dirname, '../preload/settings.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    window.on('ready-to-show', () => {
      window.show();
      if (process.platform === 'darwin') app.focus({ steal: true });
    });
    window.on('closed', () => {
      this.window = null;
    });

    if (process.env.ELECTRON_RENDERER_URL !== undefined) {
      void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/settings.html`);
    } else {
      void window.loadFile(join(__dirname, '../renderer/settings.html'));
    }

    this.window = window;
  }

  broadcast(config: Config): void {
    if (this.window === null || this.window.isDestroyed()) return;
    this.window.webContents.send('settings:changed', config);
  }

  destroy(): void {
    this.window?.destroy();
    this.window = null;
  }
}
