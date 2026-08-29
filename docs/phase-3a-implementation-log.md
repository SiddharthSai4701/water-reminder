# Phase 3a — Implementation Log

Date: 2026-08-27
Branch: `feat/phase-3a`, off `master` @ `1fb9565`
Plan: `docs/superpowers/plans/2026-08-27-water-reminder-phase-3a.md`
Spec: `docs/superpowers/specs/2026-08-27-water-reminder-phase-3a-design.md`

**All 16 tasks complete.** Test count: **118 on master → 208 on the branch.**
`typecheck` and `build` clean at every commit, and the build emits both renderer entries
and both preloads.

Tasks 1–11 were built by implementer subagents and independently reviewed, one reviewer
per task; every one of those reviews found something. **Tasks 12–16 were built in the
main session with no reviewer subagent**, because the session they ran in forbade
dispatching agents. They were reviewed by trace against the same charge instead. That is
a real reduction in rigour on five tasks, and the whole-branch review has not been run at
all — it is the outstanding piece of this branch's process.

This file records what each task did and every issue found along the way. Issues have
their own entries in the second half, each linking back to the task it came from.

---

## Tasks

### Task 1 — Config v2 shape and the migration hook

**Commit:** `b3160db` · 125 tests

**Problem.** `normalizeConfig` read the incoming config, ignored its `version`, and
stamped `CONFIG_VERSION` unconditionally. There was no migration branch, so the moment
Phase 3a changed the config shape, older files would already have been rewritten
claiming the new version — with no way to tell a migrated file from an unmigrated one.
This is why the spec put it first.

**Solution.** New pure module `src/core/migrate.ts` exporting
`migrateConfig(raw: unknown): Migrated`, which reads `version`, branches, and returns
`{ raw, effects }`. It takes `unknown` and never throws, because its input is a file the
user may have hand-edited and it runs before the app has any window to report an error
in. `Config` drops `customLines` and gains `nextDueAt: number | null`; `CONFIG_VERSION`
becomes 2. Deliberately left unwired — `migrateConfig` gets its caller in Task 3 and
`nextDueAt` its reader in Task 4.

