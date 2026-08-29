# Status and Backlog

Last updated: 2026-08-29, at the end of Phase 3a's implementation.

This file exists because the Phase 1 review findings and the decisions taken
during it lived in a scratch workspace that was deleted at merge. Everything
below is the part that was not otherwise written down. Read it alongside:

- `docs/superpowers/specs/2026-08-24-water-reminder-design.md` — the design
- `docs/superpowers/specs/2026-08-27-water-reminder-phase-3a-design.md` — Phase 3a
- `docs/superpowers/plans/2026-08-24-water-reminder-phase-1.md` — how Phase 1 was built
- `docs/manual-verification.md` — the per-OS checklist
- `docs/building-on-mac.md` — building the `.dmg`

## Where the phases stand

| Phase | State |
|---|---|
| 1 — core loop, tray, escalation | **Done.** Merged to `master`, 104 tests. |
| 2 — macOS verification | **Nearly done.** See below; the core promise passed. |
| 3a — settings, config, packs | **Built and reviewed** (per-task, then whole-branch), on `feat/phase-3a`, 244 tests. Needs the macOS pass on a fresh `.dmg`. |
| 3b — themes, mascot, sound, stats | Not started. Specced after 3a is in use. |
| 4 — smart pause | Not started. Mic/meeting/fullscreen/idle detection. |

## Phase 2: what has and has not been verified on the Mac

The app is installed and running on the MacBook from the CI-built `.dmg`.

Verified working:

- [x] **Fullscreen stage floats above a genuine fullscreen app, at every
      stage of the ladder** (2026-08-27, on v0.1.4). This was the
      highest-risk item in the project — the loudest rung of the ladder and
      the app's core promise — and it works. The `screen-saver` window level
      plus `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`
      is the combination that does it, so treat both as load-bearing.
      It is also the behaviour a Tauri port could not safely reproduce; see
      the Tauri section below, which stands.
- [x] Menu-bar icon renders, and is crisp after shipping `@2x`/`@3x` variants
- [x] No Dock icon
- [x] Corner card renders correctly and is legible
- [x] Escalation reaches the centered window and the fullscreen stage
- [x] Fullscreen stage renders correctly over a dark app
- [x] **App absent from the Cmd-Tab switcher** (2026-08-28, v0.1.5). Tried
      directly: the reminder cannot be escaped that way.
- [x] **The settings window opens from the tray and comes to the front**
      (2026-08-28, v0.1.5), including while a fullscreen app is frontmost.
      `app.focus({ steal: true })` under `LSUIElement` with the dock hidden
      was the one new macOS unknown Phase 3a introduced; it works. Treat the
      focus call in `settings-window.ts` as load-bearing.
- [x] **An active reminder still wins over the settings window**
      (2026-08-28, v0.1.5). The stage-1 popup draws over settings. A second
      window now exists in the process and the core promise survived it.

Still unverified, and **not checkable from Windows** — these are the reason
Phase 2 exists:

- [ ] Corner card appears on the Space you are currently on, not only the
      one it was created on
- [ ] Corner card does not steal focus while typing (verified on Windows,
      not on macOS)
- [ ] Login item survives a reboot and appears under System Settings →
      General → Login Items
- [ ] Menu-bar icon legible in a **light** menu bar as well as dark
- [ ] Everything in Phase 3a: see the macOS section of
      `docs/manual-verification.md`, which the settings window and the pack
      editor added to.

### Known cosmetic issue, deferred deliberately

The reminder popup **appears as a window in Mission Control**, titled "Water
Reminder" (found 2026-08-28, v0.1.5). Cosmetic only, and not an escape route:
Mission Control offers no way to dismiss it, and because the popup carries
`setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })` it follows
you to whichever Space you switch to. The promise holds.

Electron 33 exposes the fix — `BrowserWindow.setHiddenInMissionControl()`,
darwin-only, added in Electron 25. It was **not** done during Phase 3a: the
call belongs in `src/main/windows.ts`, the one file whose exact current
combination was verified on 2026-08-27 as floating above a genuine fullscreen
app at every stage. The new call is additive rather than a relaxation of any
of the three protected properties, but its interaction with
`visibleOnAllWorkspaces` is undocumented, it cannot be verified from Windows,
and a regression there costs the core promise to gain a cosmetic nicety. Give
it its own task and its own `.dmg` after 3a merges.

