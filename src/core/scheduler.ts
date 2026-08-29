import type { Ladder, WindowMode } from '../shared/types.js';

const MIN = 60_000;

/** The part of the schedule that decides whether reminders may fire at all. */
export interface WorkHours {
  workStartMinute: number;
  workEndMinute: number;
  workDays: number[];
}

export interface SchedulerConfig extends WorkHours {
  intervalMinutes: number;
  ladder: Ladder;
}

export type SchedulerPhase = 'idle' | 'due' | 'snoozed' | 'paused';

export interface SchedulerState {
  phase: SchedulerPhase;
  /** Epoch ms at which the next reminder is due. Meaningful in idle and snoozed. */
  nextDueAt: number;
  /** Epoch ms at which the current due period began. Meaningful in due. */
  dueSince: number | null;
  stageIndex: number;
  pausedUntil: number | null;
}

export type Effect =
  | { type: 'show'; stageIndex: number; mode: WindowMode; sound: boolean }
  | { type: 'hide' };

export interface Transition {
  state: SchedulerState;
  effects: Effect[];
}

/** Cumulative offsets in ms from the moment the reminder came due. */
export function stageOffsets(ladder: Ladder): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const stage of ladder) {
    acc += stage.delayMinutes * MIN;
    offsets.push(acc);
  }
  return offsets;
}

export function isWithinWorkHours(now: number, cfg: WorkHours): boolean {
  const d = new Date(now);
  if (!cfg.workDays.includes(d.getDay())) return false;
  const minuteOfDay = d.getHours() * 60 + d.getMinutes();

  // An overnight window is a window on each of its listed days, not a window
  // that drags the previous day's membership across midnight. "Reminders on
  // Wednesday" then means what a person expects it to mean.
  const wraps = cfg.workEndMinute <= cfg.workStartMinute;
  return wraps
    ? minuteOfDay >= cfg.workStartMinute || minuteOfDay < cfg.workEndMinute
    : minuteOfDay >= cfg.workStartMinute && minuteOfDay < cfg.workEndMinute;
}

/**
 * `persistedNextDueAt` is the value carried across a restart. A past value
 * produces exactly one reminder on the first tick rather than a burst — the
 * same collapse rule that applies to waking from sleep.
 *
 * A future value is capped at one interval from now. Nothing legitimate can
 * be further out than that, and a clock that jumps forward while the app runs
 * persists one that is: before this value was persisted, a relaunch re-armed
 * from `now` and healed it, whereas now it would outlive every restart and
 * the app would simply never fire again.
 */
export function createInitialState(
  now: number,
  cfg: SchedulerConfig,
  persistedNextDueAt: number | null = null,
): SchedulerState {
  const armed = now + cfg.intervalMinutes * MIN;
  const usable =
    typeof persistedNextDueAt === 'number' && Number.isFinite(persistedNextDueAt)
      ? Math.min(persistedNextDueAt, armed)
      : armed;

  return {
    phase: 'idle',
    nextDueAt: usable,
    dueSince: null,
    stageIndex: 0,
    pausedUntil: null,
  };
}

function showEffect(ladder: Ladder, index: number): Effect {
  const stage = ladder[index];
  return { type: 'show', stageIndex: index, mode: stage.mode, sound: stage.sound === true };
}

function becomeDue(state: SchedulerState, now: number, cfg: SchedulerConfig): Transition {
  return {
    state: { ...state, phase: 'due', dueSince: now, stageIndex: 0, pausedUntil: null },
    effects: [showEffect(cfg.ladder, 0)],
  };
}

