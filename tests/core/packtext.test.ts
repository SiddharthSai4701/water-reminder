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
