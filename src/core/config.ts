import type { Config, CornerPosition, Ladder, PresetName, Schedule } from '../shared/types.js';
import { PRESET_LADDERS, validateLadder } from './ladder.js';

export const CONFIG_VERSION = 2;

export const DEFAULT_CONFIG: Config = {
  version: CONFIG_VERSION,
  schedule: {
    intervalMinutes: 30,
    // 24/7 by default. 1440 rather than 1439 because isWithinWorkHours
    // compares with `<`, so 23:59 would leave the last minute a silent hold.
    // Nothing in the default schedule ever holds a reminder; pausing is the
    // only thing that stops one.
    workStartMinute: 0,
    workEndMinute: 24 * 60,
    workDays: [0, 1, 2, 3, 4, 5, 6],
  },
  preset: 'standard',
  ladder: PRESET_LADDERS.standard,
  defaultSnoozeMinutes: 10,
  goalMl: 4000,
  glassMl: 250,
  cornerPosition: 'bottom-right',
  activePackIds: ['sarcastic'],
  autostart: true,
  soundEnabled: false,
  dndUntil: null,
  nextDueAt: null,
};

const PRESETS: PresetName[] = ['gentle', 'nudge', 'standard', 'relentless', 'custom'];
export const CORNERS: CornerPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function normalizeSchedule(raw: unknown): Schedule {
  const r = asRecord(raw);
  const d = DEFAULT_CONFIG.schedule;
  const days = Array.isArray(r.workDays)
    ? (r.workDays as unknown[]).filter(
        (n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 6,
      )
    : d.workDays;
  const start = clampNumber(r.workStartMinute, 0, 1439, d.workStartMinute);
  const end = clampNumber(r.workEndMinute, 1, 1440, d.workEndMinute);
  // A window whose start equals its end is empty, and isWithinWorkHours
  // would be false for every instant — the app silently never fires again.
  // A window whose end is *before* its start is an overnight window and is
  // supported.
  const validWindow = end !== start;

  return {
    intervalMinutes: clampNumber(r.intervalMinutes, 1, 600, d.intervalMinutes),
    workStartMinute: validWindow ? start : d.workStartMinute,
    workEndMinute: validWindow ? end : d.workEndMinute,
    // Copied, never aliased: a returned Config must not share arrays with
    // DEFAULT_CONFIG, or one consumer mutating it corrupts every other.
    workDays: days.length > 0 ? [...days] : [...d.workDays],
  };
}

export function ladderForPreset(preset: PresetName, custom: Ladder): Ladder {
  if (preset === 'custom') return custom;
  return PRESET_LADDERS[preset];
}

export function normalizeConfig(raw: unknown): Config {
  const r = asRecord(raw);
  const d = DEFAULT_CONFIG;

  const preset = PRESETS.includes(r.preset as PresetName) ? (r.preset as PresetName) : d.preset;

  // validateLadder takes unknown and never throws, so a hand-edited ladder of
  // arbitrary JSON — [null], ["corner"], 7 — lands on the standard preset
  // instead of crashing a background app the user cannot see.
  const ladder: Ladder =
    validateLadder(r.ladder).length === 0
      ? (r.ladder as Ladder).map((stage) => ({ ...stage }))
      : PRESET_LADDERS.standard.map((stage) => ({ ...stage }));

  const packIds = Array.isArray(r.activePackIds)
    ? (r.activePackIds as unknown[]).filter((s): s is string => typeof s === 'string')
    : d.activePackIds;

  return {
    version: CONFIG_VERSION,
    schedule: normalizeSchedule(r.schedule),
    preset,
    ladder,
    defaultSnoozeMinutes: clampNumber(r.defaultSnoozeMinutes, 1, 240, d.defaultSnoozeMinutes),
    goalMl: clampNumber(r.goalMl, 250, 10000, d.goalMl),
    glassMl: clampNumber(r.glassMl, 50, 2000, d.glassMl),
    cornerPosition: CORNERS.includes(r.cornerPosition as CornerPosition)
      ? (r.cornerPosition as CornerPosition)
      : d.cornerPosition,
    activePackIds: packIds.length > 0 ? [...packIds] : [...d.activePackIds],
    autostart: typeof r.autostart === 'boolean' ? r.autostart : d.autostart,
    soundEnabled: typeof r.soundEnabled === 'boolean' ? r.soundEnabled : d.soundEnabled,
    dndUntil: typeof r.dndUntil === 'number' && Number.isFinite(r.dndUntil) ? r.dndUntil : null,
    nextDueAt:
      typeof r.nextDueAt === 'number' && Number.isFinite(r.nextDueAt) ? r.nextDueAt : null,
  };
}
