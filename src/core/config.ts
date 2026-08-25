import type { Config, CornerPosition, Ladder, PresetName, Schedule } from '../shared/types.js';
import { PRESET_LADDERS, validateLadder } from './ladder.js';

export const CONFIG_VERSION = 1;

export const DEFAULT_CONFIG: Config = {
  version: CONFIG_VERSION,
  schedule: {
    intervalMinutes: 30,
    workStartMinute: 9 * 60,
    workEndMinute: 18 * 60,
    workDays: [1, 2, 3, 4, 5],
  },
  preset: 'standard',
  ladder: PRESET_LADDERS.standard,
  defaultSnoozeMinutes: 10,
  goalMl: 4000,
  glassMl: 250,
  cornerPosition: 'bottom-right',
  activePackIds: ['sarcastic'],
  customLines: [],
  autostart: true,
  soundEnabled: false,
  dndUntil: null,
};

const PRESETS: PresetName[] = ['gentle', 'nudge', 'standard', 'relentless', 'custom'];
const CORNERS: CornerPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

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
  // An empty or inverted window would mean isWithinWorkHours is false for
  // every instant and the app silently never fires again. Overnight windows
  // are not supported yet, so fall back rather than accept one.
  const validWindow = end > start;

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

  const customLines = Array.isArray(r.customLines)
    ? (r.customLines as unknown[]).filter((s): s is string => typeof s === 'string')
    : d.customLines;

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
    customLines: [...customLines],
    autostart: typeof r.autostart === 'boolean' ? r.autostart : d.autostart,
    soundEnabled: typeof r.soundEnabled === 'boolean' ? r.soundEnabled : d.soundEnabled,
    dndUntil: typeof r.dndUntil === 'number' && Number.isFinite(r.dndUntil) ? r.dndUntil : null,
  };
}
