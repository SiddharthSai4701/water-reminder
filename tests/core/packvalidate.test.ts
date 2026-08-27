import { describe, expect, it } from 'vitest';
import { validatePackLines } from '../../src/core/packvalidate.js';

describe('validatePackLines', () => {
  it('accepts a clean pack', () => {
    expect(validatePackLines([{ text: 'One.' }, { text: 'Two.' }])).toEqual([]);
  });

  it('rejects an empty pack', () => {
    expect(validatePackLines([])).toEqual([{ message: 'a pack needs at least one line' }]);
  });

  it('reports duplicates against the second occurrence', () => {
    const issues = validatePackLines([{ text: 'Same.' }, { text: 'Same.' }]);
    expect(issues).toEqual([{ line: 2, message: 'duplicate line' }]);
  });

  it('reports a hardcoded plural noun after a glass count', () => {
    const issues = validatePackLines([{ text: '{{glasses}} glasses today.' }]);
    expect(issues).toEqual([
      { line: 1, message: 'use {{glassWord}} after {{glasses}} so the noun agrees with the count' },
    ]);
  });

  it('accepts the templated form', () => {
    expect(validatePackLines([{ text: '{{glasses}} {{glassWord}} today.' }])).toEqual([]);
  });

  it('enforces a minimum when one is given', () => {
    const issues = validatePackLines([{ text: 'One.' }], { minLines: 60 });
    expect(issues).toEqual([{ message: 'this pack needs at least 60 lines' }]);
  });
});
