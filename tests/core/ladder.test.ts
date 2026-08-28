import { describe, it, expect } from 'vitest';
import {
  MAX_STAGE_DELAY_MINUTES,
  PRESET_LADDERS,
  tryUpdateStage,
  validateLadder,
} from '../../src/core/ladder.js';
import type { Ladder } from '../../src/shared/types.js';

describe('PRESET_LADDERS', () => {
  it('gentle is a single corner stage', () => {
    expect(PRESET_LADDERS.gentle).toEqual([{ mode: 'corner', delayMinutes: 0 }]);
  });

  it('standard escalates corner -> center -> fullscreen at 0/3/8 minutes', () => {
    expect(PRESET_LADDERS.standard).toEqual([
      { mode: 'corner', delayMinutes: 0 },
      { mode: 'center', delayMinutes: 3 },
      { mode: 'fullscreen', delayMinutes: 5 },
    ]);
  });

  it('relentless sounds on its final stage', () => {
    const last = PRESET_LADDERS.relentless[PRESET_LADDERS.relentless.length - 1];
    expect(last.sound).toBe(true);
  });

  it('every preset is valid', () => {
    for (const ladder of Object.values(PRESET_LADDERS)) {
      expect(validateLadder(ladder)).toEqual([]);
    }
  });
});

describe('validateLadder', () => {
  it('rejects an empty ladder', () => {
    expect(validateLadder([])).toContain('ladder must have at least one stage');
  });

  it('rejects a first stage with a non-zero delay', () => {
    const ladder: Ladder = [{ mode: 'corner', delayMinutes: 2 }];
    expect(validateLadder(ladder)).toContain('first stage must have delayMinutes 0');
  });

  it('rejects a later stage with a non-positive delay', () => {
    const ladder: Ladder = [
      { mode: 'corner', delayMinutes: 0 },
      { mode: 'center', delayMinutes: 0 },
    ];
    expect(validateLadder(ladder)).toContain('stage 2 must have delayMinutes greater than 0');
  });

  it('rejects an unknown window mode', () => {
    const ladder = [{ mode: 'gigantic', delayMinutes: 0 }] as unknown as Ladder;
    expect(validateLadder(ladder)).toContain('stage 1 has an unknown mode: gigantic');
  });

  it('rejects a non-object stage without throwing', () => {
    // A hand-edited config can contain anything; validation must survive it.
    expect(validateLadder([null])).toContain('stage 1 is not an object');
    expect(validateLadder(['corner'])).toContain('stage 1 is not an object');
  });
});

describe('tryUpdateStage', () => {
  const standard = (): Ladder => PRESET_LADDERS.standard.map((stage) => ({ ...stage }));

  it('refuses a 0 delay on a later stage', () => {
    // The trap this function exists for: 0 is a finite number, so a blur guard
    // that only rejects blank and NaN passes it straight to normalizeConfig,
    // which answers an invalid ladder by silently replacing the whole thing
    // with the standard preset.
    expect(tryUpdateStage(standard(), 1, { delayMinutes: 0 })).toBeNull();
  });

  it('refuses a negative delay on a later stage', () => {
    expect(tryUpdateStage(standard(), 2, { delayMinutes: -5 })).toBeNull();
  });

  it('returns the whole updated ladder for a valid delay', () => {
    expect(tryUpdateStage(standard(), 1, { delayMinutes: 4 })).toEqual([
      { mode: 'corner', delayMinutes: 0 },
      { mode: 'center', delayMinutes: 4 },
      { mode: 'fullscreen', delayMinutes: 5 },
    ]);
  });

  it('refuses any non-zero delay on the first stage', () => {
    expect(tryUpdateStage(standard(), 0, { delayMinutes: 1 })).toBeNull();
  });

  it('allows a patch that does not touch the first stage delay', () => {
    const next = tryUpdateStage(standard(), 0, { sound: true });
    expect(next?.[0]).toEqual({ mode: 'corner', delayMinutes: 0, sound: true });
  });

  it('handles a single-stage ladder', () => {
    const gentle = (): Ladder => PRESET_LADDERS.gentle.map((stage) => ({ ...stage }));
    expect(tryUpdateStage(gentle(), 0, { sound: true })).toEqual([
      { mode: 'corner', delayMinutes: 0, sound: true },
    ]);
    expect(tryUpdateStage(gentle(), 0, { delayMinutes: 3 })).toBeNull();
  });

  it('refuses an index that is not a stage of this ladder', () => {
    expect(tryUpdateStage(standard(), 3, { sound: true })).toBeNull();
    expect(tryUpdateStage(standard(), -1, { sound: true })).toBeNull();
    expect(tryUpdateStage(standard(), 1.5, { sound: true })).toBeNull();
  });

  it('refuses a fractional delay', () => {
    // normalizeConfig copies ladder stages verbatim rather than rounding them
    // the way clampNumber rounds every other number in the config, so a 2.5
    // typed here would be stored as 2.5 for ever.
    expect(tryUpdateStage(standard(), 1, { delayMinutes: 2.5 })).toBeNull();
  });

  it('refuses a delay beyond the ceiling but accepts the ceiling itself', () => {
    // A 99999-minute stage is a stage that never arrives - the silent stop in
    // miniature, and validateLadder has no opinion about it.
    expect(tryUpdateStage(standard(), 1, { delayMinutes: 99999 })).toBeNull();
    expect(tryUpdateStage(standard(), 1, { delayMinutes: MAX_STAGE_DELAY_MINUTES })).not.toBeNull();
  });

  it('refuses a non-finite delay', () => {
    expect(tryUpdateStage(standard(), 1, { delayMinutes: Number.NaN })).toBeNull();
    expect(tryUpdateStage(standard(), 1, { delayMinutes: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it('bounds only the delay it is asked to set, so an unrelated edit still lands', () => {
    // A hand-edited config can hold a fractional delay legally: validateLadder
    // permits it, so normalizeConfig keeps it. Ticking that stage's sound box
    // must not be refused because of a number the patch never touched.
    const handEdited: Ladder = [
      { mode: 'corner', delayMinutes: 0 },
      { mode: 'center', delayMinutes: 2.5 },
    ];
    expect(tryUpdateStage(handEdited, 1, { sound: true })).toEqual([
      { mode: 'corner', delayMinutes: 0 },
      { mode: 'center', delayMinutes: 2.5, sound: true },
    ]);
  });

  it('never mutates or aliases the ladder it was given', () => {
    const original = standard();
    const next = tryUpdateStage(original, 1, { delayMinutes: 4 });
    expect(original[1].delayMinutes).toBe(3);
    expect(next?.[0]).not.toBe(original[0]);
  });

  it('refuses to edit a ladder that is already invalid', () => {
    const broken = [{ mode: 'corner', delayMinutes: 0 }, null] as unknown as Ladder;
    expect(tryUpdateStage(broken, 0, { sound: true })).toBeNull();
  });
});
