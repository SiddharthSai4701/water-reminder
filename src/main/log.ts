import { app } from 'electron';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LogEvent } from '../shared/types.js';
import { parseLog, serializeEvent } from '../core/stats.js';

function logPath(): string {
  return join(app.getPath('userData'), 'intake.jsonl');
}

export function appendEvent(event: LogEvent): void {
  try {
    appendFileSync(logPath(), serializeEvent(event), 'utf8');
  } catch (error) {
    // Losing one line of history is survivable. Throwing out of the IPC
    // handler that just recorded a drink is not.
    console.error('failed to append intake event:', error);
  }
}

export function readEvents(): LogEvent[] {
  try {
    const path = logPath();
    if (!existsSync(path)) return [];
    return parseLog(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error('failed to read intake log:', error);
    return [];
  }
}