export function tick(state: SchedulerState, now: number, cfg: SchedulerConfig): Transition {
  switch (state.phase) {
    case 'paused': {
      if (state.pausedUntil === null || now < state.pausedUntil) {
        return { state, effects: [] };
      }
      // DND expired: re-arm a full interval out. Missed intervals never queue.
      return { state: createInitialState(now, cfg), effects: [] };
    }

    case 'idle':
    case 'snoozed': {
      if (now < state.nextDueAt) return { state, effects: [] };
      if (!isWithinWorkHours(now, cfg)) return { state, effects: [] };
      return becomeDue(state, now, cfg);
    }

    case 'due': {
      const offsets = stageOffsets(cfg.ladder);
      const elapsed = now - (state.dueSince ?? now);
      let target = state.stageIndex;
      for (let i = state.stageIndex + 1; i < cfg.ladder.length; i++) {
        if (elapsed >= offsets[i]) target = i;
      }
      if (target === state.stageIndex) return { state, effects: [] };
      return {
        state: { ...state, stageIndex: target },
        effects: [showEffect(cfg.ladder, target)],
      };
    }
  }
}

/**
 * Clear the popup and re-arm a full interval from `now`. The action handlers
 * ignore their previous state by design — re-deriving from `now` is exactly
 * what stops missed intervals from queueing up.
 */
function rearm(now: number, cfg: SchedulerConfig): Transition {
  return { state: createInitialState(now, cfg), effects: [{ type: 'hide' }] };
}

export function onDrank(_state: SchedulerState, now: number, cfg: SchedulerConfig): Transition {
  return rearm(now, cfg);
}

export function onSkip(_state: SchedulerState, now: number, cfg: SchedulerConfig): Transition {
  return rearm(now, cfg);
}

export function onSnooze(
  _state: SchedulerState,
  now: number,
  minutes: number,
  _cfg: SchedulerConfig,
): Transition {
  return {
    state: {
      phase: 'snoozed',
      nextDueAt: now + minutes * MIN,
      dueSince: null,
      stageIndex: 0,
      pausedUntil: null,
    },
    effects: [{ type: 'hide' }],
  };
}

/**
 * Re-aims a running scheduler after the config changed under it.
 *
 * A changed interval rescales from the last reminder rather than from `now`:
 * restarting the countdown would mean every visit to settings silently buys
 * a fresh full interval, which is easy to do by accident and impossible to
 * notice. The anchor is derivable, so no new state is needed.
 */
export function onConfigChange(
  state: SchedulerState,
  oldCfg: SchedulerConfig,
  newCfg: SchedulerConfig,
  now: number,
): Transition {
  switch (state.phase) {
    // A pause is an explicit instruction with an explicit end. Nothing in
    // settings should shorten or lengthen it.
    case 'paused':
      return { state, effects: [] };

    // So is a snooze: the user named the delay.
    case 'snoozed':
      return { state, effects: [] };

    case 'idle': {
      if (newCfg.intervalMinutes === oldCfg.intervalMinutes) return { state, effects: [] };
      const anchor = state.nextDueAt - oldCfg.intervalMinutes * MIN;
      return { state: { ...state, nextDueAt: anchor + newCfg.intervalMinutes * MIN }, effects: [] };
    }

    case 'due': {
      // Re-derive the stage from elapsed time so a louder ladder escalates
      // rather than restarting at stage 0.
      const offsets = stageOffsets(newCfg.ladder);
      const elapsed = now - (state.dueSince ?? now);
      let target = 0;
      for (let i = 1; i < newCfg.ladder.length; i++) {
        if (elapsed >= offsets[i]) target = i;
      }
      if (target === state.stageIndex) return { state, effects: [] };
      return {
        state: { ...state, stageIndex: target },
        effects: [showEffect(newCfg.ladder, target)],
      };
    }
  }
}

export function setDnd(
  _state: SchedulerState,
  until: number | null,
  now: number,
  cfg: SchedulerConfig,
): Transition {
  if (until === null) {
    return rearm(now, cfg);
  }
  return {
    state: {
      phase: 'paused',
      nextDueAt: now + cfg.intervalMinutes * MIN,
      dueSince: null,
      stageIndex: 0,
      pausedUntil: until,
    },
    effects: [{ type: 'hide' }],
  };
}
