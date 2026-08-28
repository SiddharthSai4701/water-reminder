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

/**
 * The ceiling on a single stage's delay. The config's other minute fields stop
 * at 600 (the reminder interval) and 240 (the snooze), so a stage may wait as
 * long as the longest interval this app will ever schedule, and no longer.
 * Past that a stage is not slow, it is a stage that never arrives — and ladder
 * delays are the one number normalizeConfig copies verbatim instead of putting
 * through clampNumber, so nothing downstream would rein one in.
 */
export const MAX_STAGE_DELAY_MINUTES = 600;

/**
 * Apply `patch` to one stage and return the whole resulting ladder, or `null`
 * if that ladder is not one that may be stored.
 *
 * This is the guard between a typed number and normalizeConfig, which does not
 * reject an invalid ladder — it silently substitutes the standard preset. An
 * invalid write therefore never surfaces as an error; it surfaces as every
 * stage the user configured being gone, with nothing on screen to say why. A
 * caller must read `null` as "refuse this edit and put the old value back".
 *
 * It returns the candidate rather than a boolean on purpose. A caller that
 * asks whether an edit is allowed and then rebuilds the ladder separately to
 * store it is keeping two constructions in step by hand, and the trap reopens
 * the day they drift apart.
 */
export function tryUpdateStage(
  ladder: Ladder,
  index: number,
  patch: Partial<Stage>,
): Ladder | null {
  if (!Number.isInteger(index) || index < 0 || index >= ladder.length) return null;

  // Only the delay this patch is *setting* is bounded, never whatever the
  // stage already holds. validateLadder permits a fractional delay, so a
  // hand-edited config may legally carry one, and ticking that stage's sound
  // box must not be refused over a number the patch does not touch.
  if (patch.delayMinutes !== undefined) {
    const delay = patch.delayMinutes;
    if (!Number.isInteger(delay) || delay < 0 || delay > MAX_STAGE_DELAY_MINUTES) return null;
  }

  const next = ladder.map((stage, i) => (i === index ? { ...stage, ...patch } : { ...stage }));
  return validateLadder(next).length === 0 ? next : null;
}
