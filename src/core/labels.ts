import { isWithinWorkHours, type SchedulerState, type WorkHours } from './scheduler.js';
import { addLocalDays } from './stats.js';

const MIN = 60_000;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * The first instant at or after `t` when reminders may fire again. Day
 * arithmetic goes through addLocalDays and the opening time through
 * setMinutes, so a DST transition shifts the wall clock, not the boundary.
 */
export function nextWorkWindowStart(t: number, hours: WorkHours): number {
  const wraps = hours.workEndMinute <= hours.workStartMinute;

  // A week plus a day: enough to reach any opening, bounded so an empty
  // workDays list cannot spin a background process forever.
  for (let i = 0; i <= 7; i++) {
    const midnight = addLocalDays(t, i);
    if (!hours.workDays.includes(new Date(midnight).getDay())) continue;

    // A wrapping window has TWO openings on each of its listed days: midnight,
    // because the window covers 00:00 up to workEndMinute, and workStartMinute
    // that evening. Taking only midnight told a user on 22:00-02:00 at noon
    // that reminders resume "00:00 tomorrow" while the scheduler fired at
    // 22:00 the same evening — a countdown disagreeing with the scheduler is
    // the exact bug this module was extracted to fix.
    const opening = new Date(midnight);
    opening.setMinutes(hours.workStartMinute);
    const candidates = wraps ? [midnight, opening.getTime()] : [opening.getTime()];

    const next = candidates.filter((c) => c > t).sort((a, b) => a - b)[0];
    if (next !== undefined) return next;
  }
  return t;
}

function formatWhen(target: number, now: number): string {
  const d = new Date(target);
  const time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay = addLocalDays(target, 0) === addLocalDays(now, 0);
  return sameDay ? time : `${time} ${DAY_NAMES[d.getDay()]}`;
}

/**
 * What the tray says about the next reminder.
 *
 * The scheduler holds in `idle` with an overdue nextDueAt whenever the clock
 * is outside work hours, so "time remaining" alone cannot tell a countdown
 * from a deliberate hold — it reported "Due now" all evening while nothing
 * was on screen. The label asks the same work-hours question the scheduler
 * asks, and names the hold.
 */
export function countdownLabel(
  state: SchedulerState,
  now: number,
  hours: WorkHours,
): string {
  if (state.phase === 'paused') return 'Paused';
  if (state.phase === 'due') return 'Waiting on you';

  const due = Math.max(now, state.nextDueAt);
  const target = isWithinWorkHours(due, hours) ? due : nextWorkWindowStart(due, hours);

  if (!isWithinWorkHours(now, hours)) {
    return `Outside work hours · resumes ${formatWhen(target, now)}`;
  }
  if (target <= now) return 'Due now';
  if (target !== due) return `Next drink at ${formatWhen(target, now)}`;
  return `Next drink in ${Math.max(1, Math.round((target - now) / MIN))} min`;
}

/**
 * Hydration progress for the tray tooltip, e.g. "1.2 / 4.0 L".
 *
 * One decimal place on both halves, including a whole number: "4 / 4.0 L"
 * reads as two different units at a glance. It deliberately does not stop at
 * the goal — passing it is a fact about the day, not an error state.
 */
export function progressLabel(ml: number, goalMl: number): string {
  const litres = (value: number): string => (value / 1000).toFixed(1);
  return `${litres(ml)} / ${litres(goalMl)} L`;
}
