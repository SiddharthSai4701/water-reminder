import type { Config, Schedule } from '../../shared/types.js';

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

export default function SchedulePane({ config, patch }: Props): JSX.Element {
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
        <input
          type="number"
          min={1}
          max={600}
          defaultValue={s.intervalMinutes}
          onBlur={(e) => void setSchedule({ intervalMinutes: Number(e.currentTarget.value) })}
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
            onChange={(e) => void setSchedule({ workStartMinute: fromTimeValue(e.currentTarget.value) })}
          />
        </label>
        <label>
          To
          <input
            type="time"
            value={toTimeValue(s.workEndMinute)}
            onChange={(e) => void setSchedule({ workEndMinute: fromTimeValue(e.currentTarget.value) })}
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
      </fieldset>

      <label>
        Snooze for
        <input
          type="number"
          min={1}
          max={240}
          defaultValue={config.defaultSnoozeMinutes}
          onBlur={(e) => void patch({ defaultSnoozeMinutes: Number(e.currentTarget.value) })}
        />
        minutes by default
      </label>
    </div>
  );
}
