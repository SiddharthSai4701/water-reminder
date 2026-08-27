# Water Reminder Phase 3a — Design Spec

Date: 2026-08-27
Status: Approved for planning
Follows: v0.1.4
Supersedes: the "Phase 3" row of the original design spec, §15

## 1. Why 3a exists

The original spec's Phase 3 bundled a settings window, three new message
packs, a custom-line editor, a theme system, a four-state mascot, sound, and
a stats view. That is more than one spec should carry. It also forces every
visual decision to be made in the abstract, before the settings UI has been
lived with.

Phase 3 splits:

| Phase | Scope |
|---|---|
| **3a** | Settings window, config migration, schedule, escalation presets, packs and the line editor |
| **3b** | Themes, mascot states, sound, stats view — specced after 3a is in daily use |

3a is buildable on the Windows development machine and touches none of the
macOS behaviours Phase 2 verifies. It introduces exactly one new macOS
unknown, recorded in §6.

**The config migration hook lands first.** `normalizeConfig` currently
ignores the incoming `version` and stamps `CONFIG_VERSION` unconditionally,
so any config change ships against files already claiming the new version.
3a changes the config shape, so the hook cannot wait.

## 2. Architecture

The main process is the sole source of truth. The settings renderer holds no
draft copy of anything.

Settings is a second `BrowserWindow` with its own renderer entry and **its
own preload**. The popup keeps its existing four-method surface, so
config-write powers never reach a window the user is forbidden from closing.

```
settings renderer --invoke settings:patch(partial)--> main
  main: saveConfig
  main: applyEffects(onConfigChange(state, oldCfg, newCfg, now))
  main: tray.refresh()
  main: broadcast settings:changed(config) --> renderer re-renders from truth
```

Every control writes through immediately; text fields commit on blur or a
short debounce. There is no Save button, and so no second copy of the truth
to reconcile with a config that changed elsewhere. A tray pause, a
`Reload config file`, or a DND expiry pushes the same `settings:changed`
event, so an open settings window cannot go stale.

### New pure core modules

- **`src/core/migrate.ts`** — `migrateConfig(raw)` reads `raw.version`,
  branches, and returns the raw shape for `normalizeConfig` plus any side
  effects the shell must perform. See §3.
- **`scheduler.onConfigChange(state, oldCfg, newCfg, now): Transition`** —
  sits beside `onDrank` and `onSkip`. See §4.
- **`src/core/packtext.ts`** — `parsePackText` and `formatPackText`. See §5.

### New shell modules

- **`src/main/settings-window.ts`** — single-instance `BrowserWindow`,
  standard chrome, 720×560, created on demand.
- **`src/preload/settings.ts`** — a second preload entry.
- **`src/renderer/settings.html`**, `Settings.tsx`, `settings.css`, added as
  a second rollup input in `electron.vite.config.ts`.

### IPC surface

| Channel | Direction | Payload |
|---|---|---|
| `settings:get` | invoke | → `{ config, packs: PackSummary[] }` |
| `settings:patch` | invoke | `Partial<Config>` → normalized `Config` |
| `settings:packs:read` | invoke | `id` → pack text |
| `settings:packs:write` | invoke | `id`, text → `{ ok } \| { errors }` |
| `settings:packs:revert` | invoke | `id` → `PackSummary[]` |
| `settings:packs:reveal` | send | — |
| `settings:changed` | push to renderer | `Config` |

```ts
interface PackSummary {
  id: string;
  name: string;
  lineCount: number;
  active: boolean;
  /** A user file exists for this id. Shipped packs start false. */
  customised: boolean;
  /** Present when the file failed to load; the pane shows it verbatim. */
  error?: string;
}
```

`settings:patch` returns the normalized config rather than the patch, so the
renderer always renders what was actually stored — a clamped or rejected
value is visible immediately rather than silently diverging.

### Opening settings during a reminder

The popup is `alwaysOnTop`, so a settings window opened while a reminder is
up sits behind it; at the fullscreen stage settings is unreachable until the
reminder is answered. **This is the core promise working, not a bug.** It is
documented rather than carved out as an exception, because every exception to
"the reminder cannot resolve itself" is a way for the reminder to resolve
itself.

## 3. Config v2

Three changes and one real migration. The migration exists partly on its own
merits and partly so the version hook is exercised by something other than an
identity branch.

| Field | v1 | v2 |
|---|---|---|
| `nextDueAt` | — | `number \| null`, persisted |
| `customLines` | `string[]` in config | removed — migrated to a user pack file |
| `version` | stamped blindly | read and branched |

