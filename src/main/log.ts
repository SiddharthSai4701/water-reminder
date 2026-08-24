import { app } from 'electron';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LogEvent } from '../shared/types.js';
import { parseLog, serializeEvent } from '../core/stats.js';

function logPath(): string {
  return join(app.getPath('userData'), 'intake.jsonl');
}

export function appendEvent(event: LogEvent): void {
  appendFileSync(logPath(), serializeEvent(event), 'utf8');
}

export function readEvents(): LogEvent[] {
  const path = logPath();
  if (!existsSync(path)) return [];
  return parseLog(readFileSync(path, 'utf8'));
}
