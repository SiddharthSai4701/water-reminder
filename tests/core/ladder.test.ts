import { describe, it, expect } from 'vitest';
import { PRESET_LADDERS, validateLadder } from '../../src/core/ladder.js';
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
});