## Deferred findings from the Phase 1 final review

None of these block use. They were consciously deferred with the reviewer's
triage, and are listed here so they are not rediscovered from scratch.

### Worth doing in Phase 3, while the relevant code is open

- **`aria-live` on the popup message.** A screen reader never announces an
  escalation. The buttons have `aria-label`s as of v0.1.3; the message does
  not announce.
- **Snooze split-button behaviour.** The spec described clicking the button
  using the default delay and only the arrow opening the choices. As built,
  the whole button opens the choices. The v0.1.3 in-row swap changed the
  shape of this; revisit when the settings UI lands.

### Fixed after Phase 1

- **The tray reported `Due now` during a work-hours hold** (v0.1.4). Outside
  work hours the scheduler holds in `idle` with an overdue `nextDueAt` —
  correct, and covered by a test — but `countdownLabel` only compared
  `nextDueAt` against the clock, so every evening after 18:00 and all
  weekend the menu claimed a reminder was due while nothing was on screen.
  Indistinguishable from the app having lost a popup, and reported as such.
  `countdownLabel` now lives in `src/core/labels.ts`, asks the same
  work-hours question the scheduler asks, and names the hold. That also
  starts the `src/core` extraction listed under *Architecture* below.

  The underlying complaint is real and remains: the schedule is only
  editable by hand, and **an always-on schedule cannot be expressed at all**
  — `normalizeSchedule` requires `workEndMinute > workStartMinute` and
  rejects overnight windows. Phase 3a fixes both.

### Correctness, low reachability

Nothing left here: every item that was in this section was closed in Phase
3a. See *Fixed in Phase 3a*.

### Fixed in Phase 3a

