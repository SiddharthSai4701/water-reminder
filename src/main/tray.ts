import { Menu, Tray, app, nativeImage } from 'electron';
import { join } from 'node:path';
import type { Config } from '../shared/types.js';

export interface TrayDeps {
  nextDueAt(): number;
  state(): { phase: string };
  config(): Config;
  drank(): void;
  setDnd(until: number | null): void;
  openSettings(): void;
}

const MIN = 60_000;

function iconPath(): string {
  const file = process.platform === 'darwin' ? 'icon-16.png' : 'icon-32.png';
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', file)
    : join(app.getAppPath(), 'resources', file);
}

function countdownLabel(deps: TrayDeps): string {
  const phase = deps.state().phase;
  if (phase === 'paused') return 'Paused';
  if (phase === 'due') return 'Waiting on you';
  const remaining = deps.nextDueAt() - Date.now();
  if (remaining <= 0) return 'Due now';
  return `Next drink in ${Math.max(1, Math.round(remaining / MIN))} min`;
}

function startOfTomorrow(): number {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function createTray(deps: TrayDeps): { refresh(): void; destroy(): void } {
  const image = nativeImage.createFromPath(iconPath());
  image.setTemplateImage(process.platform === 'darwin');

  const tray = new Tray(image);
  tray.setToolTip('Water Reminder');

  function refresh(): void {
    const config = deps.config();
    const paused = config.dndUntil !== null && config.dndUntil > Date.now();

    tray.setToolTip(`Water Reminder — ${countdownLabel(deps)}`);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: countdownLabel(deps), enabled: false },
        { type: 'separator' },
        { label: 'Drink now', click: () => deps.drank() },
        { type: 'separator' },
        { label: 'Pause 30 minutes', click: () => deps.setDnd(Date.now() + 30 * MIN) },
        { label: 'Pause 1 hour', click: () => deps.setDnd(Date.now() + 60 * MIN) },
        { label: 'Pause until tomorrow', click: () => deps.setDnd(startOfTomorrow()) },
        { label: 'Resume reminders', enabled: paused, click: () => deps.setDnd(null) },
        { type: 'separator' },
        { label: 'Settings…', click: () => deps.openSettings() },
        { label: 'Quit', click: () => app.quit() },
      ]),
    );
  }

  refresh();
  const timer = setInterval(refresh, 30_000);

  return {
    refresh,
    destroy(): void {
      clearInterval(timer);
      tray.destroy();
    },
  };
}
