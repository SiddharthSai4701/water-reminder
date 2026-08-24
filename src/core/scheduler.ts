import type { Ladder, WindowMode } from '../shared/types.js';

const MIN = 60_000;

export interface SchedulerConfig {
  intervalMinutes: number;
  ladder: Ladder;
  workStartMinute: number;
  workEndMinute: number;
  workDays: number[];
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

export function isWithinWorkHours(now: number, cfg: SchedulerConfig): boolean {
  const d = new Date(now);
  if (!cfg.workDays.includes(d.getDay())) return false;
  const minuteOfDay = d.getHours() * 60 + d.getMinutes();
  return minuteOfDay >= cfg.workStartMinute && minuteOfDay < cfg.workEndMinute;
}

export function createInitialState(now: number, cfg: SchedulerConfig): SchedulerState {
  return {
    phase: 'idle',
    nextDueAt: now + cfg.intervalMinutes * MIN,
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
