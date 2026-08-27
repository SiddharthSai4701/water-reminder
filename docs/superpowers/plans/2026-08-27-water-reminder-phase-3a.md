# Water Reminder Phase 3a Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the app a settings window, a versioned config that can be migrated, a schedule that can express any window including overnight and always-on, and message packs the user can edit in a folder that survives reinstalls.

**Architecture:** All decisions live in `src/core/` as pure TypeScript with no Electron imports, so they run under Vitest on the Windows development machine. The Electron layer is a thin shell owning windows, tray, and file I/O. Settings is a second `BrowserWindow` with its own preload; the main process is the sole source of truth and the renderer holds no draft state.

**Tech Stack:** Electron 33, React 18, TypeScript 5.6, electron-vite 2, Vitest 2, electron-store 8.

**Spec:** `docs/superpowers/specs/2026-08-27-water-reminder-phase-3a-design.md`

## Global Constraints

- **TDD, always.** Write the failing test, run it, watch it fail for the right reason, then implement. A test that passes the first time is testing the wrong thing.
- **Nothing in `src/core/` may import from `electron`.** That is what keeps the logic testable from Windows. If a core function needs the filesystem, it returns a description of the work and the shell performs it.
- **`npm test` and `npm run typecheck` must both pass before every commit.** `typecheck` runs two projects; `noUnusedLocals` and `noUnusedParameters` are on, so an unused import fails the build.
- **The reminder must never become dismissible.** No task may relax the popup's `close` veto, its `alwaysOnTop` level, or `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`. Phase 2 verified on 2026-08-27 that this combination floats above a genuine fullscreen app at every stage; it is load-bearing.
- **No `Co-Authored-By` or AI-attribution trailer in any commit message.** Subject and body only.
- **Config values are clamped, never rejected with a throw.** This is a background app with no window to show an error in; `normalizeConfig` degrades to a working default.
- **`workEndMinute` uses 1440 for end-of-day, never 1439.** `isWithinWorkHours` compares with `<`, so 1439 leaves the last minute of every day a silent hold.
- **Commit after every task**, using Conventional Commits (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `src/core/migrate.ts` | Reads `version`, branches, returns raw config plus side effects for the shell |
| `src/core/packtext.ts` | Parses and formats the pack line editor's text format |
| `src/core/packvalidate.ts` | The pack content rules, shared by the editor and the pack tests |
| `src/main/settings-window.ts` | Single-instance settings `BrowserWindow` |
| `src/main/settings-ipc.ts` | The `settings:*` IPC handlers |
| `src/preload/settings.ts` | Second preload; the settings-only bridge |
| `src/renderer/settings.html` | Settings renderer entry document |
| `src/renderer/settings.tsx` | Settings React root |
| `src/renderer/Settings.tsx` | Pane shell and sidebar |
| `src/renderer/panes/*.tsx` | One file per pane |
| `src/renderer/settings.css` | Settings styling |
| `packs/drill-sergeant.json`, `packs/wholesome.json`, `packs/deadpan.json` | New shipped packs |

**Modified:** `src/shared/types.ts`, `src/core/config.ts`, `src/core/scheduler.ts`, `src/core/labels.ts`, `src/core/stats.ts`, `src/main/config.ts`, `src/main/packs.ts`, `src/main/index.ts`, `src/main/tray.ts`, `electron.vite.config.ts`.

---

### Task 1: Config v2 shape and the migration hook

The spec says this lands first: `normalizeConfig` currently ignores the incoming `version` and stamps `CONFIG_VERSION` unconditionally, so any config change ships against files already claiming the new version.

**Files:**
- Create: `src/core/migrate.ts`
- Create: `tests/core/migrate.test.ts`
- Modify: `src/shared/types.ts` (Config: drop `customLines`, add `nextDueAt`)
- Modify: `src/core/config.ts` (`CONFIG_VERSION` → 2)
- Modify: `tests/core/config.test.ts`

**Interfaces:**
- Produces: `migrateConfig(raw: unknown): Migrated` where `interface Migrated { raw: Record<string, unknown>; effects: MigrationEffects }` and `interface MigrationEffects { writeCustomPack?: string[] }`.
- Produces: `Config.nextDueAt: number | null`; `Config.customLines` no longer exists.

- [ ] **Step 1: Write the failing test**

`tests/core/migrate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { migrateConfig } from '../../src/core/migrate.js';

describe('migrateConfig', () => {
  it('treats a config with no version as v1', () => {
    const { raw } = migrateConfig({ goalMl: 3000 });
    expect(raw.version).toBe(2);
    expect(raw.goalMl).toBe(3000);
  });

  it('moves v1 customLines into a pack-write effect', () => {
    const { raw, effects } = migrateConfig({
      version: 1,
      customLines: ['Drink up.', 'Still thirsty.'],
    });
    expect(effects.writeCustomPack).toEqual(['Drink up.', 'Still thirsty.']);
    expect(raw.customLines).toBeUndefined();
  });

  it('emits no effect when v1 had no custom lines', () => {
    const { effects } = migrateConfig({ version: 1, customLines: [] });
    expect(effects.writeCustomPack).toBeUndefined();
  });

  it('leaves a v2 config alone', () => {
    const { raw, effects } = migrateConfig({ version: 2, goalMl: 4000 });
    expect(raw).toEqual({ version: 2, goalMl: 4000 });
    expect(effects).toEqual({});
  });

  it('does not throw on arbitrary junk', () => {
    expect(() => migrateConfig(null)).not.toThrow();
    expect(() => migrateConfig(7)).not.toThrow();
    expect(migrateConfig('nonsense').raw.version).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/migrate.test.ts`
Expected: FAIL — `Failed to load url ../../src/core/migrate.js`. Create the file with stub exports returning `{ raw: {}, effects: {} }`, re-run, and confirm the failures are now assertion failures rather than a module error. Do not proceed until the failure is behavioural.

- [ ] **Step 3: Write minimal implementation**

`src/core/migrate.ts`:

```ts
export interface MigrationEffects {
  /** Lines lifted out of a v1 config; the shell writes them to a pack file. */
  writeCustomPack?: string[];
}

export interface Migrated {
  raw: Record<string, unknown>;
  effects: MigrationEffects;
}

const CURRENT = 2;

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? { ...(value as Record<string, unknown>) } : {};
}

/**
 * Reads the stored `version` and brings the shape forward. Takes `unknown`
 * and never throws: the input is a file the user may have hand-edited, and
 * this runs before the app has any window to report an error in.
 *
 * Migration is not recorded here. The caller persists the result only after
 * every effect has been performed, so a failed effect leaves the file at its
 * old version and the migration is retried on the next launch.
 */
export function migrateConfig(raw: unknown): Migrated {
  const r = asRecord(raw);
  const effects: MigrationEffects = {};
  const version = typeof r.version === 'number' && Number.isFinite(r.version) ? r.version : 1;

  if (version < 2) {
    const lines = Array.isArray(r.customLines)
      ? (r.customLines as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];
    if (lines.length > 0) effects.writeCustomPack = lines;
    delete r.customLines;
  }

  if (version < CURRENT) r.version = CURRENT;
  return { raw: r, effects };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/migrate.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Update the Config type**

In `src/shared/types.ts`, inside `interface Config`: delete the `customLines: string[];` line and add, after `dndUntil`:

```ts
  /** Epoch ms of the next reminder, persisted so a relaunch does not re-arm. */
  nextDueAt: number | null;
```

- [ ] **Step 6: Update normalizeConfig**

In `src/core/config.ts`:

- Change `export const CONFIG_VERSION = 1;` to `= 2;`
- Delete `customLines: [],` from `DEFAULT_CONFIG` and add `nextDueAt: null,`
- Delete the `const customLines = Array.isArray(r.customLines) ? ... : d.customLines;` block
- Delete `customLines: [...customLines],` from the returned object and add:

```ts
    nextDueAt:
      typeof r.nextDueAt === 'number' && Number.isFinite(r.nextDueAt) ? r.nextDueAt : null,
```

- [ ] **Step 7: Fix the config test and typecheck**

`npm run typecheck` will now fail wherever `customLines` is referenced — `src/main/index.ts` (the `loadPacks` call) and `tests/core/config.test.ts`. In `src/main/index.ts`, change both `loadPacks(config.activePackIds, config.customLines)` calls to `loadPacks(config.activePackIds, [])`. Remove any `customLines` assertions from `tests/core/config.test.ts` and add:

```ts
  it('defaults nextDueAt to null and rejects a non-finite value', () => {
    expect(normalizeConfig({}).nextDueAt).toBeNull();
    expect(normalizeConfig({ nextDueAt: Number.NaN }).nextDueAt).toBeNull();
    expect(normalizeConfig({ nextDueAt: 1787542200000 }).nextDueAt).toBe(1787542200000);
  });

  it('stamps the current config version', () => {
    expect(normalizeConfig({ version: 1 }).version).toBe(CONFIG_VERSION);
  });
```

- [ ] **Step 8: Run the full suite**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: version the config and add a migration hook

normalizeConfig ignored the incoming version and stamped CONFIG_VERSION
unconditionally, so a config change would ship against files already
claiming the new version. migrateConfig reads the version and branches.

Config v2 drops customLines, which move to a pack file, and adds a
persisted nextDueAt. Neither is wired up yet."
```

---

### Task 2: The user packs directory

**Files:**
- Modify: `src/main/packs.ts`
- Test: none — this task is filesystem shell code. Its resolution rule is tested in Task 3.

**Interfaces:**
- Produces: `userPacksDir(): string`, `writeUserPack(id: string, pack: Pack): boolean`, `deleteUserPack(id: string): boolean`, `hasUserPack(id: string): boolean`, `listPackIds(): string[]`, and `loadPacksWithErrors(activeIds, fallbackCustomLines): { packs: Pack[]; errors: PackLoadError[] }` where `interface PackLoadError { id: string; message: string }`.
- Consumes: `Pack` from `src/shared/types.js`.

- [ ] **Step 1: Rewrite `src/main/packs.ts`**

```ts
import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pack } from '../shared/types.js';

export interface PackLoadError {
  id: string;
  message: string;
}

/** Shipped packs. Read-only: inside the .app bundle in a packaged build. */
function shippedPacksDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'packs') : join(app.getAppPath(), 'packs');
}

/** The user's own packs. Editable, and survives a reinstall. */
export function userPacksDir(): string {
  return join(app.getPath('userData'), 'packs');
}

function ensureUserPacksDir(): void {
  mkdirSync(userPacksDir(), { recursive: true });
}

export function hasUserPack(id: string): boolean {
  return existsSync(join(userPacksDir(), `${id}.json`));
}

export function writeUserPack(id: string, pack: Pack): boolean {
  try {
    ensureUserPacksDir();
    writeFileSync(join(userPacksDir(), `${id}.json`), `${JSON.stringify(pack, null, 2)}\n`, 'utf8');
    return true;
  } catch (error) {
    console.error(`failed to write user pack ${id}:`, error);
    return false;
  }
}

export function deleteUserPack(id: string): boolean {
  try {
    rmSync(join(userPacksDir(), `${id}.json`), { force: true });
    return true;
  } catch (error) {
    console.error(`failed to delete user pack ${id}:`, error);
    return false;
  }
}

function idsIn(dir: string): string[] {
  try {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length));
  } catch {
    return [];
  }
}

/** Every pack id the app knows about, shipped and user, deduplicated. */
export function listPackIds(): string[] {
  return [...new Set([...idsIn(shippedPacksDir()), ...idsIn(userPacksDir())])].sort();
}

/**
 * A user pack with the same id replaces the shipped one wholesale. No
 * merging: a pack is either yours or the app's.
 */
function readPack(id: string): { pack: Pack | null; error: string | null } {
  const candidates = [join(userPacksDir(), `${id}.json`), join(shippedPacksDir(), `${id}.json`)];
  for (const path of candidates) {
    if (!existsSync(path)) continue;
    try {
      return { pack: JSON.parse(readFileSync(path, 'utf8')) as Pack, error: null };
    } catch (error) {
      // Surfaced rather than swallowed: a malformed pack used to make the
      // personality silently vanish behind the generic fallback line.
      return { pack: null, error: error instanceof Error ? error.message : String(error) };
    }
  }
  return { pack: null, error: null };
}

export function loadPacksWithErrors(
  activeIds: string[],
  fallbackCustomLines: string[] = [],
): { packs: Pack[]; errors: PackLoadError[] } {
  const packs: Pack[] = [];
  const errors: PackLoadError[] = [];

  for (const id of activeIds) {
    const { pack, error } = readPack(id);
    if (pack !== null) packs.push(pack);
    else if (error !== null) errors.push({ id, message: error });
  }

  // Only used when a customLines migration could not write its file; the
  // lines stay live for this session and the migration retries next launch.
  if (fallbackCustomLines.length > 0) {
    packs.push({
      id: 'custom',
      name: 'Custom',
      lines: fallbackCustomLines.map((text) => ({ text })),
    });
  }

  return { packs, errors };
}

export function loadPacks(activeIds: string[], fallbackCustomLines: string[] = []): Pack[] {
  return loadPacksWithErrors(activeIds, fallbackCustomLines).packs;
}
```

- [ ] **Step 2: Verify nothing broke**

Run: `npm test && npm run typecheck`
Expected: all green. `loadPacks` keeps its old signature so `src/main/index.ts` still compiles.

- [ ] **Step 3: Commit**

```bash
git add src/main/packs.ts
git commit -m "feat: read message packs from a user packs directory

Packs now also load from <userData>/packs/*.json, and a user pack with
the same id replaces the shipped one wholesale. Editing a pack inside a
packaged .app does not survive a reinstall and is not reachable from the
UI; this folder is.

Parse errors are collected instead of swallowed. A malformed pack used
to drop the app to its generic fallback line with no error shown
anywhere, so the personality simply appeared to vanish."
```

---

### Task 3: Perform the migration on load

**Files:**
- Modify: `src/main/config.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Consumes: `migrateConfig` (Task 1), `writeUserPack` (Task 2).
- Produces: `loadConfig(): { config: Config; pendingCustomLines: string[] }` — the return type changes, so `src/main/index.ts` must be updated in the same task.

- [ ] **Step 1: Rewrite `loadConfig` in `src/main/config.ts`**

```ts
import Store from 'electron-store';
import type { Config } from '../shared/types.js';
import { DEFAULT_CONFIG, normalizeConfig } from '../core/config.js';
import { migrateConfig } from '../core/migrate.js';
import { writeUserPack } from './packs.js';

const store = new Store<{ config: unknown }>({ name: 'config' });

export interface LoadedConfig {
  config: Config;
  /**
   * Lines a customLines migration could not write to disk. They stay live
   * for this session; the migration retries on the next launch.
   */
  pendingCustomLines: string[];
}

export function loadConfig(): LoadedConfig {
  try {
    const { raw, effects } = migrateConfig(store.get('config', DEFAULT_CONFIG));
    const config = normalizeConfig(raw);

    let migrated = true;
    let pendingCustomLines: string[] = [];

    if (effects.writeCustomPack !== undefined) {
      const lines = effects.writeCustomPack;
      migrated = writeUserPack('custom', {
        id: 'custom',
        name: 'Custom',
        lines: lines.map((text) => ({ text })),
      });
      if (!migrated) pendingCustomLines = lines;
    }

    // The version stamp is what records that the migration happened, so a
    // failed effect must not be persisted or it can never be retried.
    if (migrated) store.set('config', config);

    return { config, pendingCustomLines };
  } catch (error) {
    // This app has no window to show an error in. Every I/O path here
    // degrades to a working default rather than throwing into a tick handler
    // and killing a process the user cannot see die.
    console.error('failed to read config, falling back to defaults:', error);
    return { config: normalizeConfig({}), pendingCustomLines: [] };
  }
}
```

Leave `saveConfig` unchanged.

- [ ] **Step 2: Update the two call sites in `src/main/index.ts`**

Add a module-level `let pendingCustomLines: string[] = [];` beside the other `let` declarations. Then in `actions.refreshConfig`:

```ts
  refreshConfig(): void {
    const loaded = loadConfig();
    config = loaded.config;
    pendingCustomLines = loaded.pendingCustomLines;
    packs = loadPacks(config.activePackIds, pendingCustomLines);
  },
```

And in the `app.whenReady()` body, replace the first two lines:

```ts
    const loaded = loadConfig();
    config = loaded.config;
    pendingCustomLines = loaded.pendingCustomLines;
    packs = loadPacks(config.activePackIds, pendingCustomLines);
```

- [ ] **Step 3: Verify**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add src/main/config.ts src/main/index.ts
git commit -m "feat: run the config migration on load

Custom lines move out of config.json into <userData>/packs/custom.json.
The migrated config is persisted only after the pack file is written, so
a failed write leaves the file at v1 and the migration retries next
launch rather than recording a migration that never happened. Until it
succeeds the lines stay live in memory."
```

---

### Task 4: Persist `nextDueAt` across restarts

Today every relaunch re-arms a full interval from `now`. With autostart on and a user who occasionally quits, reminders walk later indefinitely.

**Files:**
- Modify: `src/core/scheduler.ts`
- Modify: `tests/core/scheduler.test.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Produces: `createInitialState(now: number, cfg: SchedulerConfig, persistedNextDueAt?: number | null): SchedulerState`.

- [ ] **Step 1: Write the failing test**

Append to `tests/core/scheduler.test.ts`:

```ts
describe('persisted nextDueAt', () => {
  it('adopts a future value instead of re-arming', () => {
    const now = MONDAY_10AM;
    const stored = now + 7 * MIN;
    expect(createInitialState(now, cfg, stored).nextDueAt).toBe(stored);
  });

  it('fires once for a value already in the past', () => {
    const now = MONDAY_10AM;
    const s = createInitialState(now, cfg, now - 90 * MIN);
    const out = run(s, [now, now + 1000, now + 2000]);
    expect(out.effects).toEqual([
      { type: 'show', stageIndex: 0, mode: 'corner', sound: false },
    ]);
  });

  it('re-arms a full interval when nothing was stored', () => {
    const now = MONDAY_10AM;
    expect(createInitialState(now, cfg, null).nextDueAt).toBe(now + cfg.intervalMinutes * MIN);
    expect(createInitialState(now, cfg).nextDueAt).toBe(now + cfg.intervalMinutes * MIN);
  });

  it('ignores a non-finite stored value', () => {
    const now = MONDAY_10AM;
    expect(createInitialState(now, cfg, Number.NaN).nextDueAt).toBe(
      now + cfg.intervalMinutes * MIN,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/scheduler.test.ts`
Expected: FAIL — the first test reports the re-armed time rather than the stored one, because the third parameter is ignored.

- [ ] **Step 3: Implement**

In `src/core/scheduler.ts`, replace `createInitialState`:

```ts
/**
 * `persistedNextDueAt` is the value carried across a restart. A past value
 * produces exactly one reminder on the first tick rather than a burst — the
 * same collapse rule that applies to waking from sleep.
 */
export function createInitialState(
  now: number,
  cfg: SchedulerConfig,
  persistedNextDueAt: number | null = null,
): SchedulerState {
  const usable =
    typeof persistedNextDueAt === 'number' && Number.isFinite(persistedNextDueAt)
      ? persistedNextDueAt
      : now + cfg.intervalMinutes * MIN;

  return {
    phase: 'idle',
    nextDueAt: usable,
    dueSince: null,
    stageIndex: 0,
    pausedUntil: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/scheduler.test.ts`
Expected: PASS. Note `rearm` and the DND-expiry branch still call `createInitialState(now, cfg)` with no third argument, which is correct — those deliberately discard the old schedule.

- [ ] **Step 5: Persist it from the shell**

In `src/main/index.ts`, add beside the other module state:

```ts
let persistedNextDueAt: number | null = null;
```

In `applyEffects`, after `state = transition.state;`, add:

```ts
  // Only on a real change. Writing on every tick would mean a disk write a
  // second for a value that moves once per interval.
  if (state.nextDueAt !== persistedNextDueAt) {
    persistedNextDueAt = state.nextDueAt;
    config = saveConfig(config, { nextDueAt: state.nextDueAt });
  }
```

In the `app.whenReady()` body, change the state construction to:

```ts
    persistedNextDueAt = config.nextDueAt;
    state = createInitialState(Date.now(), schedulerConfig(), config.nextDueAt);
```

- [ ] **Step 6: Verify**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: persist nextDueAt across restarts

Every relaunch used to re-arm a full interval from now, so with autostart
on and an occasional quit, reminders drifted later indefinitely.

A stored value in the past produces exactly one reminder on the first
tick, never a burst, matching the collapse rule for waking from sleep.
The value is written only when it changes, not on every tick."
```

---

### Task 5: Overnight and always-on work windows

`normalizeSchedule` requires `workEndMinute > workStartMinute` and silently falls back otherwise, so a 22:00–02:00 schedule is discarded without a word.

**Files:**
- Modify: `src/core/scheduler.ts` (`isWithinWorkHours`)
- Modify: `src/core/labels.ts` (`nextWorkWindowStart`)
- Modify: `src/core/config.ts` (`normalizeSchedule`)
- Modify: `tests/core/scheduler.test.ts`, `tests/core/labels.test.ts`, `tests/core/config.test.ts`

**Interfaces:**
- No signature changes. `isWithinWorkHours(now, hours)` and `nextWorkWindowStart(t, hours)` keep their shapes.

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/scheduler.test.ts`:

```ts
describe('overnight work windows', () => {
  const night = { workStartMinute: 22 * 60, workEndMinute: 2 * 60, workDays: [0, 1, 2, 3, 4, 5, 6] };

  it('is true late in the evening', () => {
    expect(isWithinWorkHours(new Date(2026, 7, 24, 23, 30).getTime(), night)).toBe(true);
  });

  it('is true in the small hours', () => {
    expect(isWithinWorkHours(new Date(2026, 7, 24, 1, 30).getTime(), night)).toBe(true);
  });

  it('is false in the afternoon', () => {
    expect(isWithinWorkHours(new Date(2026, 7, 24, 15, 0).getTime(), night)).toBe(false);
  });

  it('evaluates workDays against the day the minute falls on', () => {
    // Monday only. Tuesday 01:00 is not inside Monday's overnight window.
    const mondayOnly = { ...night, workDays: [1] };
    expect(isWithinWorkHours(new Date(2026, 7, 24, 23, 30).getTime(), mondayOnly)).toBe(true);
    expect(isWithinWorkHours(new Date(2026, 7, 25, 1, 0).getTime(), mondayOnly)).toBe(false);
  });
});
```

Append to `tests/core/labels.test.ts`:

```ts
describe('nextWorkWindowStart with a wrapping window', () => {
  const night = { workStartMinute: 22 * 60, workEndMinute: 2 * 60, workDays: [1] };

  it('opens at midnight on the next listed day', () => {
    // Saturday: not a work day. The next Monday minute inside a wrapping
    // window is 00:00, not 22:00.
    const saturday = new Date(2026, 7, 29, 12, 0).getTime();
    expect(nextWorkWindowStart(saturday, night)).toBe(new Date(2026, 7, 31, 0, 0).getTime());
  });
});
```

Append to `tests/core/config.test.ts`:

```ts
describe('normalizeSchedule window validation', () => {
  it('accepts an overnight window', () => {
    const c = normalizeConfig({ schedule: { workStartMinute: 1320, workEndMinute: 120 } });
    expect(c.schedule.workStartMinute).toBe(1320);
    expect(c.schedule.workEndMinute).toBe(120);
  });

  it('rejects an empty window where start equals end', () => {
    const c = normalizeConfig({ schedule: { workStartMinute: 600, workEndMinute: 600 } });
    expect(c.schedule.workStartMinute).toBe(DEFAULT_CONFIG.schedule.workStartMinute);
    expect(c.schedule.workEndMinute).toBe(DEFAULT_CONFIG.schedule.workEndMinute);
  });
});
```

Delete the existing `overnight` assertion in `tests/core/config.test.ts` that expects a wrapping window to fall back to the default — it now asserts the opposite of the intended behaviour.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL in all three files, on assertions, not module errors.

- [ ] **Step 3: Implement the wrap in `isWithinWorkHours`**

In `src/core/scheduler.ts`:

```ts
export function isWithinWorkHours(now: number, cfg: WorkHours): boolean {
  const d = new Date(now);
  if (!cfg.workDays.includes(d.getDay())) return false;
  const minuteOfDay = d.getHours() * 60 + d.getMinutes();

  // An overnight window is a window on each of its listed days, not a window
  // that drags the previous day's membership across midnight. "Reminders on
  // Wednesday" then means what a person expects it to mean.
  const wraps = cfg.workEndMinute <= cfg.workStartMinute;
  return wraps
    ? minuteOfDay >= cfg.workStartMinute || minuteOfDay < cfg.workEndMinute
    : minuteOfDay >= cfg.workStartMinute && minuteOfDay < cfg.workEndMinute;
}
```

- [ ] **Step 4: Implement the wrap in `nextWorkWindowStart`**

In `src/core/labels.ts`, inside the loop, replace `day.setMinutes(hours.workStartMinute);` with:

```ts
    // Under a wrapping window the earliest in-window minute of a listed day
    // is midnight, because the window covers 00:00 up to workEndMinute.
    const wraps = hours.workEndMinute <= hours.workStartMinute;
    day.setMinutes(wraps ? 0 : hours.workStartMinute);
```

- [ ] **Step 5: Accept the wrap in `normalizeSchedule`**

In `src/core/config.ts`, replace the `validWindow` comment and expression:

```ts
  // A window whose start equals its end is empty, and isWithinWorkHours
  // would be false for every instant — the app silently never fires again.
  // A window whose end is *before* its start is an overnight window and is
  // supported.
  const validWindow = end !== start;
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: support overnight work windows

normalizeSchedule required end > start and silently fell back to the
default otherwise, so a 22:00-02:00 schedule was discarded without a
word. Only an empty window, where start equals end, is rejected now.

workDays is evaluated against the day the minute falls on rather than
the day the window opened, so an overnight window is a window on each of
its listed days. nextWorkWindowStart opens such a window at midnight."
```

---

### Task 6: Applying a config change to a running scheduler

**Files:**
- Modify: `src/core/scheduler.ts`
- Modify: `tests/core/scheduler.test.ts`

**Interfaces:**
- Produces: `onConfigChange(state: SchedulerState, oldCfg: SchedulerConfig, newCfg: SchedulerConfig, now: number): Transition`.

- [ ] **Step 1: Write the failing test**

Append to `tests/core/scheduler.test.ts`:

```ts
describe('onConfigChange', () => {
  it('rescales a pending reminder from the last one, not from now', () => {
    const now = MONDAY_10AM;
    const s = createInitialState(now, cfg);          // due at now + 30m
    const faster = { ...cfg, intervalMinutes: 20 };
    const out = onConfigChange(s, cfg, faster, now + 12 * MIN);
    // anchor = now; 20m interval means due at now + 20m, i.e. 8m from here.
    expect(out.state.nextDueAt).toBe(now + 20 * MIN);
    expect(out.effects).toEqual([]);
  });

  it('fires promptly when the rescaled time has already passed', () => {
    const now = MONDAY_10AM;
    const s = createInitialState(now, cfg);
    const faster = { ...cfg, intervalMinutes: 5 };
    const out = onConfigChange(s, cfg, faster, now + 12 * MIN);
    expect(out.state.nextDueAt).toBeLessThanOrEqual(now + 12 * MIN);
  });

  it('leaves a snooze alone', () => {
    const now = MONDAY_10AM;
    const snoozed = onSnooze(createInitialState(now, cfg), now, 10, cfg).state;
    const out = onConfigChange(snoozed, cfg, { ...cfg, intervalMinutes: 90 }, now + MIN);
    expect(out.state.nextDueAt).toBe(snoozed.nextDueAt);
  });

  it('escalates rather than restarting when the ladder gets louder mid-reminder', () => {
    const now = MONDAY_10AM;
    // Standard: corner 0, center +3, fullscreen +5 (absolute 0/3/8).
    let s = createInitialState(now, cfg);
    s = run(s, [now + 30 * MIN]).state;               // due, stage 0
    const dueAt = now + 30 * MIN;
    const relentless = { ...cfg, ladder: PRESET_LADDERS.relentless };
    // 4 minutes in. Relentless is 0/2/5, so 4m elapsed belongs at stage 1.
    const out = onConfigChange(s, cfg, relentless, dueAt + 4 * MIN);
    expect(out.state.stageIndex).toBe(1);
    expect(out.effects).toEqual([
      { type: 'show', stageIndex: 1, mode: 'center', sound: false },
    ]);
  });

  it('clamps the stage when the new ladder is shorter', () => {
    const now = MONDAY_10AM;
    let s = createInitialState(now, cfg);
    s = run(s, [now + 30 * MIN, now + 30 * MIN + 9 * MIN]).state;   // stage 2
    expect(s.stageIndex).toBe(2);
    const out = onConfigChange(s, cfg, { ...cfg, ladder: PRESET_LADDERS.gentle }, now + 40 * MIN);
    expect(out.state.stageIndex).toBe(0);
  });

  it('does not disturb a pause', () => {
    const now = MONDAY_10AM;
    const paused = setDnd(createInitialState(now, cfg), now + 60 * MIN, now, cfg).state;
    const out = onConfigChange(paused, cfg, { ...cfg, intervalMinutes: 5 }, now + MIN);
    expect(out.state).toEqual(paused);
    expect(out.effects).toEqual([]);
  });
});
```

Add `PRESET_LADDERS` to the imports at the top of the file if it is not already there:
`import { PRESET_LADDERS } from '../../src/core/ladder.js';`

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/scheduler.test.ts`
Expected: FAIL — `onConfigChange is not a function`. Add a stub returning `{ state, effects: [] }`, re-run, confirm assertion failures.

- [ ] **Step 3: Implement**

Append to `src/core/scheduler.ts`:

```ts
/**
 * Re-aims a running scheduler after the config changed under it.
 *
 * A changed interval rescales from the last reminder rather than from `now`:
 * restarting the countdown would mean every visit to settings silently buys
 * a fresh full interval, which is easy to do by accident and impossible to
 * notice. The anchor is derivable, so no new state is needed.
 */
export function onConfigChange(
  state: SchedulerState,
  oldCfg: SchedulerConfig,
  newCfg: SchedulerConfig,
  now: number,
): Transition {
  switch (state.phase) {
    // A pause is an explicit instruction with an explicit end. Nothing in
    // settings should shorten or lengthen it.
    case 'paused':
      return { state, effects: [] };

    // So is a snooze: the user named the delay.
    case 'snoozed':
      return { state, effects: [] };

    case 'idle': {
      if (newCfg.intervalMinutes === oldCfg.intervalMinutes) return { state, effects: [] };
      const anchor = state.nextDueAt - oldCfg.intervalMinutes * MIN;
      return { state: { ...state, nextDueAt: anchor + newCfg.intervalMinutes * MIN }, effects: [] };
    }

    case 'due': {
      // Re-derive the stage from elapsed time so a louder ladder escalates
      // rather than restarting at stage 0.
      const offsets = stageOffsets(newCfg.ladder);
      const elapsed = now - (state.dueSince ?? now);
      let target = 0;
      for (let i = 1; i < newCfg.ladder.length; i++) {
        if (elapsed >= offsets[i]) target = i;
      }
      if (target === state.stageIndex) return { state, effects: [] };
      return {
        state: { ...state, stageIndex: target },
        effects: [showEffect(newCfg.ladder, target)],
      };
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: re-aim the scheduler when the config changes under it

A changed interval rescales from the last reminder rather than from now,
so a visit to settings cannot silently buy a fresh full interval. A
changed ladder re-derives the current stage from elapsed time, so
switching to a louder preset mid-reminder escalates instead of
restarting. Snoozes and pauses are left alone: the user named those."
```

---

### Task 7: The pack line editor text format

**Files:**
- Create: `src/core/packtext.ts`
- Create: `tests/core/packtext.test.ts`

**Interfaces:**
- Produces: `parsePackText(text: string): ParsedPackText` where `interface ParsedPackText { lines: PackLine[]; errors: PackTextError[] }` and `interface PackTextError { line: number; message: string }`; `formatPackText(lines: PackLine[]): string`.

- [ ] **Step 1: Write the failing test**

`tests/core/packtext.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { formatPackText, parsePackText } from '../../src/core/packtext.js';

describe('parsePackText', () => {
  it('reads an untagged line as eligible at every stage', () => {
    const { lines, errors } = parsePackText('Your kidneys filed a complaint.');
    expect(errors).toEqual([]);
    expect(lines).toEqual([{ text: 'Your kidneys filed a complaint.' }]);
  });

  it('reads a single stage tag', () => {
    const { lines } = parsePackText('[2] DRINK. THE. WATER.');
    expect(lines).toEqual([{ text: 'DRINK. THE. WATER.', stage: [2] }]);
  });

  it('reads a multi-stage tag', () => {
    const { lines } = parsePackText('[0,1] Bold strategy.');
    expect(lines).toEqual([{ text: 'Bold strategy.', stage: [0, 1] }]);
  });

  it('tolerates spaces inside the tag', () => {
    const { lines } = parsePackText('[0, 1] Bold strategy.');
    expect(lines[0].stage).toEqual([0, 1]);
  });

  it('skips blank lines without reporting them', () => {
    const { lines, errors } = parsePackText('One.\n\n   \nTwo.');
    expect(lines).toHaveLength(2);
    expect(errors).toEqual([]);
  });

  it('reports a malformed tag against its line number', () => {
    const { lines, errors } = parsePackText('One.\n[x] Two.');
    expect(lines).toHaveLength(1);
    expect(errors).toEqual([{ line: 2, message: 'stage tag must be numbers, e.g. [0] or [0,1]' }]);
  });

  it('reports an empty tag', () => {
    const { errors } = parsePackText('[] Two.');
    expect(errors).toHaveLength(1);
  });

  it('reports a tagged line with no text', () => {
    const { errors } = parsePackText('[1]   ');
    expect(errors).toEqual([{ line: 1, message: 'line has a stage tag but no text' }]);
  });

  it('preserves template variables verbatim', () => {
    const { lines } = parsePackText('[0] {{glasses}} {{glassWord}} today.');
    expect(lines[0].text).toBe('{{glasses}} {{glassWord}} today.');
  });
});

describe('formatPackText', () => {
  it('round-trips', () => {
    const text = 'Plain line.\n[2] Loud line.\n[0,1] Early line.';
    expect(formatPackText(parsePackText(text).lines)).toBe(text);
  });

  it('omits the tag for an untagged line', () => {
    expect(formatPackText([{ text: 'Plain.' }])).toBe('Plain.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/packtext.test.ts`
Expected: module-not-found. Create the file with stubs, re-run, confirm behavioural failures.

- [ ] **Step 3: Implement**

`src/core/packtext.ts`:

```ts
import type { PackLine } from '../shared/types.js';

export interface PackTextError {
  /** 1-indexed, matching what the editor shows. */
  line: number;
  message: string;
}

export interface ParsedPackText {
  lines: PackLine[];
  errors: PackTextError[];
}

const TAGGED = /^\[([^\]]*)\]\s*(.*)$/;

/**
 * The editor's format: one line per row, with an optional stage tag in
 * brackets. An untagged line is eligible at every stage, matching
 * `PackLine.stage` being absent.
 *
 *   Your kidneys filed a complaint.
 *   [2] DRINK. THE. WATER.
 *   [0,1] {{glasses}} {{glassWord}} today. Bold strategy.
 *
 * A malformed tag is an error against its line rather than being treated as
 * body text: a line that quietly loses its tag reappears at the wrong volume.
 */
export function parsePackText(text: string): ParsedPackText {
  const lines: PackLine[] = [];
  const errors: PackTextError[] = [];

  text.split('\n').forEach((raw, index) => {
    const lineNumber = index + 1;
    const trimmed = raw.trim();
    if (trimmed.length === 0) return;

    const match = TAGGED.exec(trimmed);
    if (match === null) {
      lines.push({ text: trimmed });
      return;
    }

    const [, tag, body] = match;
    const parts = tag.split(',').map((p) => p.trim());
    const stage = parts.map((p) => Number(p));

    if (tag.trim().length === 0 || stage.some((n) => !Number.isInteger(n) || n < 0)) {
      errors.push({ line: lineNumber, message: 'stage tag must be numbers, e.g. [0] or [0,1]' });
      return;
    }
    if (body.trim().length === 0) {
      errors.push({ line: lineNumber, message: 'line has a stage tag but no text' });
      return;
    }

    lines.push({ text: body.trim(), stage });
  });

  return { lines, errors };
}

export function formatPackText(lines: PackLine[]): string {
  return lines
    .map((line) =>
      line.stage === undefined ? line.text : `[${line.stage.join(',')}] ${line.text}`,
    )
    .join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add src/core/packtext.ts tests/core/packtext.test.ts
git commit -m "feat: add the pack line editor text format

One line per row with an optional [0,1] stage tag; untagged means every
stage. JSON stays the storage format and this is a view of it, so the
pair round-trips. A malformed tag is an error against its line rather
than being read as body text, because a line that quietly loses its tag
reappears at the wrong volume."
```

---

### Task 8: Pack content validation

The rules `npm test` already enforces on the shipped pack become a module, so the editor rejects the same things before writing a file.

**Files:**
- Create: `src/core/packvalidate.ts`
- Create: `tests/core/packvalidate.test.ts`
- Modify: `tests/packs/sarcastic.test.ts` (reuse the module rather than restating the rules)

**Interfaces:**
- Produces: `validatePackLines(lines: PackLine[], options?: { minLines?: number }): PackIssue[]` where `interface PackIssue { line?: number; message: string }`.

- [ ] **Step 1: Write the failing test**

`tests/core/packvalidate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { validatePackLines } from '../../src/core/packvalidate.js';

describe('validatePackLines', () => {
  it('accepts a clean pack', () => {
    expect(validatePackLines([{ text: 'One.' }, { text: 'Two.' }])).toEqual([]);
  });

  it('rejects an empty pack', () => {
    expect(validatePackLines([])).toEqual([{ message: 'a pack needs at least one line' }]);
  });

  it('reports duplicates against the second occurrence', () => {
    const issues = validatePackLines([{ text: 'Same.' }, { text: 'Same.' }]);
    expect(issues).toEqual([{ line: 2, message: 'duplicate line' }]);
  });

  it('reports a hardcoded plural noun after a glass count', () => {
    const issues = validatePackLines([{ text: '{{glasses}} glasses today.' }]);
    expect(issues).toEqual([
      { line: 1, message: 'use {{glassWord}} after {{glasses}} so the noun agrees with the count' },
    ]);
  });

  it('accepts the templated form', () => {
    expect(validatePackLines([{ text: '{{glasses}} {{glassWord}} today.' }])).toEqual([]);
  });

  it('enforces a minimum when one is given', () => {
    const issues = validatePackLines([{ text: 'One.' }], { minLines: 60 });
    expect(issues).toEqual([{ message: 'this pack needs at least 60 lines' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/packvalidate.test.ts`
Expected: module-not-found, then behavioural failures after stubbing.

- [ ] **Step 3: Implement**

`src/core/packvalidate.ts`:

```ts
import type { PackLine } from '../shared/types.js';

export interface PackIssue {
  /** 1-indexed. Absent for issues about the pack as a whole. */
  line?: number;
  message: string;
}

/** "{{glasses}} glasses" reads as "1 glasses" whenever the count is one. */
const HARDCODED_PLURAL = /\{\{glasses\}\}\s+(glasses|glass)\b/i;

export function validatePackLines(
  lines: PackLine[],
  options: { minLines?: number } = {},
): PackIssue[] {
  const issues: PackIssue[] = [];

  if (lines.length === 0) {
    issues.push({ message: 'a pack needs at least one line' });
    return issues;
  }

  if (options.minLines !== undefined && lines.length < options.minLines) {
    issues.push({ message: `this pack needs at least ${options.minLines} lines` });
  }

  const seen = new Set<string>();
  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    if (line.text.trim().length === 0) {
      issues.push({ line: lineNumber, message: 'blank line' });
      return;
    }
    if (seen.has(line.text)) {
      issues.push({ line: lineNumber, message: 'duplicate line' });
    }
    seen.add(line.text);
    if (HARDCODED_PLURAL.test(line.text)) {
      issues.push({
        line: lineNumber,
        message: 'use {{glassWord}} after {{glasses}} so the noun agrees with the count',
      });
    }
  });

  return issues;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/packvalidate.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Reuse it in the shipped-pack test**

In `tests/packs/sarcastic.test.ts`, replace the `has no duplicate lines`, `has no blank lines`, and pluralization tests with:

```ts
  it('satisfies every pack content rule', () => {
    expect(validatePackLines(pack.lines, { minLines: 60 })).toEqual([]);
  });
```

and add `import { validatePackLines } from '../../src/core/packvalidate.js';` at the top. Keep the id, stage-coverage, and short-ladder tests as they are.

- [ ] **Step 6: Verify**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor: extract the pack content rules into core

The shipped-pack test restated rules the settings editor will need to
enforce before writing a file. One module now owns them, so a pack the
editor accepts is a pack the test suite accepts."
```

---

### Task 9: The settings window shell

The window opens, loads a React root, and shows a sidebar with no working panes yet. Panes arrive in Tasks 10–12.

**Files:**
- Create: `src/main/settings-window.ts`, `src/main/settings-ipc.ts`, `src/preload/settings.ts`
- Create: `src/renderer/settings.html`, `src/renderer/settings.tsx`, `src/renderer/Settings.tsx`, `src/renderer/settings.css`
- Modify: `electron.vite.config.ts`, `src/main/index.ts`, `src/main/tray.ts`

**Interfaces:**
- Produces: `class SettingsWindow { open(): void; destroy(): void; broadcast(config: Config): void }`.
- Produces: `registerSettingsIpc(deps: SettingsIpcDeps): void`.
- Produces: `window.waterSettings` in the settings renderer, typed as `SettingsApi`.

- [ ] **Step 1: Add the second renderer entry and preload**

In `electron.vite.config.ts`:

```ts
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts'),
          settings: resolve(__dirname, 'src/preload/settings.ts'),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'src/renderer/popup.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html'),
        },
      },
    },
  },
```

- [ ] **Step 2: Add the shared types**

Append to `src/shared/types.ts`:

```ts
export interface PackSummary {
  id: string;
  name: string;
  lineCount: number;
  active: boolean;
  /** A user file exists for this id. Shipped packs start false. */
  customised: boolean;
  /** Present when the file failed to load; the pane shows it verbatim. */
  error?: string;
}

export type PackWriteResult =
  | { ok: true; packs: PackSummary[] }
  | { ok: false; errors: { line?: number; message: string }[] };
```

`src/preload/settings.ts`:

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { Config } from '../shared/types.js';
import type { PackSummary, PackWriteResult } from '../shared/types.js';

const api = {
  get(): Promise<{ config: Config; packs: PackSummary[] }> {
    return ipcRenderer.invoke('settings:get') as Promise<{ config: Config; packs: PackSummary[] }>;
  },
  patch(partial: Partial<Config>): Promise<Config> {
    return ipcRenderer.invoke('settings:patch', partial) as Promise<Config>;
  },
  readPack(id: string): Promise<string> {
    return ipcRenderer.invoke('settings:packs:read', id) as Promise<string>;
  },
  writePack(id: string, text: string): Promise<PackWriteResult> {
    return ipcRenderer.invoke('settings:packs:write', id, text) as Promise<PackWriteResult>;
  },
  revertPack(id: string): Promise<PackSummary[]> {
    return ipcRenderer.invoke('settings:packs:revert', id) as Promise<PackSummary[]>;
  },
  revealPacks(): void {
    ipcRenderer.send('settings:packs:reveal');
  },
  onChanged(callback: (config: Config) => void): () => void {
    const handler = (_e: unknown, config: Config): void => callback(config);
    ipcRenderer.on('settings:changed', handler);
    // Returned so the React effect can clean up. The popup preload's missing
    // remover double-registers under StrictMode; do not repeat that here.
    return () => ipcRenderer.removeListener('settings:changed', handler);
  },
};

contextBridge.exposeInMainWorld('waterSettings', api);

export type SettingsApi = typeof api;
```

- [ ] **Step 3: Write the settings preload**

- [ ] **Step 4: Write the settings window**

`src/main/settings-window.ts`:

```ts
import { BrowserWindow, app } from 'electron';
import { join } from 'node:path';
import type { Config } from '../shared/types.js';

export class SettingsWindow {
  private window: BrowserWindow | null = null;

  open(): void {
    if (this.window !== null && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      // With the dock hidden (LSUIElement), a plain focus() often leaves the
      // window behind the frontmost app. This is the documented Phase 2 check.
      if (process.platform === 'darwin') app.focus({ steal: true });
      return;
    }

    const window = new BrowserWindow({
      width: 720,
      height: 560,
      minWidth: 600,
      minHeight: 460,
      show: false,
      title: 'Water Reminder Settings',
      webPreferences: {
        preload: join(__dirname, '../preload/settings.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    window.on('ready-to-show', () => {
      window.show();
      if (process.platform === 'darwin') app.focus({ steal: true });
    });
    window.on('closed', () => {
      this.window = null;
    });

    if (process.env.ELECTRON_RENDERER_URL !== undefined) {
      void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/settings.html`);
    } else {
      void window.loadFile(join(__dirname, '../renderer/settings.html'));
    }

    this.window = window;
  }

  broadcast(config: Config): void {
    if (this.window === null || this.window.isDestroyed()) return;
    this.window.webContents.send('settings:changed', config);
  }

  destroy(): void {
    this.window?.destroy();
    this.window = null;
  }
}
```

- [ ] **Step 5: Write the IPC handlers**

`src/main/settings-ipc.ts`:

```ts
import { ipcMain, shell } from 'electron';
import { formatPackText, parsePackText } from '../core/packtext.js';
import { validatePackLines } from '../core/packvalidate.js';
import type { Config, Pack, PackSummary, PackWriteResult } from '../shared/types.js';
import {
  deleteUserPack,
  hasUserPack,
  listPackIds,
  loadPacksWithErrors,
  userPacksDir,
  writeUserPack,
} from './packs.js';

export interface SettingsIpcDeps {
  config(): Config;
  patchConfig(partial: Partial<Config>): Config;
  reloadPacks(): void;
}

function summaries(config: Config): PackSummary[] {
  const ids = listPackIds();
  const { packs, errors } = loadPacksWithErrors(ids);
  const byId = new Map(packs.map((p) => [p.id, p]));
  const errorById = new Map(errors.map((e) => [e.id, e.message]));

  return ids.map((id) => {
    const pack = byId.get(id);
    return {
      id,
      name: pack?.name ?? id,
      lineCount: pack?.lines.length ?? 0,
      active: config.activePackIds.includes(id),
      customised: hasUserPack(id),
      error: errorById.get(id),
    };
  });
}

export function registerSettingsIpc(deps: SettingsIpcDeps): void {
  ipcMain.handle('settings:get', () => ({
    config: deps.config(),
    packs: summaries(deps.config()),
  }));

  ipcMain.handle('settings:patch', (_e, partial: Partial<Config>) => deps.patchConfig(partial));

  ipcMain.handle('settings:packs:read', (_e, id: string) => {
    const { packs } = loadPacksWithErrors([id]);
    const pack = packs.find((p) => p.id === id);
    return pack === undefined ? '' : formatPackText(pack.lines);
  });

  ipcMain.handle('settings:packs:write', (_e, id: string, text: string): PackWriteResult => {
    const parsed = parsePackText(text);
    if (parsed.errors.length > 0) return { ok: false, errors: parsed.errors };

    const issues = validatePackLines(parsed.lines);
    if (issues.length > 0) return { ok: false, errors: issues };

    const { packs } = loadPacksWithErrors([id]);
    const existing = packs.find((p) => p.id === id);
    const pack: Pack = { id, name: existing?.name ?? id, lines: parsed.lines };

    // Copy-on-write: writing a shipped pack's id creates the user file.
    if (!writeUserPack(id, pack)) {
      return { ok: false, errors: [{ message: 'could not write the pack file' }] };
    }
    deps.reloadPacks();
    return { ok: true, packs: summaries(deps.config()) };
  });

  ipcMain.handle('settings:packs:revert', (_e, id: string) => {
    deleteUserPack(id);
    deps.reloadPacks();
    return summaries(deps.config());
  });

  ipcMain.on('settings:packs:reveal', () => {
    void shell.openPath(userPacksDir());
  });
}
```

- [ ] **Step 6: Write the renderer shell**

`src/renderer/settings.html` — copy `popup.html` and change the title to `Water Reminder Settings` and the script src to `./settings.tsx`.

`src/renderer/settings.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Settings from './Settings.js';
import type { SettingsApi } from '../preload/settings.js';
import './settings.css';

declare global {
  interface Window {
    waterSettings: SettingsApi;
  }
}

const container = document.getElementById('root');
if (container === null) throw new Error('settings root element missing');

createRoot(container).render(
  <StrictMode>
    <Settings />
  </StrictMode>,
);
```

`src/renderer/Settings.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { Config, PackSummary } from '../shared/types.js';

const PANES = ['Schedule', 'Escalation', 'Hydration', 'Packs', 'General'] as const;
type Pane = (typeof PANES)[number];

export default function Settings(): JSX.Element {
  const [pane, setPane] = useState<Pane>('Schedule');
  const [config, setConfig] = useState<Config | null>(null);
  const [packs, setPacks] = useState<PackSummary[]>([]);

  useEffect(() => {
    void window.waterSettings.get().then((state) => {
      setConfig(state.config);
      setPacks(state.packs);
    });
    return window.waterSettings.onChanged(setConfig);
  }, []);

  async function patch(partial: Partial<Config>): Promise<void> {
    setConfig(await window.waterSettings.patch(partial));
  }

  if (config === null) return <div className="loading">Loading…</div>;

  return (
    <div className="shell">
      <nav aria-label="Settings sections">
        {PANES.map((name) => (
          <button
            key={name}
            className={name === pane ? 'active' : ''}
            aria-current={name === pane ? 'page' : undefined}
            onClick={() => setPane(name)}
          >
            {name}
          </button>
        ))}
      </nav>
      <main>
        <h1>{pane}</h1>
        <p className="placeholder">
          {`${pane} settings arrive in a later task.`}
        </p>
        {/* patch and packs are wired up by Tasks 10-12. */}
        <span hidden>{`${packs.length} packs, goal ${config.goalMl}`}</span>
        <button hidden onClick={() => void patch({})} />
      </main>
    </div>
  );
}
```

`src/renderer/settings.css`: a minimal two-column layout — `.shell { display: grid; grid-template-columns: 12rem 1fr; height: 100vh; }`, `nav { display: flex; flex-direction: column; }`, plus `:focus-visible { outline: 2px solid; }`. Match the visual language of `popup.css`.

- [ ] **Step 7: Wire it into main**

In `src/main/index.ts`: import `SettingsWindow` and `registerSettingsIpc`, add `let settings: SettingsWindow;`, construct it beside `popups`, and replace the tray's `openSettings` stub with `() => settings.open()`. Add to `before-quit`: `settings.destroy();`. Register the IPC after the tray is created:

```ts
    registerSettingsIpc({
      config: () => config,
      patchConfig: (partial) => {
        const previous = schedulerConfig();
        config = saveConfig(config, partial);
        packs = loadPacks(config.activePackIds, pendingCustomLines);
        applyEffects(onConfigChange(state, previous, schedulerConfig(), Date.now()));
        tray?.refresh();
        settings.broadcast(config);
        return config;
      },
      reloadPacks: () => {
        packs = loadPacks(config.activePackIds, pendingCustomLines);
      },
    });
```

Import `onConfigChange` from the scheduler.

**A tray pause must reach an open settings window too**, or it goes stale —
that is the whole reason the renderer holds no draft. In `actions.setDnd`,
after the existing `applyEffects(...)` line, add:

```ts
    settings.broadcast(config);
```

Do the same at the end of `actions.refreshConfig`, since `Reload config file`
can change anything.

- [ ] **Step 8: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green, and `npm run build` emits `out/renderer/settings.html` and `out/preload/settings.js`. Confirm both files exist before committing.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: add the settings window shell

A second BrowserWindow with its own renderer entry and its own preload,
so the popup keeps its four-method surface and config-write powers never
reach a window the user is forbidden from closing.

Main stays the sole source of truth: every control invokes settings:patch
and re-renders from what was actually stored, and a tray pause pushes the
same settings:changed event, so an open window cannot go stale.

The panes are placeholders."
```

---

### Task 10: Schedule, Hydration and General panes

**Files:**
- Create: `src/renderer/panes/Schedule.tsx`, `src/renderer/panes/Hydration.tsx`, `src/renderer/panes/General.tsx`
- Modify: `src/renderer/Settings.tsx`

**Interfaces:**
- Consumes: `patch(partial: Partial<Config>): Promise<void>` and `config: Config`, passed as props.
- Produces: three default-exported components taking `{ config: Config; patch: (p: Partial<Config>) => Promise<void> }`.

- [ ] **Step 1: Build the Schedule pane**

`src/renderer/panes/Schedule.tsx`. Controls:

- **Interval**: number input, 1–600 minutes, patches `schedule.intervalMinutes` (send the whole `schedule` object, since `patch` is shallow).
- **Always on**: checkbox. Checked writes `workStartMinute: 0, workEndMinute: 1440`. Unchecked restores 9×60 / 18×60. Derive `checked` as `workStartMinute === 0 && workEndMinute === 1440`.
- **Start / End**: two `<input type="time">`, disabled while Always on is checked. Convert with `minutes = hh * 60 + mm`, and render `1440` as `24:00` by clamping to `23:59` in the input while keeping 1440 in the config — display a separate note rather than round-tripping the value.
- **Overnight note**: when `workEndMinute <= workStartMinute`, render `Overnight — runs to <end> the next morning.` so the wrap is visible rather than looking like a mistake.
- **Days**: seven toggle buttons, `aria-pressed`, patching `schedule.workDays`. Refuse to clear the last one: with no work days the app never fires again.
- **Default snooze**: number input, 1–240, patching `defaultSnoozeMinutes`.

Every control writes on `change` (or `blur` for the number inputs) — there is no Save button.

The always-on and overnight handling is the fiddly part, so here it is in full;
the other panes follow this same shape:

```tsx
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
```

Note the `defaultValue` + `onBlur` pairing on the number inputs and
`value` + `onChange` on the rest: a controlled number input that patches on
every keystroke fights the user mid-type, because `normalizeConfig` clamps
each intermediate value.

- [ ] **Step 2: Build the Hydration pane**

`src/renderer/panes/Hydration.tsx`: daily goal in ml (250–10000, shown as litres beside the field) and glass size in ml (50–2000). Below them, a read-only line: `That is <n> glasses a day.` computed as `Math.ceil(goalMl / glassMl)`.

- [ ] **Step 3: Build the General pane**

`src/renderer/panes/General.tsx`: an autostart checkbox patching `autostart`, and a **Reset to defaults** button. The reset confirms first with `window.confirm`, then patches every field of `DEFAULT_CONFIG` except `nextDueAt` and `dndUntil`, which are live state rather than preferences.

- [ ] **Step 4: Wire them into `Settings.tsx`**

Replace the placeholder `<main>` body with a switch on `pane` rendering each component, passing `config` and `patch`. Remove the two `hidden` elements.

- [ ] **Step 5: Verify**

Run: `npm test && npm run typecheck && npm run build`
Expected: all green.

- [ ] **Step 6: Manual check**

Run: `npm run dev`. Open the tray menu → **Settings…**. Confirm: the window opens; changing the interval moves the tray countdown within a second; ticking **Always on** makes the start and end inputs go disabled; setting an overnight window shows the overnight note; and un-ticking every day is refused.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add the schedule, hydration and general panes

The schedule is editable for the first time. Always on writes 0 and 1440
rather than a sentinel, so isWithinWorkHours needs no special case, and
an overnight window is labelled as one instead of looking like a typo.

Clearing the last work day is refused: an empty workDays means the app
never fires again, which is the silent-stop shape v0.1.4 was about."
```

---

### Task 11: Escalation pane

**Files:**
- Create: `src/renderer/panes/Escalation.tsx`
- Modify: `src/renderer/Settings.tsx`

**Interfaces:**
- Consumes: `PRESET_LADDERS` and `PresetName` from core; `config`, `patch` as props.

- [ ] **Step 1: Build the pane**

Four preset cards — Gentle, Nudge, Standard, Relentless — each showing its ladder as absolute times (`0m → 3m → 8m`), selected when `config.preset` matches. Clicking one patches `{ preset, ladder: PRESET_LADDERS[preset] }`.

Below them, one row per stage of the current ladder: the mode as a read-only label, a number input for `delayMinutes` (disabled and fixed at 0 for the first stage, minimum 1 for the rest), and a sound checkbox. Editing any of these patches `{ preset: 'custom', ladder: nextLadder }`.

Add a note under the stage list: `Adding, removing or reordering stages is done by editing config.json.`

Finally, a corner-position control: four radio buttons patching `cornerPosition`.

- [ ] **Step 2: Wire it in and verify**

Add the case to `Settings.tsx`. Run: `npm test && npm run typecheck && npm run build`

- [ ] **Step 3: Manual check**

Run: `npm run dev`. Wait for a reminder (or shorten the interval to 1 minute first). While the corner card is showing, switch the preset to Relentless and confirm the popup escalates from its current stage rather than restarting at the corner.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add the escalation pane

Four preset cards plus editable per-stage delays; touching a delay flips
the preset to custom. Adding, removing and reordering stages stays in
config.json — that is the most expensive control in the window and the
delays are the knob that actually gets turned."
```

---

### Task 12: Packs pane

**Files:**
- Create: `src/renderer/panes/Packs.tsx`
- Modify: `src/renderer/Settings.tsx`

**Interfaces:**
- Consumes: `window.waterSettings.readPack / writePack / revertPack / revealPacks`, `PackSummary`, `PackWriteResult`.

- [ ] **Step 1: Build the pane**

A list of `PackSummary` rows. Each row shows the name, `n lines`, an active checkbox patching `activePackIds`, and an **Edit** button. A row whose summary has an `error` renders it verbatim in place of the line count, styled as an error:

```
sarcastic.json — Unexpected token } in JSON at position 412
```

A customised row shows a *Customised* marker and a **Revert to shipped** button that confirms, then calls `revertPack`.

**Edit** loads `readPack(id)` into a `<textarea>` with a monospace font. Above it, a short legend:

```
One line per row. [0] or [0,1] tags which escalation stages a line suits.
Untagged lines can appear at any stage.
```

**Save** calls `writePack(id, text)`. On `{ ok: false }`, render each error as `Line 12: duplicate line` (omitting the prefix when the issue has no line) and leave the textarea untouched. On `{ ok: true }`, replace the summaries from the result and close the editor. This is the one place with an explicit Save, because a half-typed pack is not a meaningful state to apply live.

A **Reveal packs folder** button calls `revealPacks()`.

- [ ] **Step 2: Wire it in and verify**

Run: `npm test && npm run typecheck && npm run build`

- [ ] **Step 3: Manual check**

Run: `npm run dev`, open Settings → Packs. Edit the sarcastic pack, add a duplicate of an existing line, press Save, and confirm the error names the right line number and nothing was written. Fix it, save, and confirm a `sarcastic.json` appears in the packs folder via **Reveal packs folder**. Then hand-corrupt that file, restart, and confirm the pane shows the parse error rather than the pack silently vanishing.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add the packs pane

Editing a shipped pack copies it to the user packs directory first, so a
pack is either yours or the app's, with no merge semantics. Revert
deletes the user file.

Parse and validation errors are shown against their line numbers and
block the write, so the file on disk is never left malformed. A pack
that fails to load is a visible row instead of a personality that
silently disappears behind the generic fallback line."
```

---

### Task 13: Tray tooltip shows hydration progress

Spec §12 of the original design asks for `1.2 / 4.0 L`. Progress currently appears nowhere in the tray, so `Drink now` gives no feedback at all.

**Files:**
- Modify: `src/core/labels.ts`
- Modify: `tests/core/labels.test.ts`
- Modify: `src/main/tray.ts`

**Interfaces:**
- Produces: `progressLabel(ml: number, goalMl: number): string`.

- [ ] **Step 1: Write the failing test**

Add `progressLabel` to the existing import from `src/core/labels.js` at the
top of `tests/core/labels.test.ts`, then append:

```ts
describe('progressLabel', () => {
  it('reads as litres to one decimal place', () => {
    expect(progressLabel(1200, 4000)).toBe('1.2 / 4.0 L');
  });

  it('shows zero rather than an empty string', () => {
    expect(progressLabel(0, 4000)).toBe('0.0 / 4.0 L');
  });

  it('does not stop at the goal', () => {
    expect(progressLabel(4500, 4000)).toBe('4.5 / 4.0 L');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/core/labels.test.ts`
Expected: FAIL — `progressLabel is not a function`.

- [ ] **Step 3: Implement**

Append to `src/core/labels.ts`:

```ts
/** Hydration progress for the tray tooltip, e.g. "1.2 / 4.0 L". */
export function progressLabel(ml: number, goalMl: number): string {
  const litres = (value: number): string => (value / 1000).toFixed(1);
  return `${litres(ml)} / ${litres(goalMl)} L`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/core/labels.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it in the tray**

`TrayDeps` gains `mlToday(): number`. In `refresh`:

```ts
    tray.setToolTip(
      `Water Reminder — ${progressLabel(deps.mlToday(), config.goalMl)} · ${label(deps)}`,
    );
```

In `src/main/index.ts`, supply it:

```ts
      mlToday: () => mlOnDay(readEvents(), startOfLocalDay(Date.now())),
```

- [ ] **Step 6: Verify**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: show hydration progress in the tray tooltip

Progress appeared nowhere in the tray, so Drink now gave no feedback at
all. Original spec section 12 asked for this."
```

---

### Task 14: The correctness trio

Three deferred Phase 1 findings, one of which closes a potential hang in a background process.

**Files:**
- Modify: `src/core/stats.ts`
- Modify: `tests/core/stats.test.ts`
- Create: `tests/core/dst.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `tests/core/stats.test.ts`:

```ts
describe('hardening', () => {
  it('ignores a non-numeric ml rather than concatenating it', () => {
    const day = startOfLocalDay(new Date(2026, 7, 24, 12, 0).getTime());
    const events = [
      { ts: day + 1000, type: 'drank' as const, ml: 250 },
      { ts: day + 2000, type: 'drank' as const, ml: '250' as unknown as number },
    ];
    expect(mlOnDay(events, day)).toBe(250);
  });

  it('returns no streak for a non-positive goal', () => {
    const now = new Date(2026, 7, 24, 12, 0).getTime();
    expect(currentStreak([], 0, now)).toBe(0);
    expect(currentStreak([], -1, now)).toBe(0);
  });
});
```

`tests/core/dst.test.ts` — the dev machine's timezone (Asia/Kolkata) has no DST, so the zone must be set before Node caches it:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { addLocalDays, startOfLocalDay } from '../../src/core/stats.js';

const originalTZ = process.env.TZ;

describe('addLocalDays across a DST transition', () => {
  beforeAll(() => {
    // US Eastern springs forward on 2026-03-08 and falls back on 2026-11-01.
    process.env.TZ = 'America/New_York';
  });
  afterAll(() => {
    process.env.TZ = originalTZ;
  });

  it('lands on local midnight across the spring-forward boundary', () => {
    const before = new Date(2026, 2, 7, 12, 0).getTime();
    const next = addLocalDays(before, 1);
    expect(new Date(next).getHours()).toBe(0);
    expect(new Date(next).getDate()).toBe(8);
  });

  it('lands on local midnight across the fall-back boundary', () => {
    const before = new Date(2026, 9, 31, 12, 0).getTime();
    const next = addLocalDays(before, 1);
    expect(new Date(next).getHours()).toBe(0);
    expect(new Date(next).getDate()).toBe(1);
  });

  it('is its own inverse across a transition', () => {
    const day = startOfLocalDay(new Date(2026, 2, 8, 12, 0).getTime());
    expect(addLocalDays(addLocalDays(day, 1), -1)).toBe(day);
  });
});
```

If `process.env.TZ` proves not to take effect because Node has already cached the zone, add `pool: 'forks'` and `isolate: true` to `vitest.config.ts`, or move the file to its own `environmentMatchGlobs` entry. Confirm the tests genuinely exercise a DST boundary by asserting the day length: `expect(addLocalDays(before, 1) - startOfLocalDay(before)).toBe(23 * 60 * 60 * 1000)` for spring forward.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test`
Expected: the `ml` test fails with `'250250'`-style concatenation, and the streak test either fails or hangs. **If it hangs, that is the bug** — stop the run and proceed.

- [ ] **Step 3: Implement**

In `src/core/stats.ts`:

```ts
export function mlOnDay(events: LogEvent[], dayStart: number): number {
  return eventsOnDay(events, dayStart)
    .filter((e) => e.type === 'drank')
    // Type-checked, not just defaulted: a hand-edited "ml": "250" would
    // otherwise concatenate into the total.
    .reduce((sum, e) => sum + (typeof e.ml === 'number' && Number.isFinite(e.ml) ? e.ml : 0), 0);
}
```

and at the top of `currentStreak`:

```ts
  // Without this a non-positive goal makes every day count as met, and the
  // loop walks backwards until dates stop being representable — a hang in a
  // process the user cannot see.
  if (goalMl <= 0) return 0;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run typecheck`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "fix: harden the stats helpers

mlOnDay type-checks ml, so a hand-edited string cannot concatenate into
the daily total. currentStreak returns 0 for a non-positive goal rather
than counting every day as met and walking backwards until dates stop
being representable — a hang in a process with no visible window.

Adds the DST test for addLocalDays that the original spec section 14
committed to; it needs TZ set before Node caches the zone, which is why
it was never written."
```

---

### Task 15: The three missing packs

**Files:**
- Create: `packs/drill-sergeant.json`, `packs/wholesome.json`, `packs/deadpan.json`
- Create: `tests/packs/shipped.test.ts`

**Interfaces:**
- Consumes: `validatePackLines` (Task 8), `eligibleLines` from `src/core/messages.js`.

- [ ] **Step 1: Write the failing test**

`tests/packs/shipped.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import deadpan from '../../packs/deadpan.json' with { type: 'json' };
import drill from '../../packs/drill-sergeant.json' with { type: 'json' };
import wholesome from '../../packs/wholesome.json' with { type: 'json' };
import { eligibleLines } from '../../src/core/messages.js';
import { validatePackLines } from '../../src/core/packvalidate.js';
import type { Pack } from '../../src/shared/types.js';

const packs: Pack[] = [drill as Pack, wholesome as Pack, deadpan as Pack];

describe.each(packs)('$id pack', (pack) => {
  it('has an id matching its filename convention', () => {
    expect(pack.id).toMatch(/^[a-z-]+$/);
  });

  it('ships at least 20 lines', () => {
    expect(pack.lines.length).toBeGreaterThanOrEqual(20);
  });

  it('satisfies every pack content rule', () => {
    expect(validatePackLines(pack.lines)).toEqual([]);
  });

  it('offers lines at every stage of a three-stage ladder', () => {
    for (const stage of [0, 1, 2]) {
      expect(eligibleLines([pack], stage, 3).length).toBeGreaterThan(2);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/packs/shipped.test.ts`
Expected: FAIL — the three JSON files do not exist.

- [ ] **Step 3: Write the packs**

Each file follows the shipped schema exactly:

```json
{
  "id": "deadpan",
  "name": "Deadpan",
  "lines": [
    { "text": "Water. It is time for some." },
    { "text": "{{glasses}} {{glassWord}} today.", "stage": [0] },
    { "text": "This message will not go away.", "stage": [2] }
  ]
}
```

Register: **Drill Sergeant** is imperative and clipped (`ON YOUR FEET. HYDRATE.`). **Wholesome** is warm and encouraging (`You are doing great. A glass of water would make it better.`). **Deadpan** is flat and literal, deriving humour from stating the obvious without affect. Each needs at least 20 lines, at least three tagged for each of stages 0, 1 and 2, and no line may name a window mode — the ladder is user-configurable, so a line saying "this is your fullscreen warning" will be wrong for most users. Use `{{glassWord}}` after any `{{glasses}}`.

Match the register of the existing `packs/sarcastic.json` for craft, not for tone.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: all green. **Run this after every pack edit** — malformed pack JSON is caught here and nowhere else at build time.

- [ ] **Step 5: Make the packs selectable**

The Packs pane already lists everything `listPackIds()` finds, so no code change is needed. Confirm by running `npm run dev` and checking that all four packs appear with working active checkboxes.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add the drill sergeant, wholesome and deadpan packs

The three packs the original spec names but which were never written.
Each covers all three stages of a standard ladder and none names a
window mode, since the ladder is user-configurable."
```

---

### Task 16: Documentation

**Files:**
- Modify: `docs/status-and-backlog.md`
- Modify: `docs/manual-verification.md`
- Modify: `docs/superpowers/specs/2026-08-24-water-reminder-design.md`

- [ ] **Step 1: Fix the spec gaps the Phase 1 review exposed**

`docs/status-and-backlog.md` lists three places the **original** spec was underspecified and produced real bugs. Fix them in `2026-08-24-water-reminder-design.md` so the next plan argues from something correct:

- §9: say that stage folding is bidirectional — a tag above the ladder length folds down, and a stage with no tagged lines falls back to the closest tagged stage below it.
- §8: acknowledge that a ladder may be longer than any shipped pack tags for.
- §8: change the fullscreen row from "fills the display" to state that it fills the display bounds, not the work area, so the menu bar is covered during the takeover stage.

Also update §11 to describe config v2, and §15 to reflect the 3a/3b split.

- [ ] **Step 2: Update the backlog**

In `docs/status-and-backlog.md`: move the four items this plan fixed out of *Deferred findings* into the *Fixed* section with their version, and delete the `Editing packs` section's claim that packs live only in the repo — add the user packs directory and the *Reveal packs folder* button.

- [ ] **Step 3: Add the new manual checks**

In `docs/manual-verification.md`, add a macOS section for the settings window:

- Settings opens and comes to the front from the tray menu, with the dock hidden
- Settings opened while a reminder is showing stays behind the popup, and becomes reachable once the reminder is answered
- **Reveal packs folder** opens Finder at `~/Library/Application Support/water-reminder/packs/`
- An overnight window still fires after midnight

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: record Phase 3a and fix the spec gaps it exposed

The original spec's section 8 and 9 were underspecified in three places
that produced real bugs during Phase 1. Fixed so the next plan argues
from something correct."
```

---

## Definition of done

- [ ] `npm test` passes, with tests covering every bullet in spec §8
- [ ] `npm run typecheck` passes
- [ ] `npm run build` emits both renderer entries and both preloads
- [ ] Every pane edits its settings and the change is visible without restarting
- [ ] A malformed pack file produces a visible error rather than a silent fallback
- [ ] An overnight schedule fires after midnight
- [ ] `config.json` is at `version: 2` and no longer contains `customLines`
- [ ] Quitting and relaunching does not postpone the next reminder
- [ ] The manual macOS checks in `docs/manual-verification.md` are run on the Mac against a fresh `.dmg`
