import { app, ipcMain, powerMonitor } from 'electron';
import type { Config, Pack, PopupPayload } from '../shared/types.js';
import {
  createInitialState,
  onDrank,
  onSkip,
  onSnooze,
  setDnd,
  tick,
  type SchedulerConfig,
  type SchedulerState,
  type Transition,
} from '../core/scheduler.js';
import { pickLine, pushRecent, type PickContext } from '../core/messages.js';
import {
  currentStreak,
  glassesOnDay,
  goalPct,
  mlOnDay,
  startOfLocalDay,
} from '../core/stats.js';
import { loadConfig, saveConfig } from './config.js';
import { appendEvent, readEvents } from './log.js';
import { loadPacks } from './packs.js';
import { createTray } from './tray.js';
import { PopupManager } from './windows.js';

const TICK_MS = 1000;

let config: Config;
let packs: Pack[] = [];
let state: SchedulerState;
let recent: string[] = [];
let popups: PopupManager;
let tray: ReturnType<typeof createTray> | null = null;

function schedulerConfig(): SchedulerConfig {
  return {
    intervalMinutes: config.schedule.intervalMinutes,
    ladder: config.ladder,
    workStartMinute: config.schedule.workStartMinute,
    workEndMinute: config.schedule.workEndMinute,
    workDays: config.schedule.workDays,
  };
}

function pickContext(now: number): PickContext {
  const events = readEvents();
  const today = startOfLocalDay(now);
  const ml = mlOnDay(events, today);
  return {
    glasses: glassesOnDay(events, today),
    streak: currentStreak(events, config.goalMl, now),
    goalPct: goalPct(ml, config.goalMl),
  };
}

export function applyEffects(transition: Transition): void {
  state = transition.state;
  const now = Date.now();

  for (const effect of transition.effects) {
    if (effect.type === 'hide') {
      popups.hide();
      continue;
    }

    const ctx = pickContext(now);
    const picked = pickLine(packs, effect.stageIndex, config.ladder.length, recent, ctx);
    recent = pushRecent(recent, picked.key);

    const payload: PopupPayload = {
      line: picked.text,
      stageIndex: effect.stageIndex,
      mode: effect.mode,
      glasses: ctx.glasses,
      goalPct: ctx.goalPct,
      defaultSnoozeMinutes: config.defaultSnoozeMinutes,
    };
    popups.show(payload, config.cornerPosition);
  }

  // Only on a real transition. The 30s timer in the tray keeps the countdown
  // current; rebuilding a native menu every second is waste and can disturb
  // an open menu.
  if (transition.effects.length > 0) tray?.refresh();
}

export const actions = {
  drank(): void {
    const now = Date.now();
    appendEvent({ ts: now, type: 'drank', ml: config.glassMl });
    applyEffects(onDrank(state, now, schedulerConfig()));
  },
  skip(): void {
    const now = Date.now();
    appendEvent({ ts: now, type: 'skip' });
    applyEffects(onSkip(state, now, schedulerConfig()));
  },
  snooze(minutes: number): void {
    // The renderer is first-party and sandboxed, but this is the main
    // process's only unchecked external input, and a NaN would set nextDueAt
    // to NaN — every later comparison false, the reminder silently never
    // firing again for the life of the process.
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 240) return;
    const now = Date.now();
    appendEvent({ ts: now, type: 'snooze', minutes });
    applyEffects(onSnooze(state, now, minutes, schedulerConfig()));
  },
  setDnd(until: number | null): void {
    config = saveConfig(config, { dndUntil: until });
    applyEffects(setDnd(state, until, Date.now(), schedulerConfig()));
  },
  refreshConfig(): void {
    config = loadConfig();
    packs = loadPacks(config.activePackIds, config.customLines);
  },
  nextDueAt(): number {
    return state.nextDueAt;
  },
  state(): SchedulerState {
    return state;
  },
  config(): Config {
    return config;
  },
};

function startLoop(): void {
  setInterval(() => {
    applyEffects(tick(state, Date.now(), schedulerConfig()));
    // The core decides whether a reminder is owed; the shell checks whether
    // it is actually on screen. A due reminder with no visible window means
    // something removed it, and the promise is that nothing can.
    if (state.phase === 'due') popups.ensureVisible();
  }, TICK_MS);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  void app.whenReady().then(() => {
    config = loadConfig();
    packs = loadPacks(config.activePackIds, config.customLines);
    popups = new PopupManager();
    state = createInitialState(Date.now(), schedulerConfig());

    // Packaged builds only. In dev, process.execPath is node_modules' bare
    // electron.exe with no app path, so registering it means every login
    // launches Electron's default welcome window instead of this app.
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: config.autostart, args: ['--hidden'] });
    }

    tray = createTray({
      state: () => actions.state(),
      config: () => actions.config(),
      drank: () => actions.drank(),
      setDnd: (until) => actions.setDnd(until),
      reloadConfig: () => actions.refreshConfig(),
      openSettings: () => {
        // Phase 3 opens the settings window here. Until then, edit config.json.
        console.log('Settings live in config.json until Phase 3.');
      },
    });

    app.on('before-quit', () => {
      // The popup vetoes `close` so a reminder cannot be dismissed by
      // Alt+F4. Quitting is the one legitimate close, and without this the
      // veto would make the app unquittable while a reminder is up.
      popups.destroy();
      tray?.destroy();
    });

    if (config.dndUntil !== null && config.dndUntil > Date.now()) {
      applyEffects(setDnd(state, config.dndUntil, Date.now(), schedulerConfig()));
    }

    ipcMain.on('popup:drank', () => actions.drank());
    ipcMain.on('popup:skip', () => actions.skip());
    ipcMain.on('popup:snooze', (_event, minutes: number) => actions.snooze(minutes));

    // Waking from sleep must produce one reminder, never a burst.
    powerMonitor.on('resume', () => {
      applyEffects(tick(state, Date.now(), schedulerConfig()));
    });

    app.dock?.hide();
    startLoop();
  });

  // A tray app has no windows to keep alive; never quit when none are open.
  app.on('window-all-closed', () => {
    // Intentionally empty.
  });
}
