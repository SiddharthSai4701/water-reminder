# Water Reminder — Design Spec

Date: 2026-08-24
Status: Approved for planning

## 1. Problem

Existing water reminders (Chrome extensions, menu-bar timers) fire a single
notification and stop. A notification that disappears on its own is trivially
ignored, so the reminder fails exactly when the user is absorbed in work — the
moment it is most needed.

The app must produce a reminder that **cannot resolve itself**. It stays on
screen until the user explicitly acts on it, and it becomes harder to ignore
the longer it is left alone. It must do this without disrupting the user's
work: no killing or backgrounding other processes, no interference with
running applications, no input capture beyond its own window.

## 2. Goals

- A reminder that persists until explicitly acted on.
- Configurable escalation, so the user chooses how aggressive the app gets.
- Snooze, because the user may be mid-call and unable to act immediately.
- Personality: witty/sarcastic one-liners, swappable and user-extensible.
- Personalization: schedule, tone, appearance, and hydration goals.
- Runs on macOS (primary daily-use machine) and Windows (development machine).

## 3. Non-Goals

- Mobile apps, cloud sync, accounts, multi-user support.
- Health/medical claims or advice.
- Wearable, smart-bottle, or fitness-tracker integration.
- Public distribution. This is a personal tool; packaging targets the author's
  own machines. Notarization and store distribution are out of scope.

## 4. Constraints

- **Development happens on Windows; primary use is macOS.** Every design
  decision must survive that split. macOS-specific behavior is unverifiable
  from the development machine and must be validated in a dedicated pass on
  the MacBook (see Phase 2).
- macOS builds must be produced on the Mac. Cross-building a `.app` from
  Windows is not viable.
- The app runs continuously in the background. Idle resource use is a real
  cost, accepted as the price of Electron's window control and UI speed.

## 5. Stack

**Electron + React + TypeScript.**

Chosen over Tauri and Python/PySide6 because:

- Mature cross-platform window control on both target OSes: frameless,
  transparent, `alwaysOnTop` with an explicit level (`screen-saver` floats
  above macOS fullscreen apps), per-display placement, and opt-out of focus
  stealing (`showInactive`). The escalation ladder is implemented by
  resizing, repositioning, and re-leveling a single window.
- Tray/menu-bar and login-item APIs are built in and work on both OSes.
- Animation, theming, and mascot work are ordinary CSS/SVG — the "fun"
  requirement is cheap here and expensive elsewhere.
- `electron-builder` produces `.app` and `.exe` from one config.

Accepted cost: roughly 150–250 MB resident and a ~100 MB install.

**Tauri is the documented upgrade path** if idle memory ever becomes a
problem: the React UI layer ports essentially unchanged, and only the main
process is rewritten. This is not planned work.

## 6. Architecture

```
main process (Node)
├─ scheduler        pure TS state machine, zero Electron imports
├─ message picker   pure TS, pack loading + selection
├─ stats            pure TS, derives today/streak/history from the log
├─ config store     JSON via electron-store, schema-validated, versioned
├─ intake log       append-only JSONL
├─ tray             menu-bar / system-tray icon and menu
└─ window manager   creates, moves, sizes, and levels the popup window

renderer
├─ popup window     frameless, transparent, no taskbar/dock entry
└─ settings window  standard window, created on demand
```

Security posture: `contextIsolation: true`, `nodeIntegration: false`, and a
thin preload exposing a typed IPC surface. Renderers never touch Node APIs.

**Logic lives outside Electron wherever possible.** The scheduler, message
picker, and stats modules are pure TypeScript with no Electron dependency, so
they run and are tested in plain Node. The Electron layer is a thin shell that
owns windows, tray, and persistence. This is what keeps the project testable
from Windows despite targeting macOS.

## 7. Scheduler

### Timing

Timestamp-based, not interval-accumulation. The scheduler stores an absolute
`nextDueAt` (epoch ms) and ticks once per second to compare against the clock.
This is drift-free and survives clock changes and timezone shifts.

### States

