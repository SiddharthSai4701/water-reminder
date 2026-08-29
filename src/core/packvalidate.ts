import type { PackLine } from '../shared/types.js';

export interface PackIssue {
  /** 1-indexed. Absent for issues about the pack as a whole. */
  line?: number;
  message: string;
}

/**
 * Re-points issues found in a parsed pack at the rows the user actually typed.
 *
 * `validatePackLines` numbers its issues by position in the array it was
 * given, and parsing drops blank and rejected rows — so "Line 10" from the
 * validator can be row 12 in the editor. A line number that points at the
 * wrong line is worse than none: it sends the user to edit a line that is
 * fine. `sourceLines` comes from `parsePackText`, parallel to its `lines`.
 *
 * An issue with no line is about the pack as a whole and passes through. A
 * number with no row to map to keeps what it had: a caller that passed a
 * mismatched map has a bug, and hiding the issue does not fix it.
 */
export function atSourceLines(issues: PackIssue[], sourceLines: number[]): PackIssue[] {
  return issues.map((issue) => {
    if (issue.line === undefined) return issue;
    const source = sourceLines[issue.line - 1];
    return source === undefined ? issue : { ...issue, line: source };
  });
}

/** "{{glasses}} glasses" reads as "1 glasses" whenever the count is one. */
const HARDCODED_PLURAL = /\{\{glasses\}\}\s+(glasses|glass)\b/i;

export function validatePackLines(
  lines: PackLine[],
  options: { minLines?: number } = {},
): PackIssue[] {
  const issues: PackIssue[] = [];

  if (lines.length === 0) {
    issues.push({ message: 'a pack needs at least one line' });
    return issues;
  }

  if (options.minLines !== undefined && lines.length < options.minLines) {
    issues.push({ message: `this pack needs at least ${options.minLines} lines` });
  }

  const seen = new Set<string>();
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.text.trim().length === 0) {
      issues.push({ line: lineNumber, message: 'blank line' });
      return;
    }
    if (seen.has(line.text)) {
      issues.push({ line: lineNumber, message: 'duplicate line' });
    }
    seen.add(line.text);
    if (HARDCODED_PLURAL.test(line.text)) {
      issues.push({
        line: lineNumber,
        message: 'use {{glassWord}} after {{glasses}} so the noun agrees with the count',
      });
    }
  });

  return issues;
}
