import type { FocusEvent } from 'react';

/**
 * The blur handler for the panes' number inputs.
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
  apply: (value: number) => void,
): (event: FocusEvent<HTMLInputElement>) => void {
  return (event) => {
    const raw = event.currentTarget.value.trim();
    const value = Number(raw);
    if (raw === '' || !Number.isFinite(value)) {
      event.currentTarget.value = String(stored);
      return;
    }
    apply(value);
  };
}
