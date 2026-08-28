import { useState } from 'react';
import type { FocusEvent } from 'react';

/**
 * A remount counter for one pane's uncontrolled number inputs.
 *
 * Keying an input on its stored value alone only remounts when that value
 * *changes*, so any entry that normalizes back to what is already stored —
 * `50` typed into a goal already at its 250 floor, `30.2` typed into an
 * interval of 30 — leaves raw text sitting in a field the store never
 * accepted. Bumping this on every write that lands makes the key change
 * either way, so the field always ends up showing what was actually saved.
 */
export function useFieldRevision(): [number, () => void] {
  const [revision, setRevision] = useState(0);
  return [revision, () => setRevision((n) => n + 1)];
}

/** The key for a number input: its stored value plus the pane's revision. */
export function fieldKey(stored: number, revision: number): string {
  return `${stored}:${revision}`;
}

/**
 * The change handler for the panes' number inputs.
 *
 * A number input holds a *string*, and an unparseable one — a field cleared to
 * be retyped, a half-typed `1e` — reads back as `''`. `Number('')` is 0, which
 * normalizeConfig then clamps up to the field's floor: clearing the interval
 * would set reminders to every minute, a value the user never asked for. So
 * nothing parseable is not a value to store. Put the stored value back in the
 * field instead, since an uncontrolled input will not restore itself when no
 * patch is sent and therefore nothing re-renders.
 */
export function numberBlur(
  stored: number,
  apply: (value: number) => Promise<void>,
  settled: () => void,
): (event: FocusEvent<HTMLInputElement>) => void {
  return (event) => {
    const raw = event.currentTarget.value.trim();
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value)) {
      event.currentTarget.value = String(stored);
      return;
    }
    // Remount once the write has settled, not before: bumping first would
    // flash the previous value while the patch is still in flight.
    void apply(value).then(settled);
  };
}
