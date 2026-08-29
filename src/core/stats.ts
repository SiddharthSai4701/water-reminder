import type { LogEvent, LogEventType } from '../shared/types.js';

const TYPES: LogEventType[] = ['drank', 'skip', 'snooze'];

export function serializeEvent(event: LogEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export function parseLog(text: string): LogEvent[] {
  const events: LogEvent[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<LogEvent>;
      if (typeof parsed.ts !== 'number') continue;
      if (!TYPES.includes(parsed.type as LogEventType)) continue;
      events.push(parsed as LogEvent);
    } catch {
      // A truncated final line after a crash is expected; skip it.
    }
  }
  return events;
}

export function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Calendar-day arithmetic, so DST transitions do not shift the boundary. */
export function addLocalDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function eventsOnDay(events: LogEvent[], dayStart: number): LogEvent[] {
  const dayEnd = addLocalDays(dayStart, 1);
  return events.filter((e) => e.ts >= dayStart && e.ts < dayEnd);
}

export function mlOnDay(events: LogEvent[], dayStart: number): number {
  return eventsOnDay(events, dayStart)
    .filter((e) => e.type === 'drank')
    // Type-checked, not just defaulted: a hand-edited "ml": "250" would
    // otherwise concatenate into the total.
    .reduce((sum, e) => sum + (typeof e.ml === 'number' && Number.isFinite(e.ml) ? e.ml : 0), 0);
}

export function glassesOnDay(events: LogEvent[], dayStart: number): number {
  return eventsOnDay(events, dayStart).filter((e) => e.type === 'drank').length;
}

export function goalPct(ml: number, goalMl: number): number {
  if (goalMl <= 0) return 0;
  return Math.round((ml / goalMl) * 100);
}

/**
 * Consecutive days meeting the goal, ending today. Today counts only once it
 * has met the goal, but an incomplete today never breaks a running streak.
 */
export function currentStreak(events: LogEvent[], goalMl: number, now: number): number {
  // Without this a non-positive goal makes every day count as met, and the
  // loop walks backwards until dates stop being representable — a hang in a
  // process the user cannot see.
  if (goalMl <= 0) return 0;

  const today = startOfLocalDay(now);
  let streak = 0;
  let day = today;

  if (mlOnDay(events, today) >= goalMl) {
    streak += 1;
  }
  day = addLocalDays(day, -1);

  while (mlOnDay(events, day) >= goalMl) {
    streak += 1;
    day = addLocalDays(day, -1);
  }

  return streak;
}