```
IDLE ──(now >= nextDueAt)──> DUE(stage 0)
DUE(n) ──(+stage delay)──> DUE(n+1)          while further stages remain
DUE(n) ──(past last stage)──> DUE(last)      final stage persists indefinitely
DUE(*) ──drank──> IDLE        log intake, nextDueAt = now + interval
DUE(*) ──snooze(n)──> SNOOZED ──(+n)──> DUE(stage 0)
DUE(*) ──skip──> IDLE         log skip,   nextDueAt = now + interval
any ──DND on──> PAUSED ──DND off or expiry──> IDLE
IDLE ──outside work hours──> holds, does not fire
```

### Actions

Three, deliberately:

- **Drank** — credits the configured glass size toward the daily goal, resets
  the interval.
- **Snooze** — re-arms at stage 0 after the chosen delay. Default 10 minutes;
  5/15/30/custom available. This is the mid-call escape hatch.
- **Skip** — dismisses without credit, resets the interval. Logged as a skip;
  "you skipped 6 today" is useful signal in stats.

### Sleep, wake, and missed reminders

`powerMonitor`'s `resume` event recomputes state. If the machine slept past
four due times, the user receives **one** reminder on wake, never a burst.
The same collapse applies to any gap where the process was suspended.

## 8. Annoyance Level (Escalation)

The escalation ladder is fully user-configurable. Different people tolerate
very different levels of nagging, and an app that is more aggressive than its
user wants gets uninstalled.

### Model

The ladder is an **ordered list of stages**, persisted in config:

```ts
type WindowMode = 'corner' | 'center' | 'fullscreen';

interface Stage {
  mode: WindowMode;
  delayMinutes: number;  // minutes after the previous stage; first stage is 0
  sound?: boolean;       // play the configured sound on entering this stage
}

type Ladder = Stage[];   // 1..N stages, must contain at least one
```

Rules:

- The first stage always has `delayMinutes: 0` — it is what fires when the
  reminder comes due.
- Each subsequent stage fires `delayMinutes` after the previous one, provided
  the reminder is still unanswered.
- **The final stage persists indefinitely.** Escalation stops climbing, but
  the reminder never resolves itself. This is the core promise of the app and
  holds at every annoyance level, including the gentlest.
- Any mode may appear at any position. A user may configure a single corner
  stage, or corner→center with no fullscreen, or a longer ladder.
- **A ladder may have more stages than any installed pack tags lines for.**
  Nothing constrains the two to match, and nothing should: the ladder is the
  user's and the packs are data. §9 says what the picker does about it.

### Presets

Settings offers presets that write the ladder, plus Custom for direct editing:

`delayMinutes` is **relative to the previous stage**. The table below gives
both, to avoid ambiguity: `delayMinutes` values in the ladder column, and the
absolute time since the reminder came due in parentheses.

| Preset | Ladder | Absolute times |
|---|---|---|
| **Gentle** | corner(0) | 0m — a single small card that simply stays put |
| **Nudge** | corner(0) → center(5) | 0m, 5m |
| **Standard** (default) | corner(0) → center(3) → fullscreen(5) | 0m, 3m, 8m |
| **Relentless** | corner(0) → center(2) → fullscreen(3), sound on the last | 0m, 2m, 5m |
| **Custom** | user-defined stages, modes, and delays | — |

Standard is the default: it matches the author's stated tolerance while
remaining the behavior most new users would expect.

### Window modes

| Mode | Size | Focus | Level |
|---|---|---|---|
| `corner` | ~320×140, screen corner (corner configurable) | **never steals focus** (`showInactive`) | above normal windows |
| `center` | ~520×320, centered on active display | takes focus | above normal windows |
| `fullscreen` | fills the display **bounds** under the cursor, not its work area | takes focus | `screen-saver` level, floats above fullscreen apps |

The fullscreen stage takes the display's **bounds**, not its work area. The
work area excludes the menu bar and the dock, which would leave both clickable
during the takeover stage — the one stage whose entire purpose is that there is
nothing else to click. This was written as "fills the display" and produced
exactly that bug.