All on `feat/phase-3a`, 2026-08-27 to 2026-08-29. Test count 118 on `master`
-> 244 on the branch. (Phase 1 merged with 104; v0.1.4's fixes took it to 118.)

- **The schedule is editable, and can be overnight or always-on.**
  `normalizeSchedule` used to require `workEndMinute > workStartMinute` and
  silently fall back to the default window otherwise, so a 22:00-02:00
  schedule was discarded without a word. It now rejects only an *empty*
  window where start equals end — that one would make the app never fire
  again. The other half of the "Due now" complaint from v0.1.4.
- **Config version migration hook.** `src/core/migrate.ts` reads the incoming
  `version` and branches. Config is at v2; `customLines` moved out to
  `<userData>/packs/custom.json`, and the version is stamped only after that
  file is written, so a failed write retries next launch instead of claiming
  a migration that did not happen. The migration also **activates** the pack
  it writes: v1 appended custom lines unconditionally, so a v2 config that
  did not list `custom` retired the user's own writing at the moment of
  upgrade. That one survived three reviews and was caught only by comparing
  the branch against master.
- **`nextDueAt` is persisted across restarts.** A stored future value is
  adopted as-is; a stored past value produces exactly one reminder on the
  first tick rather than a burst, matching what wake-from-sleep already did.
  Reminders no longer walk later every time the app is relaunched.
- **Tray tooltip shows hydration progress,** `1.2 / 4.0 L`, before the
  countdown. `Drink now` had no feedback at all before this.
- **`mlOnDay` type-checks `ml`,** so a hand-edited `"ml": "250"` cannot
  concatenate into the daily total.
- **`currentStreak` returns 0 for a non-positive goal** instead of walking
  backwards until dates stop being representable. This one really did hang:
  the test that proves it killed the vitest worker before the fix landed.
- **The DST test for `addLocalDays` exists** (`tests/core/dst.test.ts`), the
  outstanding commitment from spec §14. `process.env.TZ` assigned in
  `beforeAll` does take effect under Node 22 and vitest 2.1 on Windows — the
  documented worry about Node caching the zone turned out not to bite. The
  file opens by asserting the day lengths either side of both transitions,
  because without that guard every assertion in it passes trivially in a
  fixed-offset zone like the dev machine's.
- **`dndUntil` is cleared when a pause expires naturally,** which closes the
  "two sources of truth for paused" item: nothing used to clear it, so the
  tray's Resume item and the countdown label agreed only by accident. An
  open settings window is told as well.
- **A pack that fails to load is a visible row** in the Packs pane with the
  parser's own message, instead of a personality that silently disappears
  behind `"Time to drink water."`. "Fails to load" now includes JSON that
  parses but is not a pack: that used to throw out of the one-second tick,
  which is an uncaught exception in a process with no window.
- **Revert only appears where there is something to revert to.** It deletes
  the user file and lets the shipped one show through, so on a pack with no
  shipped copy — `custom.json`, written by the v1 migration out of the user's
  own lines — it was a permanent delete wearing the wrong word.
- **Pack ids from the renderer are validated before they reach the
  filesystem.** Three IPC channels build a path from an id and one of them
  deletes with `{ force: true }`; an id of `../config` on the revert channel
  would have taken out the user's config file, silently.

### Still open, and now more likely to matter

- **`aria-live` on the popup message** — unchanged by 3a. The settings panes
  were built with labels and `aria-pressed`, so the popup is now the least
  accessible surface in the app.
- **Snooze split-button behaviour** — the settings UI has landed, so the
  "revisit when the settings UI lands" condition on this one has been met.

### Cosmetic and structural

- **Stale-payload flash.** The payload is sent over IPC (async) but
  `window.show()` runs synchronously right after, so the previous reminder's
  line and glass count render for a frame before React swaps them. Happens
  on every reminder after the first. Fix by clearing the payload on hide, or
  only showing after a renderer ack.
- **`hide()` does not clear `this.pending`,** so a show→hide before load
  still delivers a stale payload.
- **`onShow` has no cleanup** and the popup preload bridge exposes no
  `removeListener`, so listeners accumulate per mount. Inert in production
  (one mount for the window's life) but double-registers under StrictMode in
  dev. The settings preload added in 3a does return a remover from
  `onChanged`, deliberately — same fix, and the popup still needs it.
- **`readEvents()` reads the whole JSONL synchronously on every show
  effect,** and now on every tray refresh as well, since the tooltip shows
  progress. Fine at ~10 events/day; revisit only if a log rotation story
  appears.

### Architecture, deferred deliberately

- **Nothing in `src/main`, `src/preload`, or `src/renderer` is tested.** All
  208 tests are `tests/core/**` and `tests/packs`. Phase 3a held that line
  on purpose: whenever a pane wanted a test, the logic moved into
  `src/core/` instead — `ladder.ts`, `packtext.ts`, `packvalidate.ts`. The final review
  recommended extracting the last decisions out of the shell —
  `countdownLabel`, the payload builder in `applyEffects`, and the
  mode→focus/level policy in `windows.ts` — into `src/core/` where they can
  be unit-tested. `countdownLabel` moved in v0.1.4 because a bug forced it;
  the payload builder and the window policy have not. That would finish the architectural split rather than
  leaving it 90% done. Deferred because it is a refactor, not a fix, and
  landing it beside a Critical fix invites regressions.

## Spec gaps found during the review

The implementation did not drift from the plan; these are places the **spec**
was underspecified, and they produced real bugs:

- **§9 specifies stage folding in one direction only** — a tag above the
  ladder length folds down. Nothing said what happens when the ladder has
  more stages than any pack tags for. That produced an empty pool and the
  generic fallback at the loudest stage, fixed by folding bidirectionally.
- **§8 permits ladders longer than any shipped pack tags for**, which is the
  same gap from the other side.
- **§8's fullscreen row said "fills the display"** while the code passed the
  work area, leaving the menu bar clickable during the takeover stage.

**All three were fixed in the spec on 2026-08-29**, during Phase 3a's Task 16.
§8 now says the fullscreen stage takes the display *bounds* and that a ladder
may outrun its packs; §9 now says folding is bidirectional. §11 describes
config v2 and the user packs directory, and §15 records the 3a/3b split.

## Tauri: investigated and rejected for now

The spec names Tauri as the upgrade path if idle resource use becomes a
problem. It was investigated on 2026-08-25 after the install size (~246 MB,
~205 MB after trimming Chromium locales) came up. **Do not port yet.**

What the size actually is: ~181 MB Electron binary, ~41 MB Chromium locales
(now trimmed to `en-US`), ~20 MB graphics libraries, and **2.6 MB of this
app**. Roughly 99% runtime.

Why the port is riskier than it looks:

- The safe Tauri API covers `focused(false)`, `focusable()`,
  `always_on_top()`, and `visible_on_all_workspaces()` — so the corner
  card's focus behaviour ports cleanly.
- It does **not** cover the macOS window level needed to float above a
  fullscreen app. `ns_window()` exposes the raw `NSWindow` pointer, so it is
  reachable via unsafe Objective-C message sends, but:
  - [tauri#5566](https://github.com/tauri-apps/tauri/issues/5566) —
    `setLevel_` and `setCollectionBehavior_` work in dev builds and stop
    working in release builds. The worst failure shape available.
  - [tauri#11488](https://github.com/tauri-apps/tauri/issues/11488) —
    `visibleOnAllWorkspaces` windows not staying above fullscreen apps.
  - The approach that works routes through
    [`tauri-nspanel`](https://github.com/tauri-apps/tauri/discussions/4452),
    a community plugin converting the window to a non-activating `NSPanel`
    at `PanelLevel::Status`.

So a port would put the app's single most important behaviour on a
third-party plugin with known release-mode bugs, to save disk. Revisit only
if idle RAM becomes a real annoyance in daily use — and by then the macOS
behaviours will have been verified on Electron, so the Tauri version has a
known target to match.

## Defaults, as shipped

Changed from the original spec during Mac testing, at the user's request:

- Interval: **30 minutes** (was 45)
- Daily goal: **4 L** (was 2.5 L)
- Glass: 250 ml
- Work hours: **24/7** — 00:00–24:00, all seven days. Changed in v0.1.4: the
  09:00–18:00 Mon–Fri default meant reminders stopped every evening, which
  is what the "Due now" report turned out to be. The schedule stays in the
  config and becomes editable in Phase 3a; the default simply no longer
  holds anything.
- Ladder: Standard — corner @ 0, centered @ +3m, fullscreen @ +5m
  (absolute 0m / 3m / 8m)

## Release process

CI builds the macOS `.dmg` on a GitHub-hosted Mac.
`.github/workflows/build-mac.yml` runs on any `v*` tag push, and manually
via the Actions tab.

```bash
# bump "version" in package.json first, then:
git tag -a v0.1.4 -m "what changed"
git push origin v0.1.4
```

The release appears at
`https://github.com/SiddharthSai4701/water-reminder/releases`.

The repo is **private**. It can be made public at any time via Settings →
General → Change visibility; CI works either way. No credentials or personal
data exist in the git history.

Windows builds cannot be produced on the current dev machine:
electron-builder's toolchain needs symlink creation privileges. Enable
Developer Mode in Windows Settings, or run the build from an elevated
terminal.

## Editing packs

There are two places a pack can live:

- `packs/*.json` in the repo — what the app ships. Four packs as of 3a:
  sarcastic, drill-sergeant, wholesome, deadpan. Read-only at runtime; inside
  the `.app` bundle in a packaged build.
- `<userData>/packs/*.json` — the user's own, editable from Settings → Packs
  and reachable with the **Reveal packs folder** button there. On macOS that
  is `~/Library/Application Support/water-reminder/packs/`. A user file
  **replaces** a shipped pack of the same id wholesale — no merging, a pack
  is either yours or the app's. Editing a shipped pack copies it here first;
  *Revert to shipped* deletes the copy.

`npm test` validates pack JSON in about a second — parse validity,
duplicates, blank lines, stage coverage, no window mode named in any line,
and no `{{glasses}}` followed by a hardcoded plural noun. The 60-line minimum
applies to sarcastic only; the other shipped packs need 20. The editor
deliberately enforces **no** minimum, so nobody is refused permission to trim
their own copy of a pack.

**Run it after every pack edit.** A malformed pack used to be invisible:
`loadPacks` caught the parse error and skipped the pack, so the app fell back
to `"Time to drink water."` with nothing shown anywhere. As of 3a the Packs
pane shows the parser's message against that pack, but a pack that is valid
JSON and bad copy is still only caught by the test.

Template variables: `{{glasses}}`, `{{glassWord}}` (agrees with the count),
`{{streak}}`, `{{goalPct}}`.
