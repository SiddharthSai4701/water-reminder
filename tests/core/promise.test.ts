import { describe, it, expect } from 'vitest';
import { PRESET_LADDERS } from '../../src/core/ladder.js';
import {
  createInitialState,
  onSnooze,
  stageOffsets,
  tick,
  type SchedulerConfig,
  type SchedulerState,
} from '../../src/core/scheduler.js';

const MIN = 60_000;

/** Monday 2026-08-24 10:00 local time — inside the default work window. */
const MONDAY_10AM = new Date(2026, 7, 24, 10, 0, 0, 0).getTime();
/** Friday 2026-08-28 17:55 local time — five minutes before the window closes. */
const FRIDAY_1755 = new Date(2026, 7, 28, 17, 55, 0, 0).getTime();
/** Monday 2026-08-31 09:05 local time — the next time the window reopens. */
const NEXT_MONDAY_905 = new Date(2026, 7, 31, 9, 5, 0, 0).getTime();

function cfgFor(ladder: SchedulerConfig['ladder']): SchedulerConfig {
  return {
    intervalMinutes: 45,
    ladder,
    workStartMinute: 9 * 60,
    workEndMinute: 18 * 60,
    workDays: [1, 2, 3, 4, 5],
  };
}

/** Run tick repeatedly, collecting every effect, to simulate the 1s main loop. */
function run(state: SchedulerState, times: number[], c: SchedulerConfig) {
  let s = state;
  const effects = [];
  for (const t of times) {
    const out = tick(s, t, c);
    s = out.state;
    effects.push(...out.effects);
  }
  return { state: s, effects };
}

describe('the popup cannot resolve itself', () => {
  for (const [name, ladder] of Object.entries(PRESET_LADDERS)) {
    const cfg = cfgFor(ladder);
    const due = MONDAY_10AM + cfg.intervalMinutes * MIN;
    const offsets = stageOffsets(ladder);
    const lastOffset = offsets[offsets.length - 1];

    it(`[${name}] no tick sequence, however long or sparse, ever produces a hide effect once due`, () => {
      const s0 = createInitialState(MONDAY_10AM, cfg);
      const times = [
        due,
        due + 1000,
        due + lastOffset,
        due + lastOffset + 1 * MIN,
        due + lastOffset + 30 * MIN,
        due + lastOffset + 6 * 60 * MIN,
        due + lastOffset + 24 * 60 * MIN,
        due + lastOffset + 10 * 24 * 60 * MIN,
      ];
      const { effects } = run(s0, times, cfg);
      const hides = effects.filter((e) => e.type === 'hide');
      expect(hides, `[${name}] tick() produced a hide effect`).toEqual([]);
    });

    it(`[${name}] holds phase 'due' and the final stage across arbitrary further ticks`, () => {
      const s0 = createInitialState(MONDAY_10AM, cfg);
      const reachFinal = run(s0, [due, due + lastOffset], cfg);
      expect(reachFinal.state.phase, `[${name}]`).toBe('due');
      expect(reachFinal.state.stageIndex, `[${name}]`).toBe(ladder.length - 1);

      const further = run(
        reachFinal.state,
        [
          due + lastOffset + 1 * MIN,
          due + lastOffset + 30 * MIN,
          due + lastOffset + 6 * 60 * MIN,
        ],
        cfg,
      );
      expect(further.state.phase, `[${name}]`).toBe('due');
      expect(further.state.stageIndex, `[${name}]`).toBe(ladder.length - 1);
    });

    it(`[${name}] a snooze landing outside work hours produces exactly one show effect once the window reopens`, () => {
      const s0 = createInitialState(FRIDAY_1755, cfg);
      const snoozed = onSnooze(s0, FRIDAY_1755, 10, cfg);
      expect(snoozed.state.phase, `[${name}]`).toBe('snoozed');
      // nextDueAt (18:05 Friday) is past the 18:00 close of the work window.
      expect(snoozed.state.nextDueAt, `[${name}]`).toBeGreaterThan(
        new Date(2026, 7, 28, 18, 0, 0, 0).getTime(),
      );

      const { effects, state } = run(
        snoozed.state,
        [
          FRIDAY_1755 + 20 * MIN, // just past nextDueAt, still outside hours
          new Date(2026, 7, 28, 22, 0, 0, 0).getTime(),
          new Date(2026, 7, 29, 12, 0, 0, 0).getTime(), // Saturday
          new Date(2026, 7, 30, 12, 0, 0, 0).getTime(), // Sunday
          new Date(2026, 7, 31, 8, 59, 0, 0).getTime(), // Monday, before open
          NEXT_MONDAY_905, // Monday, window open
        ],
        cfg,
      );

      const shows = effects.filter((e) => e.type === 'show');
      expect(shows, `[${name}] expected exactly one show once hours reopened`).toHaveLength(1);
      expect(shows[0], `[${name}]`).toEqual({
        type: 'show',
        stageIndex: 0,
        mode: ladder[0].mode,
        sound: ladder[0].sound === true,
      });
      expect(state.phase, `[${name}]`).toBe('due');
    });
  }
});
