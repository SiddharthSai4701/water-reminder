import { describe, expect, it } from 'vitest';
import { countdownLabel, nextWorkWindowStart, progressLabel } from '../../src/core/labels.js';
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

describe('nextWorkWindowStart with a wrapping window', () => {
  const night = { workStartMinute: 22 * 60, workEndMinute: 2 * 60, workDays: [1] };

  it('opens at midnight on the next listed day', () => {
    // Saturday: not a work day. The next Monday minute inside a wrapping
    // window is 00:00, not 22:00.
    const saturday = new Date(2026, 7, 29, 12, 0).getTime();
    expect(nextWorkWindowStart(saturday, night)).toBe(new Date(2026, 7, 31, 0, 0).getTime());
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

describe('progressLabel', () => {
  it('reads as litres to one decimal place', () => {
    expect(progressLabel(1200, 4000)).toBe('1.2 / 4.0 L');
  });

  it('shows zero rather than an empty string', () => {
    expect(progressLabel(0, 4000)).toBe('0.0 / 4.0 L');
  });

  it('does not stop at the goal', () => {
    expect(progressLabel(4500, 4000)).toBe('4.5 / 4.0 L');
  });
});

describe('nextWorkWindowStart on a wrapping window', () => {
  const night = { workStartMinute: 22 * 60, workEndMinute: 2 * 60, workDays: [0, 1, 2, 3, 4, 5, 6] };

  it('returns tonight opening, not tomorrow midnight', () => {
    // Monday noon, window 22:00-02:00. Reminders resume in ten hours, not in
    // twelve: the label used to say "resumes 00:00 Tue" while the scheduler
    // fired at 22:00 the same evening. A countdown that disagrees with the
    // scheduler is the v0.1.4 bug this whole module was extracted to fix.
    const noon = new Date(2026, 7, 24, 12, 0).getTime();
    expect(nextWorkWindowStart(noon, night)).toBe(new Date(2026, 7, 24, 22, 0).getTime());
  });

  it('returns the small hours when the evening opening has passed', () => {
    // 01:00 is inside the window, so the caller never asks; 03:00 is the real
    // question, and the answer is tonight at 22:00 again.
    const threeAm = new Date(2026, 7, 25, 3, 0).getTime();
    expect(nextWorkWindowStart(threeAm, night)).toBe(new Date(2026, 7, 25, 22, 0).getTime());
  });

  it('crosses to the next listed day when today is not one', () => {
    const mondayOnly = { ...night, workDays: [1] };
    // Sunday noon. The next opening is Monday 22:00 - and midnight on Monday
    // is inside Monday's window too, but nothing is due before 22:00 anyway.
    const sunday = new Date(2026, 7, 23, 12, 0).getTime();
    expect(nextWorkWindowStart(sunday, mondayOnly)).toBe(new Date(2026, 7, 24, 0, 0).getTime());
  });
});
