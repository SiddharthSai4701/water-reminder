import { describe, expect, it } from 'vitest';
import { readPackShape } from '../../src/core/packfile.js';

describe('readPackShape', () => {
  it('accepts a well-formed pack', () => {
    const { pack, error } = readPackShape(
      { id: 'deadpan', name: 'Deadpan', lines: [{ text: 'Water.' }, { text: 'Loud.', stage: [2] }] },
      'deadpan',
    );
    expect(error).toBeNull();
    expect(pack).toEqual({
      id: 'deadpan',
      name: 'Deadpan',
      lines: [{ text: 'Water.' }, { text: 'Loud.', stage: [2] }],
    });
  });

  it('takes its id from the filename, not the file', () => {
    // Copying sarcastic.json to mine.json without editing the id field used to
    // produce a row with 0 lines and an editor that opened blank over 74 real
    // lines — and saving that blank editor overwrote them.
    const { pack } = readPackShape({ id: 'sarcastic', name: 'Mine', lines: [{ text: 'A.' }] }, 'mine');
    expect(pack?.id).toBe('mine');
  });

  it('falls back to the id when name is missing or not a string', () => {
    expect(readPackShape({ lines: [{ text: 'A.' }] }, 'mine').pack?.name).toBe('mine');
    expect(readPackShape({ name: 7, lines: [{ text: 'A.' }] }, 'mine').pack?.name).toBe('mine');
  });

  it('rejects a file that is not an object', () => {
    for (const raw of [null, 7, 'pack', [{ text: 'A.' }]]) {
      expect(readPackShape(raw, 'x').pack).toBeNull();
      expect(readPackShape(raw, 'x').error).not.toBeNull();
    }
  });

  it('rejects a pack with no lines array', () => {
    // {"id":"x","name":"X"} parses fine as JSON. It used to reach the reminder
    // loop and throw "pack.lines is not iterable" from a one-second tick, in a
    // process with no window to report it in.
    expect(readPackShape({ id: 'x', name: 'X' }, 'x').error).toMatch(/lines/);
    expect(readPackShape({ lines: {} }, 'x').error).toMatch(/lines/);
  });

  it('rejects a line that is not an object with text', () => {
    expect(readPackShape({ lines: ['Water.'] }, 'x').error).toMatch(/line 1/);
    expect(readPackShape({ lines: [{ text: 'A.' }, { text: 7 }] }, 'x').error).toMatch(/line 2/);
  });

  it('rejects a stage tag that is not a list of numbers', () => {
    expect(readPackShape({ lines: [{ text: 'A.', stage: 2 }] }, 'x').error).toMatch(/line 1/);
    expect(readPackShape({ lines: [{ text: 'A.', stage: ['2'] }] }, 'x').error).toMatch(/line 1/);
  });

  it('drops fields it does not know about rather than carrying them through', () => {
    const { pack } = readPackShape(
      { id: 'x', name: 'X', author: 'someone', lines: [{ text: 'A.', colour: 'red' }] },
      'x',
    );
    expect(pack).toEqual({ id: 'x', name: 'X', lines: [{ text: 'A.' }] });
  });

  it('names the pack in its error, since the pane shows the message verbatim', () => {
    expect(readPackShape({ lines: {} }, 'mine').error).toContain('mine');
  });
});
