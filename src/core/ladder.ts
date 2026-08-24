import type { Ladder, PresetName, WindowMode } from '../shared/types.js';

const MODES: WindowMode[] = ['corner', 'center', 'fullscreen'];

export const PRESET_LADDERS: Record<Exclude<PresetName, 'custom'>, Ladder> = {
  gentle: [{ mode: 'corner', delayMinutes: 0 }],
  nudge: [
    { mode: 'corner', delayMinutes: 0 },
    { mode: 'center', delayMinutes: 5 },
  ],
  standard: [
    { mode: 'corner', delayMinutes: 0 },
    { mode: 'center', delayMinutes: 3 },
    { mode: 'fullscreen', delayMinutes: 5 },
  ],
  relentless: [
    { mode: 'corner', delayMinutes: 0 },
    { mode: 'center', delayMinutes: 2 },
    { mode: 'fullscreen', delayMinutes: 3, sound: true },
  ],
};

export function validateLadder(ladder: Ladder): string[] {
  const errors: string[] = [];

  if (!Array.isArray(ladder) || ladder.length === 0) {
    errors.push('ladder must have at least one stage');
    return errors;
  }

  ladder.forEach((stage, i) => {
    if (!MODES.includes(stage.mode)) {
      errors.push(`stage ${i + 1} has an unknown mode: ${String(stage.mode)}`);
    }
    if (typeof stage.delayMinutes !== 'number' || Number.isNaN(stage.delayMinutes)) {
      errors.push(`stage ${i + 1} has a non-numeric delayMinutes`);
      return;
    }
    if (i === 0 && stage.delayMinutes !== 0) {
      errors.push('first stage must have delayMinutes 0');
    }
    if (i > 0 && stage.delayMinutes <= 0) {
      errors.push(`stage ${i + 1} must have delayMinutes greater than 0`);
    }
  });

  return errors;
}
