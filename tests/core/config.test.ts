import { describe, it, expect } from 'vitest';
import { CONFIG_VERSION, DEFAULT_CONFIG, ladderForPreset, normalizeConfig } from '../../src/core/config.js';
import { PRESET_LADDERS, validateLadder } from '../../src/core/ladder.js';
import { isWithinWorkHours } from '../../src/core/scheduler.js';

describe('DEFAULT_CONFIG', () => {
  it('uses the standard preset ladder', () => {
    expect(DEFAULT_CONFIG.preset).toBe('standard');
    expect(DEFAULT_CONFIG.ladder).toEqual(PRESET_LADDERS.standard);
    expect(validateLadder(DEFAULT_CONFIG.ladder)).toEqual([]);
  });

  it('defaults to the sarcastic pack', () => {
    expect(DEFAULT_CONFIG.activePackIds).toEqual(['sarcastic']);
  });

  it('carries the current config version', () => {
    expect(DEFAULT_CONFIG.version).toBe(CONFIG_VERSION);
  });
});

describe('normalizeConfig', () => {
  it('returns defaults for empty or non-object input', () => {
    expect(normalizeConfig({})).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig('nonsense')).toEqual(DEFAULT_CONFIG);
  });

  it('preserves supplied values', () => {
    const out = normalizeConfig({ goalMl: 3000, glassMl: 300 });
    expect(out.goalMl).toBe(3000);
    expect(out.glassMl).toBe(300);
  });

  it('merges a partial schedule over the defaults', () => {
    const out = normalizeConfig({ schedule: { intervalMinutes: 30 } });
    expect(out.schedule.intervalMinutes).toBe(30);
    expect(out.schedule.workDays).toEqual(DEFAULT_CONFIG.schedule.workDays);
  });

  it('replaces an invalid ladder with the standard preset', () => {
    const out = normalizeConfig({ ladder: [{ mode: 'corner', delayMinutes: 7 }] });
    expect(out.ladder).toEqual(PRESET_LADDERS.standard);
  });

  it('keeps a valid custom ladder', () => {
    const custom = [
      { mode: 'corner', delayMinutes: 0 },
      { mode: 'center', delayMinutes: 4 },
    ];
    const out = normalizeConfig({ preset: 'custom', ladder: custom });
    expect(out.ladder).toEqual(custom);
  });

  it('clamps out-of-range numbers', () => {
    const out = normalizeConfig({
      schedule: { intervalMinutes: 0 },
      glassMl: 99999,
      goalMl: 1,
      defaultSnoozeMinutes: -5,
    });
    expect(out.schedule.intervalMinutes).toBe(1);
    expect(out.glassMl).toBe(2000);
    expect(out.goalMl).toBe(250);
    expect(out.defaultSnoozeMinutes).toBe(1);
  });

  it('drops invalid work days', () => {
    const out = normalizeConfig({ schedule: { workDays: [1, 9, -2, 5] } });
    expect(out.schedule.workDays).toEqual([1, 5]);
  });

  it('drops a stale dndUntil type', () => {
    const out = normalizeConfig({ dndUntil: 'later' });
    expect(out.dndUntil).toBeNull();
  });

  it('ignores unknown keys', () => {
    const out = normalizeConfig({ mysteryFlag: true }) as unknown as Record<string, unknown>;
    expect(out.mysteryFlag).toBeUndefined();
  });

  it('never throws on a ladder holding non-object elements', () => {
    // The likeliest shape of a hand-broken config file.
    expect(() => normalizeConfig({ ladder: [null] })).not.toThrow();
    expect(normalizeConfig({ ladder: [null] }).ladder).toEqual(PRESET_LADDERS.standard);
    expect(normalizeConfig({ ladder: ['corner'] }).ladder).toEqual(PRESET_LADDERS.standard);
    expect(normalizeConfig({ ladder: 7 }).ladder).toEqual(PRESET_LADDERS.standard);
  });

  it('falls back to defaults for empty arrays', () => {
    expect(normalizeConfig({ activePackIds: [] }).activePackIds).toEqual(
      DEFAULT_CONFIG.activePackIds,
    );
    expect(normalizeConfig({ schedule: { workDays: [] } }).schedule.workDays).toEqual(
      DEFAULT_CONFIG.schedule.workDays,
    );
  });

  it('shares no array references with the defaults', () => {
    const a = normalizeConfig({});
    const b = normalizeConfig({});
    expect(a.ladder).not.toBe(b.ladder);
    expect(a.ladder).not.toBe(PRESET_LADDERS.standard);
    expect(a.schedule.workDays).not.toBe(DEFAULT_CONFIG.schedule.workDays);
    expect(a.activePackIds).not.toBe(DEFAULT_CONFIG.activePackIds);
  });

  it('defaults nextDueAt to null and rejects a non-finite value', () => {
    expect(normalizeConfig({}).nextDueAt).toBeNull();
    expect(normalizeConfig({ nextDueAt: Number.NaN }).nextDueAt).toBeNull();
    expect(normalizeConfig({ nextDueAt: 1787542200000 }).nextDueAt).toBe(1787542200000);
  });

  it('stamps the current config version', () => {
    expect(normalizeConfig({ version: 1 }).version).toBe(CONFIG_VERSION);
  });
});

describe('normalizeSchedule window validation', () => {
  it('accepts an overnight window', () => {
    const c = normalizeConfig({ schedule: { workStartMinute: 1320, workEndMinute: 120 } });
    expect(c.schedule.workStartMinute).toBe(1320);
    expect(c.schedule.workEndMinute).toBe(120);
  });

  it('rejects an empty window where start equals end', () => {
    const c = normalizeConfig({ schedule: { workStartMinute: 600, workEndMinute: 600 } });
    expect(c.schedule.workStartMinute).toBe(DEFAULT_CONFIG.schedule.workStartMinute);
    expect(c.schedule.workEndMinute).toBe(DEFAULT_CONFIG.schedule.workEndMinute);
  });
});

describe('ladderForPreset', () => {
  it('returns the preset ladder for a named preset', () => {
    expect(ladderForPreset('gentle', [])).toEqual(PRESET_LADDERS.gentle);
  });

  it('returns the custom ladder for the custom preset', () => {
    const custom = [{ mode: 'corner' as const, delayMinutes: 0 }];
    expect(ladderForPreset('custom', custom)).toEqual(custom);
  });
});

describe('default work window', () => {
  it('covers every day of the week', () => {
    // Sun 2026-08-23 through Sat 2026-08-29.
    for (let day = 23; day <= 29; day++) {
      expect(DEFAULT_CONFIG.schedule.workDays).toContain(new Date(2026, 7, day).getDay());
    }
  });

  it('covers every minute of the day', () => {
    const cfg = {
      ...DEFAULT_CONFIG.schedule,
      intervalMinutes: DEFAULT_CONFIG.schedule.intervalMinutes,
      ladder: DEFAULT_CONFIG.ladder,
    };
    // Midnight, and the last minute before it. A window ending at 23:59
    // would leave that final minute a silent hold.
    expect(isWithinWorkHours(new Date(2026, 7, 24, 0, 0).getTime(), cfg)).toBe(true);
    expect(isWithinWorkHours(new Date(2026, 7, 24, 23, 59).getTime(), cfg)).toBe(true);
  });
});
