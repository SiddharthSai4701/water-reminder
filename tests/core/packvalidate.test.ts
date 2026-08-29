import { describe, expect, it } from 'vitest';
import { atSourceLines, validatePackLines } from '../../src/core/packvalidate.js';

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

  it('reports a whitespace-only line as blank', () => {
    const issues = validatePackLines([{ text: '  ' }]);
    expect(issues).toEqual([{ line: 1, message: 'blank line' }]);
  });

  it('reports two blank lines as blank, not as a duplicate', () => {
    const issues = validatePackLines([{ text: '  ' }, { text: '  ' }]);
    expect(issues).toEqual([
      { line: 1, message: 'blank line' },
      { line: 2, message: 'blank line' },
    ]);
  });
});

describe('atSourceLines', () => {
  it('re-points an issue at the row the user typed', () => {
    expect(atSourceLines([{ line: 2, message: 'duplicate line' }], [1, 4])).toEqual([
      { line: 4, message: 'duplicate line' },
    ]);
  });

  it('leaves a whole-pack issue alone', () => {
    expect(atSourceLines([{ message: 'a pack needs at least one line' }], [])).toEqual([
      { message: 'a pack needs at least one line' },
    ]);
  });

  it('keeps the original number when there is no row for it', () => {
    // A wrong line number is still more use than undefined, and a mismatched
    // map is a bug in the caller rather than something to hide from the user.
    expect(atSourceLines([{ line: 3, message: 'duplicate line' }], [1])).toEqual([
      { line: 3, message: 'duplicate line' },
    ]);
  });
});