**Issues:** two Minors, both cosmetic — see [Deferred minor findings](#deferred-minor-findings).

---

### Task 2 — The user packs directory

**Commit:** `8b1a98c` · 125 tests

**Problem.** Two failures in one file. Editing `packs/sarcastic.json` inside a packaged
`.app` does not survive a reinstall and is not reachable from any UI. And `loadPacks`
swallowed JSON parse errors, so a malformed pack silently dropped the app to its generic
`"Time to drink water."` fallback — the personality simply appeared to vanish, with no
error shown anywhere.

**Solution.** `src/main/packs.ts` rewritten. The app now also reads
`<userData>/packs/*.json`, and `readPack` tries the user path **before** the shipped
path, so a user pack with the same `id` replaces the shipped one wholesale — no merge
semantics, a pack is either yours or the app's. `loadPacksWithErrors` collects parse
errors instead of discarding them, ready for the Packs pane to display. `loadPacks`
keeps its old call shape so `src/main/index.ts` needed no edit.

No tests: this is filesystem shell code that imports `electron` and cannot run under
Vitest on the Windows dev machine. Its resolution rule is exercised in Task 3.

**Issues:** none. Review returned zero findings at any severity.

---

### Task 3 — Perform the migration on load

**Commits:** `640ad35`, `df6465c` · 125 tests

**Problem.** The migration hook from Task 1 had no caller, and the custom lines it lifts
out of the config had nowhere to go.

**Solution.** `loadConfig()` now returns `{ config, pendingCustomLines }`. It runs
`migrateConfig`, writes `<userData>/packs/custom.json` via `writeUserPack`, and persists
the migrated config **only after that write succeeds**. The version stamp is what records
that the migration happened, so a failed pack write must leave the file at v1 and let the
next launch retry — losing a user's own lines to a transient disk error is not an
acceptable failure mode. Until the write succeeds the lines stay live in memory through
`pendingCustomLines`.

The guard is a return-value check, not a `try`/`catch`, because `writeUserPack` returns
`false` rather than throwing — an exception handler would never have fired.

**Issues:** one Important — [Issue 1: a transient config write reset the session to
factory defaults](#issue-1--a-transient-config-write-reset-the-session-to-factory-defaults).

---

### Task 4 — Persist `nextDueAt` across restarts

**Commit:** `b6e1d8b` · 129 tests

**Problem.** Every relaunch called `createInitialState(now, cfg)` and re-armed a full
interval from `now`. With autostart on and a user who occasionally quits, reminders
walked later indefinitely. A long-standing backlog item.

**Solution.** `createInitialState` gains an optional third parameter. A stored future
value is adopted as-is; a stored past value produces exactly **one** reminder on the
first tick rather than a burst, matching the collapse rule `powerMonitor`'s `resume`
already applies; a missing or non-finite value re-arms a full interval as before. The
shell writes the value from `applyEffects` **only when it actually changes** — `applyEffects`
runs on a one-second tick, so an unguarded write would mean a disk write per second for a
value that moves once per interval.

`rearm` and the DND-expiry branch still call the two-argument form; they discard the old
schedule on purpose.

**Issues:** one Minor about TDD rigour —
[Deferred minor findings](#deferred-minor-findings).

---

### Task 5 — Overnight and always-on work windows

**Commit:** `e37e7eb` · 135 tests

**Problem.** `normalizeSchedule` required `workEndMinute > workStartMinute` and silently
fell back to the default window otherwise, so a 22:00–02:00 schedule was discarded
without a word, and an always-on schedule could not be expressed at all. The other half
of the complaint that produced the v0.1.4 "Due now" report.

**Solution.** Three coordinated edits. `isWithinWorkHours` gains the wrap
(`wraps = end <= start`, then `>= start || < end`). `nextWorkWindowStart` learns that
under a wrapping window every minute of a listed day is inside it, so the earliest
in-window minute is midnight rather than `workStartMinute`. `normalizeSchedule` now
rejects only an *empty* window where start equals end — that case would make
`isWithinWorkHours` false for every instant and the app would silently never fire again.

`workDays` continues to be evaluated against the day the reminder falls on, not the day
the window opened: an overnight window is a window on each of its listed days, not one
that drags the previous day's membership across midnight.

**Issues:** two Minors about duplication and style —
[Deferred minor findings](#deferred-minor-findings).

---

### Task 6 — Applying a config change to a running scheduler

**Commit:** `807c3f7` · 141 tests

**Problem.** Nothing existed to re-aim a running scheduler when the config changed under
it. Without it, the settings window would either ignore live changes or restart the
countdown on every edit.

**Solution.** `onConfigChange(state, oldCfg, newCfg, now): Transition`, beside `onDrank`
and `onSkip`. A changed interval rescales from the last reminder rather than from `now`
(`anchor = state.nextDueAt - oldIntervalMs`, `next = anchor + newIntervalMs`), so a visit
to settings cannot silently buy a fresh full interval — easy to do by accident and
impossible to notice. A changed ladder re-derives the current stage from elapsed time, so
switching to a louder preset mid-reminder escalates instead of restarting. Snoozes and
pauses are returned untouched: the user named those delays.

Unwired — the settings window in Task 9 is its first caller.

**Issues:** one pre-flight plan defect caught before dispatch —
[Issue 4: two of Task 6's tests would have failed against a correct
implementation](#issue-4--two-of-task-6s-tests-would-have-failed-against-a-correct-implementation).
Two Minors — [Deferred minor findings](#deferred-minor-findings).

---

### Task 7 — The pack line editor text format

**Commits:** `9d1e192`, `8ff1c46` · 158 tests

**Problem.** The settings pack editor needs a plain-text view of pack JSON that
round-trips, with a way to mark which escalation stages a line suits.

**Solution.** `src/core/packtext.ts` with `parsePackText` and `formatPackText`. One
message per row, with an optional `[0,1]` stage tag; an untagged line is eligible at every
stage, matching `PackLine.stage` being absent. JSON stays the storage format and the
textarea is a view of it, so the pair round-trips exactly. A malformed tag is an error
against its line number rather than being read as body text — a line that quietly loses
its stage tag reappears at the wrong volume.

**Issues:** two, both about malformed tags slipping through —
[Issue 5: an unclosed stage tag was silently read as body
text](#issue-5--an-unclosed-stage-tag-was-silently-read-as-body-text) and
[Issue 2: an empty token in a stage tag silently injected a phantom
stage](#issue-2--an-empty-token-in-a-stage-tag-silently-injected-a-phantom-stage).
Two Minors — [Deferred minor findings](#deferred-minor-findings).

---

### Task 8 — Pack content validation

**Commits:** `287032a`, `aa724e9` · 164 tests

**Problem.** The rules `npm test` enforced on the shipped pack — no blanks, no
duplicates, no hardcoded plural noun after `{{glasses}}` — were restated inline in
`tests/packs/sarcastic.test.ts`. The settings editor needs the same rules before writing
a file, and two copies of a rule set drift.

**Solution.** `src/core/packvalidate.ts` exporting
`validatePackLines(lines, { minLines? })`. One module now owns the rules, so a pack the
editor accepts is a pack the test suite accepts. The shipped-pack test calls it with
`{ minLines: 60 }`; the editor path deliberately passes no minimum, so a user is never
refused permission to trim their own copy of a pack.

The extracted pluralization regex is case-**insensitive** where the old inline one was
not. That is a deliberate tightening; it was checked against `packs/sarcastic.json` and
found no new offenders — all three `{{glasses}}` occurrences correctly use
`{{glassWord}}`.

**Issues:** one Important —
[Issue 3: the blank-line rule was enforced but untested](#issue-3--the-blank-line-rule-was-enforced-but-untested).

---

### Task 9 — The settings window shell

**Commits:** `f0320b6`, `db3ee38`, `e12159d` · 164 tests (unchanged — no test surface)

**Problem.** The tray's `Settings…` item has always been a stub that writes
`console.log('Settings live in config.json until Phase 3.')` to a console nobody sees.
Clicking it does nothing.

**Solution.** A second `BrowserWindow` with its own renderer entry and its own preload, so
the popup keeps its four-method surface and config-write powers never reach a window the
user is forbidden from closing. Main stays the sole source of truth: every control invokes
`settings:patch` and re-renders from what was actually stored, and a tray pause, a config
reload, or a DND expiry pushes the same `settings:changed` event so an open window cannot
go stale. The panes are placeholders; they arrive in Tasks 10–12.

Settings opened *while a reminder is showing* sits behind the popup, and at the fullscreen
stage is unreachable until the reminder is answered. That is the core promise working, not
a bug — documented rather than carved out, because every exception to "the reminder cannot
resolve itself" is a way for the reminder to resolve itself.

The review confirmed `src/main/windows.ts` and `src/preload/index.ts` are absent from the
diff entirely, so the `close` veto, the `alwaysOnTop` level and
`setVisibleOnAllWorkspaces` are byte-unchanged.

**Issues:** three —
[Issue 6: the implementer died mid-step on an API session
limit](#issue-6--the-task-9-implementer-died-mid-step-on-an-api-session-limit),
[Issue 7: DND expiry never reached an open settings
window](#issue-7--dnd-expiry-never-reached-an-open-settings-window), and
[Issue 8: a pack id reached the filesystem
unsanitized](#issue-8--a-pack-id-reached-the-filesystem-unsanitized). Plus one forced
deviation, R7 in the rulings table below.


### Task 10 — Schedule, Hydration and General panes

**Commits:** `a53a727`..`e722ffb` · 164 tests · **three fix rounds**

**Problem.** The panes were placeholders. Wiring real controls to `settings:patch` for
the first time also made every failure mode of that path reachable for the first time.

**Solution.** `defaultValue` + `onBlur` number inputs rather than controlled ones, so a
clamp cannot fight the user mid-type — then three rounds of correcting what that choice
costs. A per-field remount counter (`numberField.ts`) makes a clamped or rounded write
snap the field to what was actually stored, including when the stored value does not
change. A blur that parses to nothing patches nothing. Time inputs refuse a value that is
not a real time, because `fromTimeValue('')` is `NaN` and `clampNumber` replaces `NaN`
with the *default* — backspacing the From field of a 22:00–06:00 window would have
rewritten it to 00:00–06:00 and taken the user's whole waking day of reminders with it.

**Issues:** four rulings, R9 through R12, recorded in the run ledger. R12 is a departure
worth naming: a Minor *introduced by* fix round 2 — one revision counter shared by both
fields in a pane, so settling field A remounted field B and ate what the user was typing
into it — was fixed rather than deferred, because it was a regression from that round and
landed in exactly the behaviour the earlier rulings had just bought.

---

### Task 11 — Escalation pane

**Commits:** `e722ffb`..`1e8db0d` · 177 tests · one fix round

**Problem.** Preset cards and a custom ladder editor, over a config field that
`normalizeConfig` silently replaces when it is invalid.

**Solution.** The trap was flagged before dispatch rather than found after:
`validateLadder` rejects any non-first stage with `delayMinutes <= 0`, and an invalid
ladder is replaced wholesale by Standard. So typing `0` into stage 2's delay and blurring
would have discarded every stage the user had configured, with nothing on screen to say
why — and Task 10's blur guard does not catch it, because `0` is finite. The pane
validates the candidate ladder and refuses the write, restoring the field.

The review's one Important was that the guard belonged in core, and it was right by the
design spec's own rule — a pane wanting a test is the signal. `src/core/ladder.ts` now
owns `tryUpdateStage`, which also makes the accept-candidate and the patch-candidate the
same construction rather than two hand-written expressions that happen to match. 13 tests.

---

### Task 12 — Packs pane

**Commit:** `e244a47` · 184 tests

**Problem.** The last placeholder pane. Pack rows, active checkboxes, an editor with an
explicit Save, revert, and a reveal button.

**Solution.** The pane is thin; the work was in three things it made reachable.

**Line numbers pointed at the wrong line.** `validatePackLines` numbers issues by index
into the array it is given, and `parsePackText` drops blank and rejected rows from that
array — so a duplicate on editor row 12 with two blank rows above it reported "Line 10".
The plan's own manual check is "confirm the error names the right line number", and it
would have failed on any pack the user had spaced out. `parsePackText` now returns
`sourceLines`, and `packvalidate` exports `atSourceLines` to map issues back through it.
Parse errors were already correct, so the two error kinds now agree with each other.

**Unchecking the last active pack** would have been silently undone, since
`normalizeConfig` replaces an empty `activePackIds` with the default pack. Refused with a
note, in the same words as the schedule's last-day rule.

**Reveal packs folder was a no-op on a fresh install** — `shell.openPath` on a directory
that only exists once something has written into it returns an error string nobody reads.

Edit is disabled on a pack whose file failed to parse: `readPack` returns `''` for it, so
the editor would open empty and Save would look like the way to fix it. Reverting the pack
currently open closes the editor, because Save would otherwise write the reverted-away
text straight back.

---

### Task 13 — Tray tooltip shows hydration progress

**Commit:** `aa98b3e` · 187 tests

**Problem.** `Drink now` moved a number that appeared nowhere in the tray. The only proof
it had worked was the next reminder not firing.

**Solution.** `progressLabel` in core, `1.2 / 4.0 L`, ahead of the countdown in the
tooltip. Both halves carry a decimal place: "4 / 4.0 L" reads as two different units.

---

### Task 14 — The correctness trio

**Commit:** `cfe9750` · 193 tests

**Problem.** Three deferred Phase 1 findings, one of them a hang.

**Solution.** `mlOnDay` type-checks `ml`. `currentStreak` returns 0 for a non-positive
goal. And the DST test spec §14 committed to finally exists.

The hang is real, not theoretical: before the fix the test did not fail, it killed the
vitest worker outright. The plan predicted that and said to treat it as the RED.

Two things about the DST file are worth keeping. Ruling R5 assumed `process.env.TZ` set in
`beforeAll` would not take effect; it does, under Node 22 and vitest 2.1, on Windows, with
no pool or config change. But the plan's suggested guard assertion was wrong — it put the
23-hour day on 7 March, and US Eastern springs forward at 02:00 on the **8th**, so that
span is a full 24 hours and the guard fails against a correct implementation. The guard
now pins 23 hours across 8 March and 25 hours across 1 November. Without a guard of some
kind the whole file passes trivially in a fixed-offset zone, which is exactly what the dev
machine is.

`afterAll` also had to stop assigning `originalTZ` back unconditionally: on a machine
where `TZ` is unset that writes the literal string `"undefined"` and leaves every later
file in that worker somewhere unknown.

---

### Task 15 — The three missing packs

**Commit:** `2430b66` · 208 tests

**Problem.** Drill Sergeant, Wholesome and Deadpan are named in the original spec and were
never written.

**Solution.** 24 lines each: eight tagged `[0]`, eight `[1]`, five `[2]`, and three
untagged. The untagged ones are deliberate — an untagged line is eligible at every stage,
and with `RECENT_LIMIT` at 8 a stage-2 pool of five alone would recycle visibly.

One test beyond the plan's five: no line may name a window mode. The plan states that rule
in prose for the author and then does not check it, and it is the one pack rule a later
hand-edit breaks invisibly — a line reading "this is your fullscreen warning" is simply
wrong for anyone on Gentle.

`extraResources` already ships the whole `packs` directory, so the three files reach a
packaged build with no config change, and `listPackIds` means the pane lists them with no
code change either.

---

### Task 16 — Documentation

**Commit:** `658f5fa` · 208 tests

**Problem.** Three places the *original* spec was underspecified and produced real bugs,
plus a backlog and a checklist that predate everything above.

**Solution.** Spec §8 now says the fullscreen stage takes the display **bounds** rather
than its work area, and that a ladder may outrun the packs installed beside it. §9 says
folding is bidirectional. §11 describes config v2 and the user packs directory; §15
records the 3a/3b split.

The backlog moves everything 3a closed into its own section, records the three macOS
behaviours confirmed on v0.1.5, and records the Mission Control finding as deferred with
its reasoning. The manual checklist gains the Phase 3a macOS pass.

---

## Issues

Each entry links back to the task it came from.

### Issue 1 — A transient config write reset the session to factory defaults

**From:** [Task 3](#task-3--perform-the-migration-on-load) · **Severity:** Important ·
**Status:** fixed in `df6465c`

**Problem.** Task 3 added `store.set('config', config)` inside the broad `try` whose
`catch` returns `normalizeConfig({})`. So a transient fault on the *write* — disk full,
an antivirus lock, a permissions blip — discarded the correctly-migrated in-memory config
and handed back stock defaults for the rest of the session.

The review stopped there and called it coarse degradation. It was worse than that. Task 4
adds `saveConfig(config, { nextDueAt })` to `applyEffects`, firing whenever `nextDueAt`
moves. Once the transient fault cleared, that write would succeed and persist **factory
defaults over the user's real `config.json`** — schedule, ladder, goal, active packs,
autostart, permanently lost, silently, from an error that had already resolved.

A regression this task introduced: the old `loadConfig` never wrote inside that `try`, so
the catch only ever fired on a read failure, where defaulting is harmless precisely
because nothing gets written back.

**Solution.** Wrap only the persist in its own `try`/`catch` — log, keep the good
in-memory config — mirroring the shape `saveConfig` already used eight lines below. The
outer `try` still guards the read-and-migrate path. Spec §3 is unaffected: a failed
persist still leaves the file at its old version, so the migration still retries next
launch. The `migrated` flag was renamed `canPersist`, since it was `true` even when
nothing needed migrating.

Fixed before Task 4 landed, because Task 4 is what arms it.

---

### Issue 2 — An empty token in a stage tag silently injected a phantom stage

**From:** [Task 7](#task-7--the-pack-line-editor-text-format) · **Severity:** Important ·
**Status:** fixed in `8ff1c46`

**Problem.** A stage tag with a trailing, leading, or doubled comma parsed successfully
and silently gained a stage 0:

```
[2,]   -> stage [2,0]     guard fires? false
[,2]   -> stage [0,2]
[2,,3] -> stage [2,0,3]
```

`parts.map((p) => p.trim())` can produce `''`, and `Number('')` is `0` — a perfectly
valid non-negative integer — so the validity check never fired. The whole-tag
`tag.trim().length === 0` guard caught a tag that was *entirely* blank, never a blank
token inside a non-blank one.

Worse than the failure spec §5 is written against. The tag does not vanish, it
**mutates**: a line its author pinned to stage 2 silently also becomes eligible at stage
0, so a line written to be shouted at the fullscreen rung turns up in the gentle corner
nudge. And `[0,1,]` is an ordinary typo to leave behind while editing.

**Solution.** Add `parts.some((p) => p.length === 0)` to the guard, before the numeric
check on the same short-circuit chain. `parts` is already trimmed, so this catches both
`''` and whitespace-only tokens. Tests added for all three comma shapes, plus `[-1]` and
`[1.5]` — the guard's other two branches had no test at all. Verified not to over-reach:
`[0,1]` and the spaced `[0, 1]` still parse, because `trim` runs before the new check.

---

### Issue 3 — The blank-line rule was enforced but untested

**From:** [Task 8](#task-8--pack-content-validation) · **Severity:** Important
(plan-mandated) · **Status:** fixed in `aa724e9`

**Problem.** `validatePackLines` rejects blank lines, and deliberately `return`s before
adding one to the `seen` set so a blank line is not *also* reported as a duplicate.
Neither behaviour had any test. None of the six new tests passed a blank or
whitespace-only line, and the plan's own test list omitted the case.

Not a regression — the old inline `has no blank lines` test only exercised the acceptance
path too, since the shipped pack contains no blank lines. The rejection path had never
been tested at all.

**Solution.** Fixed rather than parked: the cost is one test case, and this is one of the
four rules the settings editor leans on from Task 9 onward. An enforced rule with no test
signal is one a later edit can break silently. Two tests added — a whitespace-only line,
and two blank lines proving the short-circuit. Both verified by mutation: deleting the
branch fails the first, deleting only the `return` fails the second with a spurious
duplicate.

---

### Issue 4 — Two of Task 6's tests would have failed against a correct implementation

**From:** [Task 6](#task-6--applying-a-config-change-to-a-running-scheduler) ·
**Severity:** plan defect · **Status:** corrected before dispatch

**Problem.** Found in the pre-flight scan, before any code was written. Two of the plan's
`onConfigChange` tests tick the scheduler at `now + 30 * MIN` to bring a reminder due —
but the shared `cfg` in `tests/core/scheduler.test.ts` has `intervalMinutes: 45`. At that
instant the scheduler is still `idle`, so both tests would have failed against a *correct*
implementation, and the implementer would have gone hunting for a bug in working code.

The plan's arithmetic assumed a 30-minute interval that the test file does not use. The
assertions themselves were right.

**Solution.** Corrected the brief before dispatching: due time to `now + 45 * MIN`, the
follow-on to `now + 54 * MIN`, stale comment fixed. Every assertion and ladder value left
untouched. Left uncorrected, the ladder-mid-reminder path — the behaviour spec §4 argues
for — would have shipped untested, or the tests would have been "fixed" into asserting
idle-branch behaviour other tests already cover.

---

### Issue 5 — An unclosed stage tag was silently read as body text

**From:** [Task 7](#task-7--the-pack-line-editor-text-format) · **Severity:** spec gap ·
**Status:** corrected before dispatch

**Problem.** Spec §5 names three malformed tags that must be *reported* rather than
silently treated as body text: `[x]`, `[99`, and `[]`. The plan's parser caught two. Its
regex requires a closing bracket, so an unclosed tag like `[99 DRINK.` never matched and
fell straight through to `lines.push({ text: trimmed })` — becoming literal body text,
and therefore eligible at *every* stage. The loudest possible misfiling of a line its
author meant to pin to one, on one of the three cases the spec names by hand.

**Solution.** Added a guard to the brief before dispatch: a line opening with `[` that
does not parse reports `stage tag is missing its closing ]`, with a test. Verified
afterwards to be correctly scoped — because `[^\]]*` cannot consume past a `]`, any line
with a `]` after its `[` always matches, so the guard provably cannot intercept a
well-formed tagged line.

Cost if the call was wrong: a pack line deliberately starting with `[` is rejected with a
message naming the reason — visible and self-correcting, unlike the silent alternative.

---

### Issue 6 — The Task 9 implementer died mid-step on an API session limit

**From:** [Task 9](#task-9--the-settings-window-shell--incomplete) ·
**Severity:** infrastructure · **Status:** open, resumable

**Problem.** The Task 9 implementer terminated during Step 6 with
`You've hit your session limit · resets 7pm (Asia/Kolkata)`. Not a code fault. Its work
was never committed.

**Solution.** The working tree is a clean resume point — nothing is corrupt, nothing was
half-written into a committed file. Five new files and two modified files are present and
uncommitted. On resume, the remaining work is `src/renderer/settings.tsx`,
`src/renderer/settings.css`, and all of Step 7 (the `src/main/index.ts` wiring: nullable
`settings`, `registerSettingsIpc`, the `openSettings` stub replacement, `before-quit`
destroy, and `broadcast` on the `setDnd` and `refreshConfig` paths), then build
verification and the commit.

The full resume state is recorded in the run ledger at
`.superpowers/sdd/2026-08-27-water-reminder-phase-3a/progress.md`.

---

### Issue 7 — DND expiry never reached an open settings window

**From:** [Task 9](#task-9--the-settings-window-shell) · **Severity:** Important ·
**Status:** fixed in `db3ee38`

**Problem.** `config.dndUntil` is written in exactly one place — the tray pause. Expiry is
handled entirely inside core, where `tick` transitions `paused` → `createInitialState`, and
nothing in main observed that transition, cleared `dndUntil`, or broadcast. Of the three
paths spec §2 mandates — tray pause, `Reload config file`, DND expiry — only two were wired.

The tray survives this because it re-derives `paused` from the timestamp every 30 seconds.
The settings renderer has neither a timer nor an event, so an open window rendered an
already-expired pause as an active hold, indefinitely. That is this project's documented
silent-stop shape, landing on the one promise the whole no-draft architecture rests on:
main pushes *every* change.

It was worse than first diagnosed. `tick`'s paused branch returns `createInitialState` with
an **empty effects array**, so the pre-existing `if (transition.effects.length > 0)
tray?.refresh()` never fired on expiry either — the tray was stale too, and only its own
30-second timer hid it.

The implementer's self-review had asserted this path was covered. It was not: it counted
broadcast call sites and then asserted what they covered, without tracing `setDnd`'s
callers. The claim was about a path, not about code it had written.

**Solution.** `applyEffects` captures the phase *before* reassigning `state`, and on a real
paused→non-paused transition clears `dndUntil`, refreshes the tray, and broadcasts. The
ordering is the whole fix — captured after the reassignment it would always be false, and
the block would be dead code that looks alive. Verified by trace, along with the fact that
manual Resume does not double-write, because `setDnd` nulls `dndUntil` before
`applyEffects` runs.

This also closes a known backlog item: `tray.ts` read `config.dndUntil` for the Resume
item's enablement while `countdownLabel` read `state.phase`, and they agreed only because
nothing ever cleared `dndUntil` on natural expiry. Now they agree for a reason.

**Still open, for Tasks 10–12:** a `dndUntil` already in the past *at launch* is never
cleared, because the scheduler starts `idle` and the transition never happens. Panes must
derive paused as `dndUntil !== null && dndUntil > Date.now()`, never presence alone.

---

### Issue 8 — A pack id reached the filesystem unsanitized

**From:** [Task 9](#task-9--the-settings-window-shell) · **Severity:** Important
(plan-mandated) · **Status:** fixed in `e12159d`

**Problem.** `settings:packs:read`, `settings:packs:write` and `settings:packs:revert`
passed the renderer-supplied `id` straight through to `src/main/packs.ts`, where four call
sites build ``join(userPacksDir(), `${id}.json`)`` with no validation — including
`writeFileSync` and `rmSync`. An `id` of `../config` on the revert channel would delete the
user's config file, and silently, because of `{ force: true }`.

Not reachable at the time: CSP is `'self'`, `sandbox: true`, no remote content is loaded,
and nothing calls these channels until Task 12. But this codebase states the
boundary-validation norm out loud — "the main process's only unchecked external input" —
and that sentence stopped being true at this commit.

**Solution.** Fixed rather than parked, because Task 12 is precisely what makes it
reachable and a guard costs one function. `isSafeId` at the IPC boundary, applied as the
first line of all three handlers, each returning the failure shape it already returns so a
bad id is inert rather than throwing across IPC. Verified that no rejected id falls through
to `reloadPacks`, and that every real pack id — including the hyphenated `drill-sergeant`
Task 15 ships — still passes.

The implementer went one step beyond the ruling and disclosed it: `RegExp.test` coerces via
`ToString`, so a bare regex would test the string `"null"` for a `null` argument — all
letters, and it would have passed. A typed predicate short-circuits before the coercion.
Accepted.

---

## Rulings made without asking

Decisions taken during execution that changed what got built. Recorded so they can be
reviewed and reversed.

| # | Ruling | Cost if wrong |
|---|---|---|
| R1 | Corrected Task 6's two broken due-phase tests to a 45-minute interval — see [Issue 4](#issue-4--two-of-task-6s-tests-would-have-failed-against-a-correct-implementation) | The ladder-mid-reminder path ships untested |
| R2 | Task 10 will wire all five panes, keeping Escalation and Packs as placeholders that still reference `packs`, because removing them as the plan says would fail `noUnusedLocals` before Task 12 restores the use | None — Tasks 11 and 12 overwrite the placeholders |
| R3 | The 60-line minimum is **not** enforced on editor writes, though spec §5 lists it among the reused rules. It is a craft rule for the shipped flagship pack; applying it to a user's own copy would refuse to let them trim it | A user can edit their copy of `sarcastic` below 60 lines; the shipped-pack test still passes, since it reads the repo file |
| R4 | `settings` declared `SettingsWindow \| null` and called as `settings?.…`, matching the existing `tray` idiom, because `actions.setDnd` and `actions.refreshConfig` close over it before `whenReady` assigns it | None — strictly safer, and the file's own convention |
| R5 | Task 14's `currentStreak([], 0, now)` hang will be verified out-of-band rather than by running it. A synchronous infinite loop ignores test timeouts and would wedge the runner; the bug is confirmed by inspection at `src/core/stats.ts:77-84` | That one watch-it-fail step rests on a bounded harness rather than the suite |
| R6 | Added an unclosed-tag guard the plan lacked — see [Issue 5](#issue-5--an-unclosed-stage-tag-was-silently-read-as-body-text) | A pack line deliberately starting with `[` is rejected, visibly |
| R7 | Accepted a forced file rename in Task 9. The plan names both `settings.tsx` (entry) and `Settings.tsx` (component); on NTFS with `core.ignorecase=true` — and on macOS APFS, case-insensitive by default — those are the **same file**, and writing one silently clobbers the other. The component keeps `Settings.tsx` (matching `Popup.tsx`, and the import target for Tasks 10–12); the entry became `settings-entry.tsx` | A one-file rename plus one line in `settings.html`. The rollup entry is the `.html`, so the `.tsx` name never has to match anything |
| R8 | Task 10 adds a `.catch` on the patch path that surfaces a rejected `settings:patch` in the pane. Task 10 is what made that failure reachable | A few lines of error state in `Settings.tsx` that Tasks 11–12 inherit rather than duplicate |
| R9 | `key={storedValue}` on every number input, so a clamped write remounts the field and visibly snaps back. The plan's `defaultValue` + `onBlur` pattern defeated spec §2's stated reason for returning the normalized config | A broadcast landing mid-type remounts the input and discards in-progress text. Narrow, and arguably correct: main is the source of truth |
| R10 | On blur, do not patch at all when the parsed value is not finite. `Number('')` is 0, which clamps *up* to the field's floor — clearing the interval to retype it would have set reminders to every minute | Clearing a field is a no-op rather than a clamp, which is the conventional behaviour for a numeric field with a floor |
| R11 | Widened R9 and R10 to the time inputs and to entries that normalize to the value already stored, and fixed two Minors in the same code: the autostart checkbox lied until the next restart, and the last-day refusal was silent | One `setLoginItemSettings` call on the patch path, guarded to packaged builds, and one line of note styling |
| R12 | Fixed a Minor *introduced by* a fix round rather than deferring it — one revision counter shared across a pane's fields, so settling one field ate what was being typed into its sibling | One extra short round. The change is strictly more correct either way |
| R13 | Extracted Task 11's ladder guard into `src/core/ladder.ts` as `tryUpdateStage`, on the design spec's own rule that a pane wanting a test is the signal | A pure function moves file and gains 13 tests |
| R14 | Folded three trivia into R13's round because they were one-liners in code already being touched: stage delays now bounded and integer-checked, `CORNERS` made `readonly`, per-stage `aria-label`s | None |
| R15 | Tasks 12–16 ran without implementer or reviewer subagents, the session having forbidden them, and were reviewed by trace instead | Five tasks carry one pair of eyes rather than two. The whole-branch review is where that gets caught, and it has not been run |

---

## Deferred minor findings

Real but non-blocking. Carried to the final whole-branch review to triage.

| From | Finding |
|---|---|
| [Task 1](#task-1--config-v2-shape-and-the-migration-hook) | `src/core/migrate.ts:115` — `asRecord` body exceeds ~110 chars where the rest of the file wraps under 100 |
| [Task 1](#task-1--config-v2-shape-and-the-migration-hook) | The array-aliasing test in `tests/core/config.test.ts` lost its `customLines` assertion along with the removed field; coverage shrank by one field as expected |
| [Task 4](#task-4--persist-nextdueat-across-restarts) | The `null` and `NaN` fallback tests also pass against the pre-implementation code, since the old two-arg `createInitialState` ignored a third argument. Structural — those cases are *defined* as the old behaviour. The other two tests carry the genuine behavioural RED |
| [Task 5](#task-5--overnight-and-always-on-work-windows) | `src/core/labels.ts:20` — `wraps` recomputed inside a loop it does not depend on |
| [Task 5](#task-5--overnight-and-always-on-work-windows) | `wraps = end <= start` duplicated across `scheduler.ts` and `labels.ts`, with the inverse in `config.ts`. A shared `isWrapping(hours)` would remove it |
| [Task 6](#task-6--applying-a-config-change-to-a-running-scheduler) | Stage-derivation logic now exists twice in `scheduler.ts` — `tick` scans forward (escalate-only), `onConfigChange` scans from 0 (allows downward clamp). The divergence is intentional, but the two are equivalent under an unchanged ladder, so a shared `deriveStage(ladder, elapsed)` would remove the hand-sync risk |
| [Task 6](#task-6--applying-a-config-change-to-a-running-scheduler) | The ladder-shortening test asserts only `stageIndex`, not the emitted effect, unlike its sibling |
| [Task 7](#task-7--the-pack-line-editor-text-format) | No test for CRLF input or a trailing newline. Correct by inspection via `raw.trim()`, but resting on implicit semantics a refactor could break silently |
| [Task 7](#task-7--the-pack-line-editor-text-format) | No test for whitespace preceding a tag (`  [1] text`) — same caveat |
| [Task 12](#task-12--packs-pane) | Switching panes in the sidebar discards an unsaved pack edit with no prompt. The pane unmounts, so guarding it means lifting the editor state into `Settings.tsx` |
| [Task 12](#task-12--packs-pane) | An `activePackId` with no file on disk — a hand-deleted `custom.json` — is invisible in the list yet still counts toward the last-pack refusal |
| [Task 12](#task-12--packs-pane) | The pack list is fetched once at mount, so a pack file added by hand while settings is open is not listed until it is reopened |
| [Task 13](#task-13--tray-tooltip-shows-hydration-progress) | The tooltip reads the whole intake log on every tray refresh, so every 30 seconds rather than only on show. Still trivial at ~10 events a day |

---

## For the Mac

Nothing on this branch has run on macOS. Builds happen only in CI, on a `v*` tag push;
no build of any kind works on the Windows dev machine.

Three things have since been confirmed on v0.1.5 (2026-08-28) and are recorded in
`docs/status-and-backlog.md` rather than here:

- Settings opens from the tray and comes to the **front** under `LSUIElement` with the
  dock hidden, even over a fullscreen app. `app.focus({ steal: true })` in
  `settings-window.ts` is what does it — load-bearing, not redundant.
- Settings sits **behind** an active reminder. A second window now exists in the process
  and the core promise survived it.
- The reminder cannot be escaped with Cmd-Tab.

Everything else on this branch is unrun on macOS, including all of Tasks 12–16. The
checklist to run against a fresh `.dmg` is the Phase 3a section of
`docs/manual-verification.md`; the pack editor's line numbers and the corrupt-pack row
are the two checks most likely to find something, because they are the two whose failure
modes are silent.