### Persisting `nextDueAt`

Written on every scheduler transition. On startup:

- a future value is adopted as-is;
- a past value produces **one** prompt reminder, never a burst — the same
  collapse rule `powerMonitor`'s `resume` already applies;
- a missing or non-finite value falls back to `now + interval`, today's
  behaviour.

This closes the drift where every relaunch bought a fresh full interval.
With autostart on and a user who occasionally quits, reminders walk later
indefinitely.

It is state living in config rather than true configuration. `dndUntil`
already set that precedent, and a second file for two fields is not worth
the migration story it would need.

### Migrating `customLines`

`migrateConfig` is pure and cannot write files, so it returns the work for
the shell to perform:

```ts
migrateConfig(raw) → {
  raw,                                    // for normalizeConfig
  effects: { writeCustomPack?: string[] } // main writes <userData>/packs/custom.json
}
```

Main performs the write before `loadPacks` runs, so the lines are never
missing for a tick, and **before the migrated config is persisted**. The
version stamp is what records that the migration happened, so a failed pack
write must leave the config at v1 and let the next launch try again. Losing a
user's own lines to a transient disk error is not an acceptable failure mode,
and a migration that records itself before doing its work cannot retry.

The `custom` pseudo-pack that `loadPacks` synthesises from `config.customLines`
goes away; a real file replaces it.

## 4. Schedule and applying changes

### Applying a changed interval

Changing the interval rescales from the last reminder rather than from now:

```
anchor = state.nextDueAt - oldIntervalMs
next   = anchor + newIntervalMs
if (next <= now) fire promptly
```

No new state is needed — the anchor is derivable. Restarting the countdown
from `now` would mean every visit to settings silently buys a fresh full
interval, which is easy to do by accident and impossible to notice.

Changing the ladder while a reminder is unanswered re-derives the current
stage from elapsed time rather than dropping back to stage 0, so switching
from Standard to Relentless mid-reminder escalates rather than restarts.

### Overnight windows

`normalizeSchedule` currently requires `workEndMinute > workStartMinute` and
falls back to the default window otherwise, so a 22:00–02:00 schedule is
silently discarded. 3a accepts the wrap:

```ts
// isWithinWorkHours, wrapping form
const wraps = end <= start;
return wraps
  ? (minuteOfDay >= start || minuteOfDay < end)
  : (minuteOfDay >= start && minuteOfDay < end);
```

`workDays` continues to be evaluated against the day the reminder falls on,
not the day the window opened. An overnight window is a window on each of its
listed days, not a window that drags the previous day's membership across
midnight — the simpler rule, and the one that matches "reminders on
Wednesday" meaning what a person expects.

`nextWorkWindowStart` (added in v0.1.4) must handle the wrap too: under a
wrapping window every minute of a listed day is inside it, so the function
must not walk forward looking for an opening that is already behind it.

### Always on

A checkbox writing `workStartMinute: 0`, `workEndMinute: 1440` — not a magic
sentinel value, so `isWithinWorkHours` needs no special case. `1440` rather
than `1439` because the comparison is `<`; a 23:59 end leaves the final
minute of every day a silent hold, which is the exact bug shape v0.1.4 fixed.

The v0.1.4 default is already 24/7. This makes it reachable again after a
user has changed it, and expressible in the UI.

## 5. Packs

Two sources, one pool. Hand-editing pack JSON keeps working, in a normal
folder, surviving reinstalls.

### User packs directory

Shipped packs stay read-only inside the bundle. The app also reads
`<userData>/packs/*.json` — same schema — and loads them after. **A user
pack with the same `id` replaces the shipped one wholesale.**

This matters because editing `packs/sarcastic.json` inside a packaged `.app`
does not survive a reinstall and is not reachable from the UI. The user packs
directory is what makes that habit portable.

### Copy-on-write

Editing a shipped pack in settings copies it to the user directory first,
then edits the copy. The pack row shows *Customised* with a **Revert to
shipped** that deletes the user file. No merge semantics and no diffing: a
pack is either yours or the app's.

### Editor format

A plain textarea, one line per row, with an optional stage tag in brackets:

```
Your kidneys filed a complaint.
[2] DRINK. THE. WATER.
[0,1] {{glasses}} {{glassWord}} today. Bold strategy.
```

An untagged line is eligible at every stage, matching `PackLine.stage` being
absent. `parsePackText` and `formatPackText` round-trip this in core, under
test. JSON remains the storage format; the textarea is a view of it.

