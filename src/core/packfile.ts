import type { Pack, PackLine } from '../shared/types.js';

/**
 * Structural validation for a pack file, separate from the content rules in
 * `packvalidate.ts`: this is about whether the JSON is a pack at all.
 *
 * `JSON.parse(text) as Pack` is a lie the type system cannot catch. A file
 * like `{"id":"x","name":"X"}` parses perfectly and then reaches the reminder
 * loop, where `for (const line of pack.lines)` throws "pack.lines is not
 * iterable" from a one-second tick — an uncaught exception in a process with
 * no window to report it in. The packs directory is a supported place for
 * people to hand-author files, so a wrong shape has to come back as a message
 * the Packs pane can show, exactly like a parse error does.
 */
export function readPackShape(
  raw: unknown,
  id: string,
): { pack: Pack | null; error: string | null } {
  const fail = (message: string): { pack: null; error: string } => ({
    // The pane prints this verbatim beside the row, and a user who lands here
    // is about to go looking for the file. Name it.
    pack: null,
    error: `${id}.json — ${message}`,
  });

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return fail('this file is not a pack object');
  }

  const record = raw as Record<string, unknown>;
  if (!Array.isArray(record.lines)) {
    return fail('a pack needs a "lines" array');
  }

  const lines: PackLine[] = [];
  for (const [index, entry] of record.lines.entries()) {
    const at = `line ${index + 1}`;
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      return fail(`${at} is not an object`);
    }
    const line = entry as Record<string, unknown>;
    if (typeof line.text !== 'string') {
      return fail(`${at} has no "text" string`);
    }
    if (line.stage === undefined) {
      lines.push({ text: line.text });
      continue;
    }
    if (!Array.isArray(line.stage) || !line.stage.every((n) => typeof n === 'number')) {
      return fail(`${at} has a "stage" that is not a list of numbers`);
    }
    // Rebuilt field by field rather than spread: an unknown key carried through
    // here would be written straight back out by the editor's save, quietly
    // preserving something nothing in the app understands.
    lines.push({ text: line.text, stage: [...(line.stage as number[])] });
  }

  return {
    // The filename is the pack's identity everywhere else — `listPackIds` reads
    // the directory, `writeUserPack` names the file from the id, and a user
    // pack replaces a shipped one by having the same filename. A file whose
    // internal id disagrees used to show 0 lines and open an empty editor over
    // real content. The file does not get a vote.
    pack: { id, name: typeof record.name === 'string' ? record.name : id, lines },
    error: null,
  };
}
