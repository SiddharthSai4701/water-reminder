import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import type { CornerPosition, PopupPayload } from '../shared/types.js';
import { popupBounds } from '../core/geometry.js';

export class PopupManager {
  private window: BrowserWindow | null = null;
  private ready = false;
  private pending: PopupPayload | null = null;

  private create(): BrowserWindow {
    const window = new BrowserWindow({
      width: 340,
      height: 150,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    window.webContents.on('did-finish-load', () => {
      this.ready = true;
      if (this.pending !== null) {
        window.webContents.send('popup:show', this.pending);
        this.pending = null;
      }
    });

    window.on('closed', () => {
      this.window = null;
      this.ready = false;
    });

    if (process.env.ELECTRON_RENDERER_URL !== undefined) {
      void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/popup.html`);
    } else {
      void window.loadFile(join(__dirname, '../renderer/popup.html'));
    }

    this.window = window;
    return window;
  }

  show(payload: PopupPayload, corner: CornerPosition): void {
    const window = this.window ?? this.create();

    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    window.setBounds(popupBounds(payload.mode, display.workArea, corner));

    // The corner stage must never interrupt typing; the louder stages must sit
    // above everything, including full-screen apps.
    window.setAlwaysOnTop(true, payload.mode === 'fullscreen' ? 'screen-saver' : 'floating');

    if (this.ready) {
      window.webContents.send('popup:show', payload);
    } else {
      this.pending = payload;
    }

    if (payload.mode === 'corner') {
      window.showInactive();
    } else {
      window.show();
      window.focus();
    }
  }

  hide(): void {
    this.window?.hide();
  }

  destroy(): void {
    this.window?.destroy();
    this.window = null;
    this.ready = false;
  }
}
