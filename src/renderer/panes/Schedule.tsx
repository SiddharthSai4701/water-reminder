import type { ChangeEvent } from 'react';
import type { Config, Schedule } from '../../shared/types.js';
import { fieldKey, numberBlur, useFieldRevision } from './numberField.js';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const OFFICE_HOURS = { start: 9 * 60, end: 18 * 60 };

interface Props {
  config: Config;
  patch: (partial: Partial<Config>) => Promise<void>;
}

function toTimeValue(minutes: number): string {
  // 1440 has no representation in <input type="time">; show the last minute
  // and let the Always-on checkbox carry the real meaning.
  const m = Math.min(minutes, 1439);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function fromTimeValue(value: string): number {
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

/**
 * A cleared time input reports an empty value and still fires change, and
 * fromTimeValue of an empty string is NaN - which clampNumber replaces with
 * the *default* rather than with the value already stored. Backspacing the
 * From field of a 22:00-06:00 window to retype it would rewrite the window to
 * 00:00-06:00 and take the user's whole waking day of reminders with it.
 * Refuse to store anything that is not a real time, and put the stored one
 * back in the field: nothing is patched, so nothing re-renders to restore it.
 */
function setTime(
  event: ChangeEvent<HTMLInputElement>,
  stored: number,
  apply: (minutes: number) => void,
): void {
  const minutes = fromTimeValue(event.currentTarget.value);
  if (!Number.isFinite(minutes)) {
    event.currentTarget.value = toTimeValue(stored);
    return;
  }
  apply(minutes);
}

export default function SchedulePane({ config, patch }: Props): JSX.Element {
  // One counter per field: see useFieldRevision on why these are not shared.
  const [intervalRevision, bumpInterval] = useFieldRevision();
  const [snoozeRevision, bumpSnooze] = useFieldRevision();
  const s = config.schedule;
  const alwaysOn = s.workStartMinute === 0 && s.workEndMinute === 1440;
  const overnight = s.workEndMinute <= s.workStartMinute;

  const setSchedule = (next: Partial<Schedule>): Promise<void> =>
    patch({ schedule: { ...s, ...next } });

  function toggleDay(day: number): void {
    const next = s.workDays.includes(day)
      ? s.workDays.filter((d) => d !== day)
      : [...s.workDays, day].sort();
    // An empty workDays means the app never fires again, with nothing on
    // screen to say why. That is the silent-stop shape v0.1.4 was about.
    if (next.length === 0) return;
    void setSchedule({ workDays: next });
  }

  return (
    <div className="pane">
      <label>
        Remind me every
        {/* defaultValue + onBlur, not value + onChange: a controlled number
            input is clamped on every keystroke and fights the user mid-type.
            The key remounts the field after every write that lands, so a
            clamped or rounded value snaps the field to what was actually
            stored rather than leaving it showing a number nobody saved. */}
        <input
          key={fieldKey(s.intervalMinutes, intervalRevision)}
          type="number"
          min={1}
          max={600}
          defaultValue={s.intervalMinutes}
          onBlur={numberBlur(
            s.intervalMinutes,
            (v) => setSchedule({ intervalMinutes: v }),
            bumpInterval,
          )}
        />
        minutes
      </label>

      <label>
        <input
          type="checkbox"
          checked={alwaysOn}
          onChange={(e) =>
            void setSchedule(
              e.currentTarget.checked
                ? { workStartMinute: 0, workEndMinute: 1440 }
                : { workStartMinute: OFFICE_HOURS.start, workEndMinute: OFFICE_HOURS.end },
            )
          }
        />
        Always on
      </label>

      <fieldset disabled={alwaysOn}>
        <legend>Hours</legend>
        <label>
          From
          <input
            type="time"
            value={toTimeValue(s.workStartMinute)}
            onChange={(e) =>
              setTime(e, s.workStartMinute, (m) => void setSchedule({ workStartMinute: m }))
            }
          />
        </label>
        <label>
          To
          <input
            type="time"
            value={toTimeValue(s.workEndMinute)}
            onChange={(e) =>
              setTime(e, s.workEndMinute, (m) => void setSchedule({ workEndMinute: m }))
            }
          />
        </label>
        {overnight && !alwaysOn && (
          <p className="note">{`Overnight — runs until ${toTimeValue(s.workEndMinute)} the next morning.`}</p>
        )}
      </fieldset>

      <fieldset>
        <legend>Days</legend>
        {DAY_NAMES.map((name, day) => (
          <button
            key={name}
            type="button"
            aria-pressed={s.workDays.includes(day)}
            onClick={() => toggleDay(day)}
          >
            {name}
          </button>
        ))}
        {s.workDays.length === 1 && (
          // A refusal the user cannot see reads as a dead button, which is the
          // small version of the silent stop this rule exists to prevent.
          <p className="note">At least one day is needed, so the last one cannot be cleared.</p>
        )}
      </fieldset>

      <label>
        Snooze for
        <input
          key={fieldKey(config.defaultSnoozeMinutes, snoozeRevision)}
          type="number"
          min={1}
          max={240}
          defaultValue={config.defaultSnoozeMinutes}
          onBlur={numberBlur(
            config.defaultSnoozeMinutes,
            (v) => patch({ defaultSnoozeMinutes: v }),
            bumpSnooze,
          )}
        />
        minutes by default
      </label>
    </div>
  );
}
