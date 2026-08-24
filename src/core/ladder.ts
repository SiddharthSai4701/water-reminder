import type { Ladder, PresetName, Stage, WindowMode } from '../shared/types.js';

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

/**
 * Takes `unknown` rather than `Ladder`: the ladder it validates often comes
 * straight from a hand-edited config file, so it must survive arbitrary JSON
 * without throwing.
 */
export function validateLadder(ladder: unknown): string[] {
  const errors: string[] = [];

  if (!Array.isArray(ladder) || ladder.length === 0) {
    errors.push('ladder must have at least one stage');
    return errors;
  }

  ladder.forEach((element: unknown, i) => {
    if (typeof element !== 'object' || element === null) {
      errors.push(`stage ${i + 1} is not an object`);
      return;
    }

    const { mode, delayMinutes } = element as Partial<Stage>;

    if (!MODES.includes(mode as WindowMode)) {
      errors.push(`stage ${i + 1} has an unknown mode: ${String(mode)}`);
    }
    if (typeof delayMinutes !== 'number' || Number.isNaN(delayMinutes)) {
      errors.push(`stage ${i + 1} has a non-numeric delayMinutes`);
      return;
    }
    if (i === 0 && delayMinutes !== 0) {
      errors.push('first stage must have delayMinutes 0');
    }
    if (i > 0 && delayMinutes <= 0) {
      errors.push(`stage ${i + 1} must have delayMinutes greater than 0`);
    }
  });

  return errors;
}
