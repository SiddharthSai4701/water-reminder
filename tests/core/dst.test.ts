import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addLocalDays, startOfLocalDay } from '../../src/core/stats.js';

const originalTZ = process.env.TZ;

describe('addLocalDays across a DST transition', () => {
  beforeAll(() => {
    // US Eastern springs forward on 2026-03-08 and falls back on 2026-11-01.
    // The dev machine is Asia/Kolkata, which has no DST, so nothing here is
    // exercised unless the zone is set.
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    // Assigning undefined would leave TZ as the string "undefined", which is
    // not a zone: every file sharing this worker afterwards would silently run
    // somewhere else. Unset it properly instead.
    if (originalTZ === undefined) delete process.env.TZ;
    else process.env.TZ = originalTZ;
  });

  it('really is on a DST boundary', () => {
    // Proves the zone took effect. Without this every assertion below passes
    // trivially in a fixed-offset zone and the file tests nothing. The short
    // day is the 8th itself, not the 7th: the clocks go forward at 02:00 on
    // the 8th, so midnight on the 8th is still EST.
    const springs = startOfLocalDay(new Date(2026, 2, 8, 12, 0).getTime());
    expect(addLocalDays(springs, 1) - springs).toBe(23 * 60 * 60 * 1000);
    const falls = startOfLocalDay(new Date(2026, 10, 1, 12, 0).getTime());
    expect(addLocalDays(falls, 1) - falls).toBe(25 * 60 * 60 * 1000);
  });

  it('lands on local midnight across the spring-forward boundary', () => {
    const before = new Date(2026, 2, 7, 12, 0).getTime();
    const next = addLocalDays(before, 1);
    expect(new Date(next).getHours()).toBe(0);
    expect(new Date(next).getDate()).toBe(8);
  });

  it('lands on local midnight across the fall-back boundary', () => {
    const before = new Date(2026, 9, 31, 12, 0).getTime();
    const next = addLocalDays(before, 1);
    expect(new Date(next).getHours()).toBe(0);
    expect(new Date(next).getDate()).toBe(1);
  });

  it('is its own inverse across a transition', () => {
    const day = startOfLocalDay(new Date(2026, 2, 8, 12, 0).getTime());
    expect(addLocalDays(addLocalDays(day, 1), -1)).toBe(day);
  });
});
