import type { PackLine } from '../shared/types.js';

export interface PackTextError {
  /** 1-indexed, matching what the editor shows. */
  line: number;
  message: string;
}

export interface ParsedPackText {
  lines: PackLine[];
  errors: PackTextError[];
}

const TAGGED = /^\[([^\]]*)\]\s*(.*)$/;

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

  text.split('\n').forEach((raw, index) => {
    const lineNumber = index + 1;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;

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
      return;
    }

    const [, tag, body] = match;
    const parts = tag.split(',').map((p) => p.trim());
    const stage = parts.map((p) => Number(p));

    if (tag.trim().length === 0 || stage.some((n) => !Number.isInteger(n) || n < 0)) {
      errors.push({ line: lineNumber, message: 'stage tag must be numbers, e.g. [0] or [0,1]' });
      return;
    }
    if (body.trim().length === 0) {
      errors.push({ line: lineNumber, message: 'line has a stage tag but no text' });
      return;
    }

    lines.push({ text: body.trim(), stage });
  });

  return { lines, errors };
}

export function formatPackText(lines: PackLine[]): string {
  return lines
    .map((line) =>
      line.stage === undefined ? line.text : `[${line.stage.join(',')}] ${line.text}`,
    )
    .join('\n');
}
