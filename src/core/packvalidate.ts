import type { PackLine } from '../shared/types.js';

export interface PackIssue {
  /** 1-indexed. Absent for issues about the pack as a whole. */
  line?: number;
  message: string;
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
