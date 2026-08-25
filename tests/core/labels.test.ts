import { describe, expect, it } from 'vitest';
import { countdownLabel, nextWorkWindowStart } from '../../src/core/labels.js';
import type { SchedulerState } from '../../src/core/scheduler.js';

const hours = {
  workStartMinute: 9 * 60,
  workEndMinute: 18 * 60,
  workDays: [1, 2, 3, 4, 5],
};

/** Monday 2026-08-24. */
function mon(h: number, m = 0): number {
  return new Date(2026, 7, 24, h, m).getTime();
}

function sat(h: number, m = 0): number {
  return new Date(2026, 7, 29, h, m).getTime();
}

function idle(nextDueAt: number): SchedulerState {
  return { phase: 'idle', nextDueAt, dueSince: null, stageIndex: 0, pausedUntil: null };
}

describe('nextWorkWindowStart', () => {
  it('returns today opening when called before it', () => {
    expect(nextWorkWindowStart(mon(7, 30), hours)).toBe(mon(9, 0));
  });

  it('returns the next day opening when called after closing', () => {
    expect(nextWorkWindowStart(mon(18, 35), hours)).toBe(new Date(2026, 7, 25, 9, 0).getTime());
  });

  it('skips non-work days', () => {
    expect(nextWorkWindowStart(sat(12, 0), hours)).toBe(new Date(2026, 7, 31, 9, 0).getTime());
  });

  it('does not loop forever when no day is a work day', () => {
    const t = mon(12, 0);
    expect(nextWorkWindowStart(t, { ...hours, workDays: [] })).toBe(t);
  });
});

describe('countdownLabel', () => {
  it('reports a pause', () => {
    const state = { ...idle(mon(11)), phase: 'paused' as const };
    expect(countdownLabel(state, mon(10), hours)).toBe('Paused');
  });

  it('reports an unanswered reminder', () => {
    const state = { ...idle(mon(11)), phase: 'due' as const };
    expect(countdownLabel(state, mon(10), hours)).toBe('Waiting on you');
  });

  it('counts down inside work hours', () => {
    expect(countdownLabel(idle(mon(10, 10)), mon(10, 0), hours)).toBe('Next drink in 10 min');
  });

  it('says due now only when it will actually fire', () => {
    expect(countdownLabel(idle(mon(10, 0)), mon(10, 1), hours)).toBe('Due now');
  });

  // The bug: outside work hours the scheduler holds in `idle` with an overdue
  // nextDueAt, and the old label read "Due now" — indistinguishable from a
  // reminder the app had lost.
  it('names the work-hours hold instead of claiming due', () => {
    expect(countdownLabel(idle(mon(18, 0)), mon(18, 35), hours)).toBe(
      'Outside work hours · resumes 09:00 Tue',
    );
  });

  it('omits the weekday when the window reopens the same day', () => {
    expect(countdownLabel(idle(mon(8, 0)), mon(8, 30), hours)).toBe(
      'Outside work hours · resumes 09:00',
    );
  });

  it('names the weekday when the hold spans a weekend', () => {
    expect(countdownLabel(idle(sat(12, 0)), sat(13, 0), hours)).toBe(
      'Outside work hours · resumes 09:00 Mon',
    );
  });

  // Still inside work hours, but the next reminder lands after closing, so a
  // relative countdown would promise something that will not happen.
  it('gives an absolute time when the next reminder falls outside the window', () => {
    expect(countdownLabel(idle(mon(18, 20)), mon(17, 55), hours)).toBe(
      'Next drink at 09:00 Tue',
    );
  });
});
