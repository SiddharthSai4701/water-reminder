import { describe, expect, it } from 'vitest';
import deadpan from '../../packs/deadpan.json' with { type: 'json' };
import drill from '../../packs/drill-sergeant.json' with { type: 'json' };
import wholesome from '../../packs/wholesome.json' with { type: 'json' };
import { eligibleLines } from '../../src/core/messages.js';
import { validatePackLines } from '../../src/core/packvalidate.js';
import type { Pack } from '../../src/shared/types.js';

const packs: Pack[] = [drill as Pack, wholesome as Pack, deadpan as Pack];

describe.each(packs)('$id pack', (pack) => {
  it('has an id matching its filename convention', () => {
    expect(pack.id).toMatch(/^[a-z-]+$/);
  });

  it('ships at least 20 lines', () => {
    expect(pack.lines.length).toBeGreaterThanOrEqual(20);
  });

  it('satisfies every pack content rule', () => {
    expect(validatePackLines(pack.lines)).toEqual([]);
  });

  it('offers lines at every stage of a three-stage ladder', () => {
    for (const stage of [0, 1, 2]) {
      expect(eligibleLines([pack], stage, 3).length).toBeGreaterThan(2);
    }
  });

  // A line that says "this is your fullscreen warning" is wrong for anyone on
  // Gentle, and the ladder is configurable by design.
  it('names no window mode', () => {
    for (const line of pack.lines) {
      expect(line.text).not.toMatch(/fullscreen|full screen|corner card/i);
    }
  });
});
