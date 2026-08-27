# Status and Backlog

Last updated: 2026-08-25, at the end of Phase 1 and partway through Phase 2.

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
| 2 — macOS verification | **In progress.** See below. |
| 3a — settings, config, packs | **Specced.** See the Phase 3a design. |
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

Still unverified, and **not checkable from Windows** — these are the reason
Phase 2 exists:

- [ ] App absent from the Cmd-Tab switcher
- [ ] Corner card appears on the Space you are currently on, not only the
      one it was created on
- [ ] Corner card does not steal focus while typing (verified on Windows,
      not on macOS)
- [ ] Login item survives a reboot and appears under System Settings →
      General → Login Items
- [ ] Menu-bar icon legible in a **light** menu bar as well as dark

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
- **Tray tooltip shows the countdown, not progress.** Spec §12 says it
  should show `1.2 / 2.5 L`. Hydration progress currently appears nowhere in
  the tray, so `Drink now` gives no feedback.
- **Config version migration hook.** `normalizeConfig` ignores the incoming
  `version` and unconditionally stamps `CONFIG_VERSION`. There is no
  migration branch, so when Phase 3 changes the config shape, older files
  will already have been rewritten claiming the new version. Read
  `r.version` and branch, even if the only branch today is identity.
  **Do this before shipping any config change.**

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

- **`mlOnDay` does not type-check `ml`.** It sums `e.ml ?? 0`; a hand-edited
  `"ml": "250"` in `intake.jsonl` would corrupt the total via string
  concatenation. Only reachable by hand-editing — a mid-write kill produces
  unparsable JSON, which `parseLog` already skips.
- **`currentStreak` has no floor on `goalMl`.** A caller passing
  `goalMl <= 0` would count every day as met and walk backwards until dates
  stop being representable — a hang in a background process. Unreachable
  today because config clamps `goalMl` to >= 250. One line closes it:
  `if (goalMl <= 0) return 0;`
- **No DST test for `addLocalDays`.** DST safety is the stated reason the
  function exists, and it is now load-bearing for "pause until tomorrow" in
  the tray. Not written because the dev machine's timezone (Asia/Kolkata)
  has no DST, so the test needs TZ manipulation before Node caches the zone.
  This is an outstanding commitment from spec §14.
- **`nextDueAt` is not persisted across restarts.** Every relaunch postpones
  the next reminder by a full interval. With autostart on and a user who
  quits and relaunches, reminders drift indefinitely later.

### Cosmetic and structural

- **Stale-payload flash.** The payload is sent over IPC (async) but
  `window.show()` runs synchronously right after, so the previous reminder's
  line and glass count render for a frame before React swaps them. Happens
  on every reminder after the first. Fix by clearing the payload on hide, or
  only showing after a renderer ack.
- **`hide()` does not clear `this.pending`,** so a show→hide before load
  still delivers a stale payload.
- **`onShow` has no cleanup** and the preload bridge exposes no
  `removeListener`, so listeners accumulate per mount. Inert in production
  (one mount for the window's life) but double-registers under StrictMode in
  dev.
- **`readEvents()` reads the whole JSONL synchronously on every show
  effect.** Fine at ~10 events/day; revisit only if a log rotation story
  appears.
- **Two sources of truth for "paused"** in `tray.ts`: `countdownLabel` reads
  `state().phase` while the Resume item's enablement reads
  `config.dndUntil`. They agree today only because nothing clears
  `dndUntil` on natural expiry. Use `state.phase === 'paused'` for both.

### Architecture, deferred deliberately

- **Nothing in `src/main`, `src/preload`, or `src/renderer` is tested.** All
  104 tests are `tests/core/**` and `tests/packs`. The final review
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

Fix the spec during Phase 3's pack work so the next plan argues from
something correct.

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

`npm test` validates pack JSON in about a second — it checks parse validity,
the 60-line minimum, duplicates, blank lines, stage coverage, and that no
line follows `{{glasses}}` with a hardcoded plural noun.

**Run it after every pack edit.** If the JSON is malformed at startup,
`loadPacks` catches the parse error and silently skips the pack, so the app
falls back to `"Time to drink water."` with no error shown anywhere — the
personality just appears to vanish.

Template variables: `{{glasses}}`, `{{glassWord}}` (agrees with the count),
`{{streak}}`, `{{goalPct}}`.
