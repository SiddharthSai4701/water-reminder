import { describe, it, expect } from 'vitest';
import sarcastic from '../../packs/sarcastic.json' with { type: 'json' };
import { eligibleLines } from '../../src/core/messages.js';
import type { Pack } from '../../src/shared/types.js';

const pack = sarcastic as Pack;

describe('sarcastic pack', () => {
  it('is identified as sarcastic', () => {
    expect(pack.id).toBe('sarcastic');
  });

  it('ships at least 60 lines', () => {
    expect(pack.lines.length).toBeGreaterThanOrEqual(60);
  });

  it('has no duplicate lines', () => {
    const texts = pack.lines.map((l) => l.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('has no blank lines', () => {
    expect(pack.lines.every((l) => l.text.trim().length > 0)).toBe(true);
  });

  it('offers lines at every stage of a three-stage ladder', () => {
    for (const stage of [0, 1, 2]) {
      expect(eligibleLines([pack], stage, 3).length).toBeGreaterThan(5);
    }
  });

  it('still offers final-stage lines on a two-stage ladder', () => {
    expect(eligibleLines([pack], 1, 2).length).toBeGreaterThan(5);
  });
});