Dimming the *other* displays during the fullscreen stage is deferred to Phase
3. Phase 1 covers one display, chosen by cursor position at show time.

No mode captures global input, hides other applications, or alters any other
process. The user's work keeps running untouched behind the popup; only the
app's own window is on screen.

## 9. Message Packs

Packs are data, not code — `packs/*.json`:

```json
{
  "id": "sarcastic",
  "name": "Sarcastic",
  "lines": [
    { "text": "Your kidneys filed a complaint.", "stage": [0, 1] },
    { "text": "Cactus called. Wants its lifestyle back.", "stage": [0, 1] },
    { "text": "DRINK. THE. WATER.", "stage": [2] }
  ]
}
```

- `stage` tags which escalation positions a line suits (0 = first stage,
  ascending). Untagged lines are eligible at every stage. Lines tagged for
  later stages are blunter and louder.
- Stage tags are indices into the user's ladder, not fixed window modes, so
  tone still escalates correctly on a two-stage or five-stage ladder.
- **Folding is bidirectional.** A line tagged for a stage beyond the ladder's
  length folds *down* onto the last stage. And a stage that no active pack
  tags any line for falls *back* to the closest tagged stage below it, rather
  than emptying the pool. Specifying only the first direction produced a real
  bug: on a ladder longer than the packs, the loudest stage — the one that
  matters most — dropped to the generic "Time to drink water." fallback.
- Shipped packs: **Sarcastic** (flagship, default-on, **60+ lines minimum**),
  Drill Sergeant, Wholesome, Deadpan (~20 lines each).
- Multiple packs may be active at once; lines pool across them.
- **Custom pack**: user-authored lines, edited in settings. Stored as a pack
  file in the user packs directory, not in config — see §11. Identical schema
  to a shipped pack.
- Selection avoids the last 8 lines used, so repeats do not become wallpaper.
- Template variables (`{{glasses}}`, `{{streak}}`, `{{goalPct}}`) are resolved
  at render time, enabling context-aware lines.

Tone reference for the sarcastic pack:

- "Your kidneys filed a complaint."
- "Cactus called. Wants its lifestyle back."
- "{{glasses}} {{glassWord}} today. Bold strategy."
- "Coffee is not water. It is water with a debt attached."
- "Blink twice if you are hydrated. You did not blink."
- "Still here. Still thirsty. Still your problem."
- "Day {{streak}} of the streak. Do not be the reason it ends."
- "You have had this window open for a while. So has your water."
- "The plant on your desk is doing better than you."
- "DRINK. THE. WATER."

## 10. Popup UI

**Corner card**: mascot, one line, `Drank` / `Snooze ▾` / `×`, and a progress
ring for the day. Snooze is a split button — clicking it uses the default
delay, the arrow opens 5/15/30/custom.

**Center and fullscreen**: identical content, scaled up, mascot animated, with
a subtle background pulse. The fullscreen stage adds no new information; its
only job is to be unignorable.

**Mascot**: one SVG character with four states driven by the day's percentage
of goal — `thriving / fine / thirsty / withered`. CSS animation only, no
raster assets. Themed via CSS custom properties; four themes ship.

**Keyboard**: `Enter` = drank, `S` = snooze, `Esc` = skip. The popup binds
keys only while focused and registers no global shortcuts.

**Sound**: off by default, configurable per stage.

## 11. Storage

