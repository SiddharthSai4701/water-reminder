import { describe, it, expect } from 'vitest';
import {
  RECENT_LIMIT,
  effectiveStage,
  eligibleLines,
  pickLine,
  pushRecent,
  renderTemplate,
  type PickContext,
} from '../../src/core/messages.js';
import type { Pack } from '../../src/shared/types.js';

const ctx: PickContext = { glasses: 3, streak: 5, goalPct: 42 };

const pack: Pack = {
  id: 'test',
  name: 'Test',
  lines: [
    { text: 'early one', stage: [0] },
    { text: 'early two', stage: [0, 1] },
    { text: 'late one', stage: [2] },
    { text: 'anywhere' },
  ],
};

describe('renderTemplate', () => {
  it('substitutes every supported variable', () => {
    const out = renderTemplate('{{glasses}} / {{streak}} / {{goalPct}}%', ctx);
    expect(out).toBe('3 / 5 / 42%');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(renderTemplate('{{nope}}', ctx)).toBe('{{nope}}');
  });
});

describe('effectiveStage', () => {
  it('passes a tag through when the ladder is long enough', () => {
    expect(effectiveStage(2, 3)).toBe(2);
  });

  it('clamps a tag beyond the ladder to the final stage', () => {
    expect(effectiveStage(2, 2)).toBe(1);
  });
});

describe('eligibleLines', () => {
  it('selects stage-tagged and untagged lines for stage 0', () => {
    const texts = eligibleLines([pack], 0, 3).map((l) => l.text);
    expect(texts).toEqual(['early one', 'early two', 'anywhere']);
  });

  it('selects only late and untagged lines for the final stage', () => {
    const texts = eligibleLines([pack], 2, 3).map((l) => l.text);
    expect(texts).toEqual(['late one', 'anywhere']);
  });

  it('folds a stage-2 line onto stage 1 of a two-stage ladder', () => {
    const texts = eligibleLines([pack], 1, 2).map((l) => l.text);
    expect(texts).toEqual(['early two', 'late one', 'anywhere']);
  });

  it('pools lines across multiple active packs', () => {
    const other: Pack = { id: 'b', name: 'B', lines: [{ text: 'from b' }] };
    const texts = eligibleLines([pack, other], 0, 3).map((l) => l.text);
    expect(texts).toContain('from b');
  });
});

describe('pickLine', () => {
  it('renders the chosen line', () => {
    const templated: Pack = { id: 't', name: 'T', lines: [{ text: '{{glasses}} glasses' }] };
    expect(pickLine([templated], 0, 1, [], ctx, () => 0)).toBe('3 glasses');
  });

  it('excludes recently used lines', () => {
    const picked = pickLine([pack], 0, 3, ['early one', 'early two'], ctx, () => 0);
    expect(picked).toBe('anywhere');
  });

  it('ignores the recent list when it would exclude everything', () => {
    const recent = ['early one', 'early two', 'anywhere'];
    const picked = pickLine([pack], 0, 3, recent, ctx, () => 0);
    expect(picked).toBe('early one');
  });

  it('returns a fallback when no line is eligible', () => {
    const empty: Pack = { id: 'e', name: 'E', lines: [] };
    expect(pickLine([empty], 0, 1, [], ctx, () => 0)).toBe('Time to drink water.');
  });
});

describe('pushRecent', () => {
  it('keeps only the most recent entries', () => {
    let recent: string[] = [];
    for (let i = 0; i < RECENT_LIMIT + 3; i++) recent = pushRecent(recent, `line ${i}`);
    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(recent[0]).toBe('line 3');
  });
});