A malformed tag (`[x]`, `[99`, `[]`) is reported as a validation error
against its line number rather than being silently treated as body text — a
line that quietly loses its stage tag reappears at the wrong volume.

### Failures stop being silent

`loadPacks` currently swallows a parse error and the app falls back to
`"Time to drink water."` with no error surfaced anywhere; the personality
simply appears to vanish. Load errors are collected and shown as a row in the
Packs pane:

```
sarcastic.json — line 12: unexpected token
```

Writes are validated before saving, reusing the rules `npm test` already
enforces: no blank lines, no duplicates, no hardcoded plural noun following
`{{glasses}}`, and the 60-line minimum for the flagship pack. Validation
failure blocks the write; the file on disk is never left malformed.

### New packs

The three packs the original spec names but which were never written:
**Drill Sergeant**, **Wholesome**, **Deadpan**, roughly 20 lines each, each
covering every stage of a three-stage ladder.

## 6. Settings panes

One window, a sidebar, five panes.

| Pane | Contents |
|---|---|
| **Schedule** | Interval · work window including overnight and Always on · work days · default snooze |
| **Escalation** | Four preset cards · per-stage delay minutes · per-stage sound · corner position |
| **Hydration** | Daily goal · glass size |
| **Packs** | Active toggles · line editor · revert to shipped · reveal folder · load errors |
| **General** | Autostart · reset to defaults |

### The ladder gets presets, not a stage editor

Four preset cards (Gentle, Nudge, Standard, Relentless) plus editable delay
minutes for each stage of the chosen preset. Touching a delay flips `preset`
to `custom`. Adding, removing and reordering stages stays hand-editable in
`config.json`.

This covers the knob that actually gets turned — how fast it escalates — at a
fraction of what a full stage editor costs, and a full editor is the single
most expensive control in the window.

### New macOS unknown

A settings window in an `LSUIElement` app with the dock hidden frequently
will not come to front on `show()`. It needs `app.focus({ steal: true })`, or
a temporary dock unhide around the show. **This cannot be verified from
Windows** and goes on the Phase 2 manual checklist in
`docs/manual-verification.md`.

## 7. Deferred findings riding along

From `docs/status-and-backlog.md`, the items worth doing while the relevant
code is open:

- **Persist `nextDueAt`** — a config shape change, so it belongs with the
  migration hook. Covered in §3.
- **Tray tooltip shows progress.** Original spec §12 asks for `1.2 / 4.0 L`.
  Hydration progress currently appears nowhere in the tray, so `Drink now`
  gives no feedback at all.
- **The correctness trio.** `mlOnDay` type-checks `ml` before summing;
  `currentStreak` returns 0 for `goalMl <= 0`, closing a potential hang in a
  background process; and the DST test for `addLocalDays` that the original
  spec §14 committed to and which needs `TZ` manipulation before Node caches
  the zone.

Explicitly **not** riding along: extracting the payload builder in
`applyEffects` and the mode→focus/level policy in `windows.ts` into
`src/core`. `countdownLabel` moved in v0.1.4 because a bug forced it; the
remainder is a refactor, and landing a refactor beside a config migration
invites regressions that are hard to attribute.

## 8. Testing

Core is tested as usual; the settings renderer is not, consistent with the
existing posture. That posture holds only because the decisions live in core
rather than in the pane — if a pane starts wanting a test, that is the signal
something belongs in `src/core`.

- Migration v1 → v2, including the `customLines` effect and a failed write
- `onConfigChange` interval rescale, including the already-past case, and
  ladder changes mid-reminder
- Persisted `nextDueAt`: adoption, the single-reminder collapse, and a
  missing or non-finite value
- Overnight work hours, the day-membership rule, and `nextWorkWindowStart`
  under a wrapping window
- Always on at both ends of the day
- `packtext` round-trips, including malformed tags and template variables
- Pack override by id, copy-on-write resolution, and revert
- Pack write validation rejecting each rule it enforces

Development follows TDD, as in Phase 1.

## 9. Out of scope

- Themes, mascot states, sound playback, and the stats view — all Phase 3b.
- Adding, removing or reordering ladder stages from the UI.
- Dimming other displays during the fullscreen stage.
- Any change to window levels or focus behaviour. Phase 2 verified on
  2026-08-27 that the fullscreen stage floats above a genuine fullscreen app
  at every stage of the ladder; that combination is load-bearing and 3a does
  not touch it.

## 10. Open questions

None blocking planning.
