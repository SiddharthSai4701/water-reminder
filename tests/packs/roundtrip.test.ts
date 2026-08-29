import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { formatPackText, parsePackText } from '../../src/core/packtext.js';
import { readPackShape } from '../../src/core/packfile.js';
import { validatePackLines } from '../../src/core/packvalidate.js';

/**
 * Every shipped pack has to survive being opened in the settings editor and
 * saved again unchanged. The editor's format is a *view* of the JSON, so a
 * line the formatter writes and the parser then reads differently would be
 * silently rewritten the first time anyone pressed Save — a line starting with
 * `[`, say, or a stage tag the formatter emits in a shape the parser rejects.
 *
 * Reads the directory rather than importing four files by name: a fifth pack
 * added later is covered without anyone remembering to add it here.
 */
const files = readdirSync('packs').filter((name) => name.endsWith('.json'));

describe.each(files)('%s survives the settings editor', (file) => {
  const id = file.slice(0, -'.json'.length);
  const { pack, error } = readPackShape(JSON.parse(readFileSync(`packs/${file}`, 'utf8')), id);

  it('is a structurally valid pack file', () => {
    expect(error).toBeNull();
    expect(pack).not.toBeNull();
  });

  it('formats, parses back identically, and still validates', () => {
    const lines = pack?.lines ?? [];
    const parsed = parsePackText(formatPackText(lines));
    expect(parsed.errors).toEqual([]);
    expect(parsed.lines).toEqual(lines);
    expect(parsed.sourceLines).toHaveLength(parsed.lines.length);
    expect(validatePackLines(parsed.lines)).toEqual([]);
  });
});
