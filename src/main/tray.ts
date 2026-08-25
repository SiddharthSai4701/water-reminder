import { Menu, Tray, app, nativeImage } from 'electron';
import { join } from 'node:path';
import { countdownLabel } from '../core/labels.js';
import { addLocalDays } from '../core/stats.js';
import type { SchedulerState } from '../core/scheduler.js';
import type { Config } from '../shared/types.js';

export interface TrayDeps {
  state(): SchedulerState;
  config(): Config;
  drank(): void;
  setDnd(until: number | null): void;
  reloadConfig(): void;
  openSettings(): void;
}

const MIN = 60_000;

function iconPath(): string {
  const file = process.platform === 'darwin' ? 'icon-16.png' : 'icon-32.png';
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', file)
    : join(app.getAppPath(), 'resources', file);
}

function label(deps: TrayDeps): string {
  return countdownLabel(deps.state(), Date.now(), deps.config().schedule);
}

export function createTray(deps: TrayDeps): { refresh(): void; destroy(): void } {
  const image = nativeImage.createFromPath(iconPath());
  image.setTemplateImage(process.platform === 'darwin');

  const tray = new Tray(image);

  function refresh(): void {
    const config = deps.config();
    const paused = config.dndUntil !== null && config.dndUntil > Date.now();

    tray.setToolTip(`Water Reminder — ${label(deps)}`);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: label(deps), enabled: false },
        { type: 'separator' },
        { label: 'Drink now', click: () => deps.drank() },
        { type: 'separator' },
        { label: 'Pause 30 minutes', click: () => deps.setDnd(Date.now() + 30 * MIN) },
        { label: 'Pause 1 hour', click: () => deps.setDnd(Date.now() + 60 * MIN) },
        // addLocalDays lands on the next local midnight and is already covered
        // by the core's tests — "until tomorrow" is a real rule with rollover
        // and DST edges, so it does not get a private copy in the view layer.
        { label: 'Pause until tomorrow', click: () => deps.setDnd(addLocalDays(Date.now(), 1)) },
        { label: 'Resume reminders', enabled: paused, click: () => deps.setDnd(null) },
        { type: 'separator' },
        { label: 'Reload config file', click: () => deps.reloadConfig() },
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
