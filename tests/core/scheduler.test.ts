import { describe, it, expect } from 'vitest';
import { PRESET_LADDERS } from '../../src/core/ladder.js';
import {
  createInitialState,
  isWithinWorkHours,
  onDrank,
  onSkip,
  onSnooze,
  setDnd,
  stageOffsets,
  tick,
  type SchedulerConfig,
  type SchedulerState,
} from '../../src/core/scheduler.js';

const MIN = 60_000;

/** Monday 2026-08-24 10:00 local time — inside the default work window. */
const MONDAY_10AM = new Date(2026, 7, 24, 10, 0, 0, 0).getTime();

const cfg: SchedulerConfig = {
  intervalMinutes: 45,
  ladder: PRESET_LADDERS.standard,
  workStartMinute: 9 * 60,
  workEndMinute: 18 * 60,
  workDays: [1, 2, 3, 4, 5],
};

/** Run tick repeatedly, collecting every effect, to simulate the 1s main loop. */
function run(state: SchedulerState, times: number[], c: SchedulerConfig = cfg) {
  let s = state;
  const effects = [];
  for (const t of times) {
    const out = tick(s, t, c);
    s = out.state;
    effects.push(...out.effects);
  }
  return { state: s, effects };
}

describe('stageOffsets', () => {
  it('accumulates relative delays into absolute offsets', () => {
    expect(stageOffsets(PRESET_LADDERS.standard)).toEqual([0, 3 * MIN, 8 * MIN]);
  });
});

describe('isWithinWorkHours', () => {
  it('is true inside the window on a work day', () => {
    expect(isWithinWorkHours(MONDAY_10AM, cfg)).toBe(true);
  });

  it('is false before the window opens', () => {
    const early = new Date(2026, 7, 24, 8, 30).getTime();
    expect(isWithinWorkHours(early, cfg)).toBe(false);
  });

  it('is false on a non-work day', () => {
    const sunday = new Date(2026, 7, 23, 10, 0).getTime();
    expect(isWithinWorkHours(sunday, cfg)).toBe(false);
  });
});

describe('firing', () => {
  it('does not fire before the interval elapses', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const { effects } = run(s, [MONDAY_10AM + 44 * MIN]);
    expect(effects).toEqual([]);
  });

  it('fires the first stage when the interval elapses', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const out = run(s, [MONDAY_10AM + 45 * MIN]);
    expect(out.effects).toEqual([
      { type: 'show', stageIndex: 0, mode: 'corner', sound: false },
    ]);
    expect(out.state.phase).toBe('due');
  });

  it('does not re-show the same stage on later ticks', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const due = MONDAY_10AM + 45 * MIN;
    const out = run(s, [due, due + 1000, due + 2000]);
    expect(out.effects).toHaveLength(1);
  });
});

describe('escalation', () => {
  it('climbs to center at 3m and fullscreen at 8m after coming due', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const due = MONDAY_10AM + 45 * MIN;
    const out = run(s, [due, due + 3 * MIN, due + 8 * MIN]);
    expect(out.effects).toEqual([
      { type: 'show', stageIndex: 0, mode: 'corner', sound: false },
      { type: 'show', stageIndex: 1, mode: 'center', sound: false },
      { type: 'show', stageIndex: 2, mode: 'fullscreen', sound: false },
    ]);
  });

  it('holds the final stage indefinitely without new effects', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const due = MONDAY_10AM + 45 * MIN;
    // Ticks every stage boundary, as the 1s production loop does, then waits.
    const out = run(s, [due, due + 3 * MIN, due + 8 * MIN, due + 90 * MIN]);
    expect(out.effects).toHaveLength(3);
    expect(out.state.stageIndex).toBe(2);
    expect(out.state.phase).toBe('due');
  });

  it('skips intermediate stages when ticks are sparse', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const due = MONDAY_10AM + 45 * MIN;
    const out = run(s, [due, due + 20 * MIN]);
    expect(out.effects[1]).toEqual({
      type: 'show', stageIndex: 2, mode: 'fullscreen', sound: false,
    });
  });

  it('never escalates on a single-stage gentle ladder but stays due', () => {
    const gentle = { ...cfg, ladder: PRESET_LADDERS.gentle };
    const s = createInitialState(MONDAY_10AM, gentle);
    const due = MONDAY_10AM + 45 * MIN;
    const out = run(s, [due, due + 60 * MIN], gentle);
    expect(out.effects).toHaveLength(1);
    expect(out.state.phase).toBe('due');
  });

  it('reports sound on a stage configured for it', () => {
    const loud = { ...cfg, ladder: PRESET_LADDERS.relentless };
    const s = createInitialState(MONDAY_10AM, loud);
    const due = MONDAY_10AM + 45 * MIN;
    const out = run(s, [due, due + 5 * MIN], loud);
    expect(out.effects[1]).toEqual({
      type: 'show', stageIndex: 2, mode: 'fullscreen', sound: true,
    });
  });
});

