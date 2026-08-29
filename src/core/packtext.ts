import type { PackLine } from '../shared/types.js';

export interface PackTextError {
  /** 1-indexed, matching what the editor shows. */
  line: number;
  message: string;
}

export interface ParsedPackText {
  lines: PackLine[];
  errors: PackTextError[];
  /**
   * The 1-indexed row each entry of `lines` was typed on, parallel to it.
   * Blank rows and rejected rows are dropped from `lines`, so an index into
   * `lines` is not a row in the editor — anything reporting a problem about a
   * line has to come back through here or it points at the wrong one.
   */
  sourceLines: number[];
}

const TAGGED = /^\[([^\]]*)\]\s*(.*)$/;

/**
 * Written before a line whose own text starts with `[`, so the parser reads it
 * as body text rather than as a stage tag. One character, and only ever at the
 * very start of a line, because that is the only place `[` is ambiguous.
 */
const ESCAPE = '\\[';

/** Drops the escaping backslash, keeping the bracket it was protecting. */
function unescapeBody(text: string): string {
  return text.startsWith(ESCAPE) ? text.slice(1) : text;
}

/**
 * The editor's format: one line per row, with an optional stage tag in
 * brackets. An untagged line is eligible at every stage, matching
 * `PackLine.stage` being absent.
 *
 *   Your kidneys filed a complaint.
 *   [2] DRINK. THE. WATER.
 *   [0,1] {{glasses}} {{glassWord}} today. Bold strategy.
 *
 * A malformed tag is an error against its line rather than being treated as
 * body text: a line that quietly loses its tag reappears at the wrong volume.
 */
export function parsePackText(text: string): ParsedPackText {
  const lines: PackLine[] = [];
  const errors: PackTextError[] = [];
  const sourceLines: number[] = [];

  text.split('\n').forEach((raw, index) => {
    const lineNumber = index + 1;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;

    // A line the formatter escaped because its own text starts with a bracket.
    // Without this, "[0] literal text" written as body text formats to exactly
    // what a stage-tagged line formats to, and the next Save silently pins it
    // to stage 0 — or rejects it outright if the brackets hold a word.
    if (trimmed.startsWith(ESCAPE)) {
      lines.push({ text: unescapeBody(trimmed) });
      sourceLines.push(lineNumber);
      return;
    }

    const match = TAGGED.exec(trimmed);
    if (match === null) {
      // A line opening with `[` and no closing `]` is a malformed tag, not
      // body text. Reading it as text would silently drop the stage and the
      // line would come back at the wrong volume.
      if (trimmed.startsWith('[')) {
        errors.push({ line: lineNumber, message: 'stage tag is missing its closing ]' });
        return;
      }
      lines.push({ text: trimmed });
      sourceLines.push(lineNumber);
      return;
    }

    const [, tag, body] = match;
    const parts = tag.split(',').map((p) => p.trim());
    const stage = parts.map((p) => Number(p));

    if (
      tag.trim().length === 0 ||
      parts.some((p) => p.length === 0) ||
      stage.some((n) => !Number.isInteger(n) || n < 0)
    ) {
      errors.push({ line: lineNumber, message: 'stage tag must be numbers, e.g. [0] or [0,1]' });
      return;
    }
    if (body.trim().length === 0) {
      errors.push({ line: lineNumber, message: 'line has a stage tag but no text' });
      return;
    }

    // The body of a tagged line can itself start with a bracket, and it is
    // escaped the same way — the tag's brackets are syntax, the body's are text.
    lines.push({ text: unescapeBody(body.trim()), stage });
    sourceLines.push(lineNumber);
  });

  return { lines, errors, sourceLines };
}

export function formatPackText(lines: PackLine[]): string {
  return lines
    .map((line) => {
      // Escape the body first, then add the tag: the tag's own brackets are
      // syntax and must not be escaped, while the body's are text.
      const text = line.text.startsWith('[') ? `\\${line.text}` : line.text;
      return line.stage === undefined ? text : `[${line.stage.join(',')}] ${text}`;
    })
    .join('\n');
}
