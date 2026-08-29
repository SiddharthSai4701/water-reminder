import { describe, expect, it } from 'vitest';
import { formatPackText, parsePackText } from '../../src/core/packtext.js';

describe('parsePackText', () => {
  it('reads an untagged line as eligible at every stage', () => {
    const { lines, errors } = parsePackText('Your kidneys filed a complaint.');
    expect(errors).toEqual([]);
    expect(lines).toEqual([{ text: 'Your kidneys filed a complaint.' }]);
  });

  it('reads a single stage tag', () => {
    const { lines } = parsePackText('[2] DRINK. THE. WATER.');
    expect(lines).toEqual([{ text: 'DRINK. THE. WATER.', stage: [2] }]);
  });

  it('reads a multi-stage tag', () => {
    const { lines } = parsePackText('[0,1] Bold strategy.');
    expect(lines).toEqual([{ text: 'Bold strategy.', stage: [0, 1] }]);
  });

  it('tolerates spaces inside the tag', () => {
    const { lines } = parsePackText('[0, 1] Bold strategy.');
    expect(lines[0].stage).toEqual([0, 1]);
  });

  it('skips blank lines without reporting them', () => {
    const { lines, errors } = parsePackText('One.\n\n   \nTwo.');
    expect(lines).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  it('reports a malformed tag against its line number', () => {
    const { lines, errors } = parsePackText('One.\n[x] Two.');
    expect(lines).toHaveLength(1);
    expect(errors).toEqual([{ line: 2, message: 'stage tag must be numbers, e.g. [0] or [0,1]' }]);
  });

  it('reports an unclosed tag rather than reading it as body text', () => {
    const { lines, errors } = parsePackText('[99 DRINK.');
    expect(lines).toEqual([]);
    expect(errors).toEqual([{ line: 1, message: 'stage tag is missing its closing ]' }]);
  });

  it('reports an empty tag', () => {
    const { errors } = parsePackText('[] Two.');
    expect(errors).toHaveLength(1);
  });

  it('reports a trailing comma rather than injecting a phantom stage 0', () => {
    const { lines, errors } = parsePackText('[2,] Two.');
    expect(lines).toEqual([]);
    expect(errors).toEqual([{ line: 1, message: 'stage tag must be numbers, e.g. [0] or [0,1]' }]);
  });

  it('reports a leading comma rather than injecting a phantom stage 0', () => {
    const { lines, errors } = parsePackText('[,2] Two.');
    expect(lines).toEqual([]);
    expect(errors).toEqual([{ line: 1, message: 'stage tag must be numbers, e.g. [0] or [0,1]' }]);
  });

  it('reports a double comma rather than injecting a phantom stage 0', () => {
    const { lines, errors } = parsePackText('[2,,3] Two.');
    expect(lines).toEqual([]);
    expect(errors).toEqual([{ line: 1, message: 'stage tag must be numbers, e.g. [0] or [0,1]' }]);
  });

  it('reports a negative stage index', () => {
    const { lines, errors } = parsePackText('[-1] Two.');
    expect(lines).toEqual([]);
    expect(errors).toEqual([{ line: 1, message: 'stage tag must be numbers, e.g. [0] or [0,1]' }]);
  });

  it('reports a non-integer stage index', () => {
    const { lines, errors } = parsePackText('[1.5] Two.');
    expect(lines).toEqual([]);
    expect(errors).toEqual([{ line: 1, message: 'stage tag must be numbers, e.g. [0] or [0,1]' }]);
  });

  it('reports a tagged line with no text', () => {
    const { errors } = parsePackText('[1]   ');
    expect(errors).toEqual([{ line: 1, message: 'line has a stage tag but no text' }]);
  });

  it('preserves template variables verbatim', () => {
    const { lines } = parsePackText('[0] {{glasses}} {{glassWord}} today.');
    expect(lines[0].text).toBe('{{glasses}} {{glassWord}} today.');
  });
});

describe('formatPackText', () => {
  it('round-trips', () => {
    const text = 'Plain line.\n[2] Loud line.\n[0,1] Early line.';
    expect(formatPackText(parsePackText(text).lines)).toBe(text);
  });

  it('omits the tag for an untagged line', () => {
    expect(formatPackText([{ text: 'Plain.' }])).toBe('Plain.');
  });
});

describe('parsePackText source lines', () => {
  it('records the row each parsed line came from', () => {
    const { lines, sourceLines } = parsePackText('One.\nTwo.');
    expect(lines).toHaveLength(2);
    expect(sourceLines).toEqual([1, 2]);
  });

  it('keeps the rows the user typed when blank rows are dropped', () => {
    // parsePackText skips blank rows, so the nth parsed line is not the nth
    // row of the textarea. An issue reported against the array index points at
    // the wrong line in the editor, which is worse than no line number at all.
    const { sourceLines } = parsePackText('One.\n\n   \nTwo.');
    expect(sourceLines).toEqual([1, 4]);
  });

  it('skips the rows it rejected as errors', () => {
    const { lines, sourceLines } = parsePackText('One.\n[x] Bad.\nTwo.');
    expect(lines).toHaveLength(2);
    expect(sourceLines).toEqual([1, 3]);
  });

  it('stays parallel to lines for a trailing newline', () => {
    const { lines, sourceLines } = parsePackText('One.\n');
    expect(sourceLines).toHaveLength(lines.length);
    expect(sourceLines).toEqual([1]);
  });
});

describe('a literal line that starts with a bracket', () => {
  it('round-trips instead of being read as a stage tag', () => {
    // Untagged text beginning "[0] " formatted to exactly the same string a
    // tagged line formats to, so opening a pack and pressing Save silently
    // pinned the line to stage 0. v1 customLines are free text and can start
    // with anything.
    const lines = [{ text: '[0] this is literal text' }];
    const parsed = parsePackText(formatPackText(lines));
    expect(parsed.errors).toEqual([]);
    expect(parsed.lines).toEqual(lines);
  });

  it('round-trips a bracket that is not a number either', () => {
    const lines = [{ text: '[sigh] fine.' }];
    const parsed = parsePackText(formatPackText(lines));
    expect(parsed.errors).toEqual([]);
    expect(parsed.lines).toEqual(lines);
  });

  it('keeps escaping and tagging independent', () => {
    const lines = [{ text: '[0] literal', stage: [2] }];
    expect(formatPackText(lines)).toBe('[2] \\[0] literal');
    expect(parsePackText(formatPackText(lines)).lines).toEqual(lines);
  });

  it('still reads a real tag', () => {
    expect(parsePackText('[2] DRINK.').lines).toEqual([{ text: 'DRINK.', stage: [2] }]);
  });
});
