import { describe, it, expect } from 'vitest';
import {
  addLocalDays,
  currentStreak,
  glassesOnDay,
  goalPct,
  mlOnDay,
  parseLog,
  serializeEvent,
  startOfLocalDay,
} from '../../src/core/stats.js';
import type { LogEvent } from '../../src/shared/types.js';

const NOW = new Date(2026, 7, 24, 14, 0).getTime();

function drank(dayOffset: number, hour: number, ml: number): LogEvent {
  return { ts: new Date(2026, 7, 24 + dayOffset, hour, 0).getTime(), type: 'drank', ml };
}

describe('parseLog', () => {
  it('parses newline-delimited events', () => {
    const text = '{"ts":1,"type":"drank","ml":250}\n{"ts":2,"type":"skip"}\n';
    expect(parseLog(text)).toEqual([
      { ts: 1, type: 'drank', ml: 250 },
      { ts: 2, type: 'skip' },
    ]);
  });

  it('skips malformed and blank lines instead of throwing', () => {
    const text = '{"ts":1,"type":"drank","ml":250}\nnot json\n\n{"type":"skip"}\n';
    expect(parseLog(text)).toEqual([{ ts: 1, type: 'drank', ml: 250 }]);
  });

  it('round-trips through serializeEvent', () => {
    const event: LogEvent = { ts: 42, type: 'snooze', minutes: 10 };
    expect(parseLog(serializeEvent(event))).toEqual([event]);
  });
});

describe('day helpers', () => {
  it('startOfLocalDay strips the time', () => {
    const start = startOfLocalDay(NOW);
    const d = new Date(start);
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
    expect(d.getDate()).toBe(24);
  });

  it('addLocalDays walks calendar days', () => {
    const yesterday = new Date(addLocalDays(startOfLocalDay(NOW), -1));
    expect(yesterday.getDate()).toBe(23);
  });
});

describe('daily totals', () => {
  const events = [drank(0, 9, 250), drank(0, 11, 250), drank(-1, 10, 500), { ts: NOW, type: 'skip' } as LogEvent];

  it('sums only drank events on the given day', () => {
    expect(mlOnDay(events, startOfLocalDay(NOW))).toBe(500);
  });

  it('counts glasses on the given day', () => {
    expect(glassesOnDay(events, startOfLocalDay(NOW))).toBe(2);
  });

  it('goalPct rounds to an integer', () => {
    expect(goalPct(500, 2500)).toBe(20);
    expect(goalPct(0, 2500)).toBe(0);
  });
});

describe('currentStreak', () => {
  const GOAL = 1000;

  it('is zero with no events', () => {
    expect(currentStreak([], GOAL, NOW)).toBe(0);
  });

  it('counts today when today has already met the goal', () => {
    const events = [drank(0, 9, 1000)];
    expect(currentStreak(events, GOAL, NOW)).toBe(1);
  });

  it('does not break the streak merely because today is incomplete', () => {
    const events = [drank(-1, 9, 1000), drank(-2, 9, 1000)];
    expect(currentStreak(events, GOAL, NOW)).toBe(2);
  });

  it('counts today plus preceding days', () => {
    const events = [drank(0, 9, 1000), drank(-1, 9, 1000), drank(-2, 9, 1000)];
    expect(currentStreak(events, GOAL, NOW)).toBe(3);
  });

  it('stops at the first day below goal', () => {
    const events = [drank(-1, 9, 1000), drank(-2, 9, 400), drank(-3, 9, 1000)];
    expect(currentStreak(events, GOAL, NOW)).toBe(1);
  });
});