Location: `~/Library/Application Support/water-reminder/` on macOS,
`%APPDATA%\water-reminder\` on Windows.

`config.json` — via electron-store, schema-validated and versioned for
migrations. **Currently version 2:**

- interval minutes and the work-hours window, which may wrap past midnight
  (an overnight window) or cover the whole day (00:00-24:00, the default)
- escalation ladder (see §8) and preset name
- daily goal in ml, glass size in ml
- active pack ids
- theme, mascot on/off, sound settings
- autostart on/off, DND state and expiry
- `nextDueAt`, the epoch ms of the next reminder, so a relaunch resumes the
  schedule instead of re-arming a full interval from launch time

Version 2 dropped `customLines`. User-authored lines were held in config in
v1; they now live beside every other pack as `<userData>/packs/custom.json`,
so one editor and one schema cover all packs. The migration runs on load and
persists the new version **only after** the pack file is written — a failed
write leaves the file at v1 so the next launch retries, rather than stamping
v2 over lines that were never saved.

`<userData>/packs/*.json` — the user's own packs. A user file replaces a
shipped pack of the same id wholesale; there are no merge semantics, so a
pack is either yours or the app's. Editing a shipped pack in settings copies
it here first, and *Revert to shipped* deletes the copy.

`intake.jsonl` — append-only, one JSON object per line:

```json
{ "ts": 1755993600000, "type": "drank", "ml": 250 }
{ "ts": 1755995400000, "type": "skip" }
{ "ts": 1755996000000, "type": "snooze", "minutes": 10 }
```

Stats are derived on read: today's total, streak, 7-day and 30-day history. At
roughly ten events per day this file stays trivially small for years, so no
rotation or database is warranted.

**Streak** = consecutive days meeting the daily goal, evaluated on local
calendar days.

## 12. Tray and Autostart

Tray menu: countdown to next reminder · `Drink now` (logs without a popup) ·
`Pause 30m / 1h / until tomorrow` · `Settings` · `Quit`. Tooltip shows
progress, e.g. `1.2 / 4.0 L`.

No dock or taskbar presence: `app.dock.hide()` plus `LSUIElement: true` in
Info.plist on macOS, `skipTaskbar` on Windows.

Autostart via `app.setLoginItemSettings({ openAtLogin: true })`, toggleable in
settings, launching with `--hidden` so nothing appears at boot.

## 13. Packaging

`electron-builder`. macOS → `.app` inside a `.dmg`, `arm64`, ad-hoc signed;
first launch requires right-click → Open. Windows → NSIS `.exe`. macOS
artifacts are built on the Mac.

## 14. Testing

**Unit tests (Vitest) against the pure modules** — these run on Windows and
cover the logic that matters:

- Scheduler state machine with fake timers: escalation across arbitrary
  ladders, final-stage persistence, snooze, skip, DND, work-hour boundaries,
  and sleep/wake catch-up collapsing to a single reminder.
- Ladder validation: at least one stage, first stage at delay 0, presets
  producing the expected ladders.
- Message picker: no-repeat-within-8, stage filtering, fallback when a line's
  stage tag exceeds the ladder length, template variable substitution.
- Stats: streak boundaries, midnight rollover, timezone changes.

**Manual per-OS checklist** for what unit tests cannot reach: does the
fullscreen stage actually float above a fullscreen app, does the corner card
truly not steal focus while typing, does the login item fire, does the tray
icon render correctly in both light and dark menu bars.

Development follows TDD: tests precede implementation.

## 15. Phases

| Phase | Scope |
|---|---|
| **1** | Core loop: tray, scheduler, all three window modes, configurable ladder with presets, drink/snooze/skip, config store, intake log, sarcastic pack, autostart. Verified on Windows. |
| **2** | macOS verification pass: window levels above Spaces and fullscreen apps, `LSUIElement`, login item, `.app` build. First real daily use. |
| **3a** | Settings window, config v2 and its migration, editable schedule (including overnight and always-on), escalation presets and custom ladders, the pack editor and the remaining three packs. |
| **3b** | Themes, mascot states, sound, and the stats view. Deferred until 3a has been in daily use, so the polish is aimed at real complaints. |
| **4** | Smart pause: microphone-in-use and meeting-app detection, fullscreen-app detection, idle detection. Suppresses escalation rather than the reminder itself. |

Phases 1 and 2 produce a usable app. Phase 3 makes it personal, and was split
once its scope was clear: 3a is everything the app needs before it can be
configured without a text editor, and 3b is what is worth choosing only after
living with 3a. Phase 4 is the deferred polish.

## 16. Open Questions

None blocking Phase 1.