describe('actions', () => {
  it('drank hides the popup and re-arms one interval out', () => {
    const due = MONDAY_10AM + 45 * MIN;
    const { state } = run(createInitialState(MONDAY_10AM, cfg), [due]);
    const out = onDrank(state, due, cfg);
    expect(out.effects).toEqual([{ type: 'hide' }]);
    expect(out.state.phase).toBe('idle');
    expect(out.state.nextDueAt).toBe(due + 45 * MIN);
  });

  it('skip behaves like drank for scheduling', () => {
    const due = MONDAY_10AM + 45 * MIN;
    const { state } = run(createInitialState(MONDAY_10AM, cfg), [due]);
    const out = onSkip(state, due, cfg);
    expect(out.state.phase).toBe('idle');
    expect(out.state.nextDueAt).toBe(due + 45 * MIN);
  });

  it('snooze hides, then re-fires at stage 0 after the delay', () => {
    const due = MONDAY_10AM + 45 * MIN;
    const first = run(createInitialState(MONDAY_10AM, cfg), [due, due + 8 * MIN]);
    const snoozed = onSnooze(first.state, due + 8 * MIN, 10, cfg);
    expect(snoozed.effects).toEqual([{ type: 'hide' }]);
    expect(snoozed.state.phase).toBe('snoozed');

    const after = run(snoozed.state, [due + 17 * MIN, due + 18 * MIN]);
    expect(after.effects).toEqual([
      { type: 'show', stageIndex: 0, mode: 'corner', sound: false },
    ]);
  });
});

describe('do not disturb', () => {
  it('pauses, suppresses firing, and re-arms after expiry', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const paused = setDnd(s, MONDAY_10AM + 60 * MIN, MONDAY_10AM, cfg);
    expect(paused.effects).toEqual([{ type: 'hide' }]);

    const during = run(paused.state, [MONDAY_10AM + 45 * MIN, MONDAY_10AM + 50 * MIN]);
    expect(during.effects).toEqual([]);

    const resumed = run(during.state, [MONDAY_10AM + 60 * MIN]);
    expect(resumed.state.phase).toBe('idle');
    expect(resumed.state.nextDueAt).toBe(MONDAY_10AM + 105 * MIN);
  });

  it('clearing DND re-arms immediately', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const paused = setDnd(s, MONDAY_10AM + 60 * MIN, MONDAY_10AM, cfg);
    const cleared = setDnd(paused.state, null, MONDAY_10AM + 10 * MIN, cfg);
    expect(cleared.state.phase).toBe('idle');
    expect(cleared.state.nextDueAt).toBe(MONDAY_10AM + 55 * MIN);
  });
});

describe('work hours and sleep', () => {
  it('holds outside work hours and fires once they resume', () => {
    const evening = new Date(2026, 7, 24, 17, 50).getTime();
    const s = createInitialState(evening, cfg);
    const afterHours = run(s, [new Date(2026, 7, 24, 18, 35).getTime()]);
    expect(afterHours.effects).toEqual([]);

    const nextMorning = run(afterHours.state, [new Date(2026, 7, 25, 9, 5).getTime()]);
    expect(nextMorning.effects).toHaveLength(1);
  });

  it('collapses four missed intervals after sleep into a single reminder', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const wake = MONDAY_10AM + 4 * 45 * MIN;
    const out = run(s, [wake, wake + 1000]);
    expect(out.effects).toEqual([
      { type: 'show', stageIndex: 0, mode: 'corner', sound: false },
    ]);
  });
});

describe('persisted nextDueAt', () => {
  it('adopts a future value instead of re-arming', () => {
    const now = MONDAY_10AM;
    const stored = now + 7 * MIN;
    expect(createInitialState(now, cfg, stored).nextDueAt).toBe(stored);
  });

  it('fires once for a value already in the past', () => {
    const now = MONDAY_10AM;
    const s = createInitialState(now, cfg, now - 90 * MIN);
    const out = run(s, [now, now + 1000, now + 2000]);
    expect(out.effects).toEqual([
      { type: 'show', stageIndex: 0, mode: 'corner', sound: false },
    ]);
  });

  it('re-arms a full interval when nothing was stored', () => {
    const now = MONDAY_10AM;
    expect(createInitialState(now, cfg, null).nextDueAt).toBe(now + cfg.intervalMinutes * MIN);
    expect(createInitialState(now, cfg).nextDueAt).toBe(now + cfg.intervalMinutes * MIN);
  });

  it('ignores a non-finite stored value', () => {
    const now = MONDAY_10AM;
    expect(createInitialState(now, cfg, Number.NaN).nextDueAt).toBe(
      now + cfg.intervalMinutes * MIN,
    );
  });
});
