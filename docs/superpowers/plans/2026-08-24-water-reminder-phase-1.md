# Water Reminder Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working tray-resident water reminder that fires on a schedule, escalates through a user-configurable ladder of popup sizes, and can only be cleared by Drink, Snooze, or Skip — verified end-to-end on Windows.

**Architecture:** All decision logic (scheduling, escalation, message selection, config normalization, stats, window geometry) lives in `src/core/` as pure TypeScript with zero Electron imports, unit-tested with Vitest on Windows. `src/main/` is a thin Electron shell that owns windows, tray, and disk I/O and simply applies the effects the core returns. The renderer is a single React popup that receives a payload and emits three actions.

**Tech Stack:** Electron 33, electron-vite 2, React 18, TypeScript 5.6 (strict), Vitest 2, electron-store 8, electron-builder 25.

**Spec:** `docs/superpowers/specs/2026-08-24-water-reminder-design.md`

## Global Constraints

- Node 20+ required. Electron `^33.0.0`.
- TypeScript `strict: true`. No `any` in exported signatures.
- **Nothing in `src/core/` may import `electron`** — it must run under plain Node so tests work on the Windows dev machine. This is the constraint that makes a macOS-targeted app testable from Windows.
- Renderer security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. All main↔renderer traffic goes through the preload bridge.
- `electron-store` pinned to `^8.2.0` (CommonJS; v9+ is ESM-only and breaks the electron-vite main bundle).
- Ladder invariants, enforced in `validateLadder`: at least one stage; `ladder[0].delayMinutes === 0`; every later stage `delayMinutes > 0`; every `mode` one of `corner | center | fullscreen`.
- `delayMinutes` is **relative to the previous stage**. Standard preset `corner(0) → center(3) → fullscreen(5)` therefore fires at absolute 0m / 3m / 8m.
- The sarcastic pack ships **60 lines minimum**. It is the default active pack.
- The final ladder stage persists indefinitely — the popup never self-dismisses at any preset.
- Commit after every task. Conventional Commits. **No AI attribution or `Co-Authored-By` trailers in any commit message.**

---

### Task 1: Scaffold, shared types, and the escalation ladder

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.node.json`, `vitest.config.ts`, `electron.vite.config.ts`, `.gitignore`
- Create: `src/shared/types.ts`
- Create: `src/core/ladder.ts`
- Test: `tests/core/ladder.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: every type in `src/shared/types.ts` (`WindowMode`, `Stage`, `Ladder`, `PresetName`, `CornerPosition`, `Schedule`, `Config`, `LogEventType`, `LogEvent`, `PackLine`, `Pack`, `PopupPayload`); `PRESET_LADDERS: Record<Exclude<PresetName, 'custom'>, Ladder>`; `validateLadder(ladder: Ladder): string[]` returning an array of human-readable errors, empty when valid.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "water-reminder",
  "version": "0.1.0",
  "description": "A water reminder that will not let you ignore it.",
  "main": "out/main/index.js",
  "private": true,
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "start": "electron-vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.node.json",
    "dist:win": "electron-vite build && electron-builder --win",
    "dist:mac": "electron-vite build && electron-builder --mac"
  },
  "dependencies": {
    "electron-store": "^8.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "electron": "^33.0.0",
    "electron-builder": "^25.1.0",
    "electron-vite": "^2.3.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create the TypeScript and build config**

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitOverride": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*"]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "noEmit": true
  },
  "include": ["electron.vite.config.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

`electron.vite.config.ts`:

```ts
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/main/index.ts') } },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { input: resolve(__dirname, 'src/preload/index.ts') } },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    build: {
      rollupOptions: { input: resolve(__dirname, 'src/renderer/popup.html') },
    },
  },
});
```

`.gitignore`:

```
node_modules/
out/
dist/
*.log
.DS_Store
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: completes without errors; `node_modules/` and `package-lock.json` created.

- [ ] **Step 4: Create `src/shared/types.ts`**

```ts
export type WindowMode = 'corner' | 'center' | 'fullscreen';

export interface Stage {
  mode: WindowMode;
  /** Minutes after the previous stage. The first stage is always 0. */
  delayMinutes: number;
  /** Play the configured sound when this stage is entered. */
  sound?: boolean;
}

export type Ladder = Stage[];

export type PresetName = 'gentle' | 'nudge' | 'standard' | 'relentless' | 'custom';

export type CornerPosition = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface Schedule {
  intervalMinutes: number;
  /** Minutes from local midnight, e.g. 9 * 60 for 09:00. */
  workStartMinute: number;
  workEndMinute: number;
  /** Day indices, 0 = Sunday .. 6 = Saturday. */
  workDays: number[];
}

export interface Config {
  version: number;
  schedule: Schedule;
  preset: PresetName;
  ladder: Ladder;
  defaultSnoozeMinutes: number;
  goalMl: number;
  glassMl: number;
  cornerPosition: CornerPosition;
  activePackIds: string[];
  customLines: string[];
  autostart: boolean;
  soundEnabled: boolean;
  /** Epoch ms until which reminders are paused, or null. */
  dndUntil: number | null;
}

export type LogEventType = 'drank' | 'skip' | 'snooze';

export interface LogEvent {
  ts: number;
  type: LogEventType;
  ml?: number;
  minutes?: number;
}

export interface PackLine {
  text: string;
  /** Ladder stage indices this line suits. Absent means every stage. */
  stage?: number[];
}

export interface Pack {
  id: string;
  name: string;
  lines: PackLine[];
}

/** Everything the popup renderer needs to draw itself. */
export interface PopupPayload {
  line: string;
  stageIndex: number;
  mode: WindowMode;
  glasses: number;
  goalPct: number;
  defaultSnoozeMinutes: number;
}
```

- [ ] **Step 5: Write the failing test**

`tests/core/ladder.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PRESET_LADDERS, validateLadder } from '../../src/core/ladder.js';
import type { Ladder } from '../../src/shared/types.js';

describe('PRESET_LADDERS', () => {
  it('gentle is a single corner stage', () => {
    expect(PRESET_LADDERS.gentle).toEqual([{ mode: 'corner', delayMinutes: 0 }]);
  });

  it('standard escalates corner -> center -> fullscreen at 0/3/8 minutes', () => {
    expect(PRESET_LADDERS.standard).toEqual([
      { mode: 'corner', delayMinutes: 0 },
      { mode: 'center', delayMinutes: 3 },
      { mode: 'fullscreen', delayMinutes: 5 },
    ]);
  });

  it('relentless sounds on its final stage', () => {
    const last = PRESET_LADDERS.relentless[PRESET_LADDERS.relentless.length - 1];
    expect(last.sound).toBe(true);
  });

  it('every preset is valid', () => {
    for (const ladder of Object.values(PRESET_LADDERS)) {
      expect(validateLadder(ladder)).toEqual([]);
    }
  });
});

describe('validateLadder', () => {
  it('rejects an empty ladder', () => {
    expect(validateLadder([])).toContain('ladder must have at least one stage');
  });

  it('rejects a first stage with a non-zero delay', () => {
    const ladder: Ladder = [{ mode: 'corner', delayMinutes: 2 }];
    expect(validateLadder(ladder)).toContain('first stage must have delayMinutes 0');
  });

  it('rejects a later stage with a non-positive delay', () => {
    const ladder: Ladder = [
      { mode: 'corner', delayMinutes: 0 },
      { mode: 'center', delayMinutes: 0 },
    ];
    expect(validateLadder(ladder)).toContain('stage 2 must have delayMinutes greater than 0');
  });

  it('rejects an unknown window mode', () => {
    const ladder = [{ mode: 'gigantic', delayMinutes: 0 }] as unknown as Ladder;
    expect(validateLadder(ladder)).toContain('stage 1 has an unknown mode: gigantic');
  });

  it('rejects a non-object stage without throwing', () => {
    // A hand-edited config can contain anything; validation must survive it.
    expect(validateLadder([null])).toContain('stage 1 is not an object');
    expect(validateLadder(['corner'])).toContain('stage 1 is not an object');
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — cannot resolve `../../src/core/ladder.js`.

- [ ] **Step 7: Create `src/core/ladder.ts`**

```ts
import type { Ladder, PresetName, Stage, WindowMode } from '../shared/types.js';

const MODES: WindowMode[] = ['corner', 'center', 'fullscreen'];

export const PRESET_LADDERS: Record<Exclude<PresetName, 'custom'>, Ladder> = {
  gentle: [{ mode: 'corner', delayMinutes: 0 }],
  nudge: [
    { mode: 'corner', delayMinutes: 0 },
    { mode: 'center', delayMinutes: 5 },
  ],
  standard: [
    { mode: 'corner', delayMinutes: 0 },
    { mode: 'center', delayMinutes: 3 },
    { mode: 'fullscreen', delayMinutes: 5 },
  ],
  relentless: [
    { mode: 'corner', delayMinutes: 0 },
    { mode: 'center', delayMinutes: 2 },
    { mode: 'fullscreen', delayMinutes: 3, sound: true },
  ],
};

/**
 * Takes `unknown` rather than `Ladder`: the ladder it validates often comes
 * straight from a hand-edited config file, so it must survive arbitrary JSON
 * without throwing.
 */
export function validateLadder(ladder: unknown): string[] {
  const errors: string[] = [];

  if (!Array.isArray(ladder) || ladder.length === 0) {
    errors.push('ladder must have at least one stage');
    return errors;
  }

  ladder.forEach((element: unknown, i) => {
    if (typeof element !== 'object' || element === null) {
      errors.push(`stage ${i + 1} is not an object`);
      return;
    }

    const { mode, delayMinutes } = element as Partial<Stage>;

    if (!MODES.includes(mode as WindowMode)) {
      errors.push(`stage ${i + 1} has an unknown mode: ${String(mode)}`);
    }
    if (typeof delayMinutes !== 'number' || Number.isNaN(delayMinutes)) {
      errors.push(`stage ${i + 1} has a non-numeric delayMinutes`);
      return;
    }
    if (i === 0 && delayMinutes !== 0) {
      errors.push('first stage must have delayMinutes 0');
    }
    if (i > 0 && delayMinutes <= 0) {
      errors.push(`stage ${i + 1} must have delayMinutes greater than 0`);
    }
  });

  return errors;
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 9 tests.

- [ ] **Step 9: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json tsconfig.node.json vitest.config.ts electron.vite.config.ts .gitignore src/shared/types.ts src/core/ladder.ts tests/core/ladder.test.ts
git commit -m "feat: scaffold project with shared types and escalation ladder presets"
```

---

### Task 2: Scheduler state machine

**Files:**
- Create: `src/core/scheduler.ts`
- Test: `tests/core/scheduler.test.ts`

**Interfaces:**
- Consumes: `Ladder`, `WindowMode` from `src/shared/types.ts`; `PRESET_LADDERS` from `src/core/ladder.ts` (tests only).
- Produces:
  - `interface SchedulerConfig { intervalMinutes: number; ladder: Ladder; workStartMinute: number; workEndMinute: number; workDays: number[] }`
  - `type SchedulerPhase = 'idle' | 'due' | 'snoozed' | 'paused'`
  - `interface SchedulerState { phase: SchedulerPhase; nextDueAt: number; dueSince: number | null; stageIndex: number; pausedUntil: number | null }`
  - `type Effect = { type: 'show'; stageIndex: number; mode: WindowMode; sound: boolean } | { type: 'hide' }`
  - `interface Transition { state: SchedulerState; effects: Effect[] }`
  - `createInitialState(now: number, cfg: SchedulerConfig): SchedulerState`
  - `tick(state: SchedulerState, now: number, cfg: SchedulerConfig): Transition`
  - `onDrank(state, now, cfg): Transition`, `onSkip(state, now, cfg): Transition`
  - `onSnooze(state, now, minutes: number, cfg): Transition`
  - `setDnd(state, until: number | null, now, cfg): Transition`
  - `stageOffsets(ladder: Ladder): number[]` — cumulative ms offsets from due time
  - `isWithinWorkHours(now: number, cfg: SchedulerConfig): boolean`

- [ ] **Step 1: Write the failing test**

`tests/core/scheduler.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PRESET_LADDERS } from '../../src/core/ladder.js';
import {
  createInitialState,
  isWithinWorkHours,
  onDrank,
  onSkip,
  onSnooze,
  setDnd,
  stageOffsets,
  tick,
  type SchedulerConfig,
  type SchedulerState,
} from '../../src/core/scheduler.js';

const MIN = 60_000;

/** Monday 2026-08-24 10:00 local time — inside the default work window. */
const MONDAY_10AM = new Date(2026, 7, 24, 10, 0, 0, 0).getTime();

const cfg: SchedulerConfig = {
  intervalMinutes: 45,
  ladder: PRESET_LADDERS.standard,
  workStartMinute: 9 * 60,
  workEndMinute: 18 * 60,
  workDays: [1, 2, 3, 4, 5],
};

/** Run tick repeatedly, collecting every effect, to simulate the 1s main loop. */
function run(state: SchedulerState, times: number[], c: SchedulerConfig = cfg) {
  let s = state;
  const effects = [];
  for (const t of times) {
    const out = tick(s, t, c);
    s = out.state;
    effects.push(...out.effects);
  }
  return { state: s, effects };
}

describe('stageOffsets', () => {
  it('accumulates relative delays into absolute offsets', () => {
    expect(stageOffsets(PRESET_LADDERS.standard)).toEqual([0, 3 * MIN, 8 * MIN]);
  });
});

describe('isWithinWorkHours', () => {
  it('is true inside the window on a work day', () => {
    expect(isWithinWorkHours(MONDAY_10AM, cfg)).toBe(true);
  });

  it('is false before the window opens', () => {
    const early = new Date(2026, 7, 24, 8, 30).getTime();
    expect(isWithinWorkHours(early, cfg)).toBe(false);
  });

  it('is false on a non-work day', () => {
    const sunday = new Date(2026, 7, 23, 10, 0).getTime();
    expect(isWithinWorkHours(sunday, cfg)).toBe(false);
  });
});

describe('firing', () => {
  it('does not fire before the interval elapses', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const { effects } = run(s, [MONDAY_10AM + 44 * MIN]);
    expect(effects).toEqual([]);
  });

  it('fires the first stage when the interval elapses', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const out = run(s, [MONDAY_10AM + 45 * MIN]);
    expect(out.effects).toEqual([
      { type: 'show', stageIndex: 0, mode: 'corner', sound: false },
    ]);
    expect(out.state.phase).toBe('due');
  });

  it('does not re-show the same stage on later ticks', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const due = MONDAY_10AM + 45 * MIN;
    const out = run(s, [due, due + 1000, due + 2000]);
    expect(out.effects).toHaveLength(1);
  });
});

describe('escalation', () => {
  it('climbs to center at 3m and fullscreen at 8m after coming due', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const due = MONDAY_10AM + 45 * MIN;
    const out = run(s, [due, due + 3 * MIN, due + 8 * MIN]);
    expect(out.effects).toEqual([
      { type: 'show', stageIndex: 0, mode: 'corner', sound: false },
      { type: 'show', stageIndex: 1, mode: 'center', sound: false },
      { type: 'show', stageIndex: 2, mode: 'fullscreen', sound: false },
    ]);
  });

  it('holds the final stage indefinitely without new effects', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const due = MONDAY_10AM + 45 * MIN;
    // Ticks every stage boundary, as the 1s production loop does, then waits.
    const out = run(s, [due, due + 3 * MIN, due + 8 * MIN, due + 90 * MIN]);
    expect(out.effects).toHaveLength(3);
    expect(out.state.stageIndex).toBe(2);
    expect(out.state.phase).toBe('due');
  });

  it('skips intermediate stages when ticks are sparse', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const due = MONDAY_10AM + 45 * MIN;
    const out = run(s, [due, due + 20 * MIN]);
    expect(out.effects[1]).toEqual({
      type: 'show', stageIndex: 2, mode: 'fullscreen', sound: false,
    });
  });

  it('never escalates on a single-stage gentle ladder but stays due', () => {
    const gentle = { ...cfg, ladder: PRESET_LADDERS.gentle };
    const s = createInitialState(MONDAY_10AM, gentle);
    const due = MONDAY_10AM + 45 * MIN;
    const out = run(s, [due, due + 60 * MIN], gentle);
    expect(out.effects).toHaveLength(1);
    expect(out.state.phase).toBe('due');
  });

  it('reports sound on a stage configured for it', () => {
    const loud = { ...cfg, ladder: PRESET_LADDERS.relentless };
    const s = createInitialState(MONDAY_10AM, loud);
    const due = MONDAY_10AM + 45 * MIN;
    const out = run(s, [due, due + 5 * MIN], loud);
    expect(out.effects[1]).toEqual({
      type: 'show', stageIndex: 2, mode: 'fullscreen', sound: true,
    });
  });
});

describe('actions', () => {
  it('drank hides the popup and re-arms one interval out', () => {
    const due = MONDAY_10AM + 45 * MIN;
    const { state } = run(createInitialState(MONDAY_10AM, cfg), [due]);
    const out = onDrank(state, due, cfg);
    expect(out.effects).toEqual([{ type: 'hide' }]);
    expect(out.state.phase).toBe('idle');
    expect(out.state.nextDueAt).toBe(due + 45 * MIN);
  });

  it('skip behaves like drank for scheduling', () => {
    const due = MONDAY_10AM + 45 * MIN;
    const { state } = run(createInitialState(MONDAY_10AM, cfg), [due]);
    const out = onSkip(state, due, cfg);
    expect(out.state.phase).toBe('idle');
    expect(out.state.nextDueAt).toBe(due + 45 * MIN);
  });

  it('snooze hides, then re-fires at stage 0 after the delay', () => {
    const due = MONDAY_10AM + 45 * MIN;
    const first = run(createInitialState(MONDAY_10AM, cfg), [due, due + 8 * MIN]);
    const snoozed = onSnooze(first.state, due + 8 * MIN, 10, cfg);
    expect(snoozed.effects).toEqual([{ type: 'hide' }]);
    expect(snoozed.state.phase).toBe('snoozed');

    const after = run(snoozed.state, [due + 17 * MIN, due + 18 * MIN]);
    expect(after.effects).toEqual([
      { type: 'show', stageIndex: 0, mode: 'corner', sound: false },
    ]);
  });
});

describe('do not disturb', () => {
  it('pauses, suppresses firing, and re-arms after expiry', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const paused = setDnd(s, MONDAY_10AM + 60 * MIN, MONDAY_10AM, cfg);
    expect(paused.effects).toEqual([{ type: 'hide' }]);

    const during = run(paused.state, [MONDAY_10AM + 45 * MIN, MONDAY_10AM + 50 * MIN]);
    expect(during.effects).toEqual([]);

    const resumed = run(during.state, [MONDAY_10AM + 60 * MIN]);
    expect(resumed.state.phase).toBe('idle');
    expect(resumed.state.nextDueAt).toBe(MONDAY_10AM + 105 * MIN);
  });

  it('clearing DND re-arms immediately', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const paused = setDnd(s, MONDAY_10AM + 60 * MIN, MONDAY_10AM, cfg);
    const cleared = setDnd(paused.state, null, MONDAY_10AM + 10 * MIN, cfg);
    expect(cleared.state.phase).toBe('idle');
    expect(cleared.state.nextDueAt).toBe(MONDAY_10AM + 55 * MIN);
  });
});

describe('work hours and sleep', () => {
  it('holds outside work hours and fires once they resume', () => {
    const evening = new Date(2026, 7, 24, 17, 50).getTime();
    const s = createInitialState(evening, cfg);
    const afterHours = run(s, [new Date(2026, 7, 24, 18, 35).getTime()]);
    expect(afterHours.effects).toEqual([]);

    const nextMorning = run(afterHours.state, [new Date(2026, 7, 25, 9, 5).getTime()]);
    expect(nextMorning.effects).toHaveLength(1);
  });

  it('collapses four missed intervals after sleep into a single reminder', () => {
    const s = createInitialState(MONDAY_10AM, cfg);
    const wake = MONDAY_10AM + 4 * 45 * MIN;
    const out = run(s, [wake, wake + 1000]);
    expect(out.effects).toEqual([
      { type: 'show', stageIndex: 0, mode: 'corner', sound: false },
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/core/scheduler.test.ts`
Expected: FAIL — cannot resolve `../../src/core/scheduler.js`.

- [ ] **Step 3: Create `src/core/scheduler.ts`**

```ts
import type { Ladder, WindowMode } from '../shared/types.js';

const MIN = 60_000;

export interface SchedulerConfig {
  intervalMinutes: number;
  ladder: Ladder;
  workStartMinute: number;
  workEndMinute: number;
  workDays: number[];
}

export type SchedulerPhase = 'idle' | 'due' | 'snoozed' | 'paused';

export interface SchedulerState {
  phase: SchedulerPhase;
  /** Epoch ms at which the next reminder is due. Meaningful in idle and snoozed. */
  nextDueAt: number;
  /** Epoch ms at which the current due period began. Meaningful in due. */
  dueSince: number | null;
  stageIndex: number;
  pausedUntil: number | null;
}

export type Effect =
  | { type: 'show'; stageIndex: number; mode: WindowMode; sound: boolean }
  | { type: 'hide' };

export interface Transition {
  state: SchedulerState;
  effects: Effect[];
}

/** Cumulative offsets in ms from the moment the reminder came due. */
export function stageOffsets(ladder: Ladder): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const stage of ladder) {
    acc += stage.delayMinutes * MIN;
    offsets.push(acc);
  }
  return offsets;
}

export function isWithinWorkHours(now: number, cfg: SchedulerConfig): boolean {
  const d = new Date(now);
  if (!cfg.workDays.includes(d.getDay())) return false;
  const minuteOfDay = d.getHours() * 60 + d.getMinutes();
  return minuteOfDay >= cfg.workStartMinute && minuteOfDay < cfg.workEndMinute;
}

export function createInitialState(now: number, cfg: SchedulerConfig): SchedulerState {
  return {
    phase: 'idle',
    nextDueAt: now + cfg.intervalMinutes * MIN,
    dueSince: null,
    stageIndex: 0,
    pausedUntil: null,
  };
}

function showEffect(ladder: Ladder, index: number): Effect {
  const stage = ladder[index];
  return { type: 'show', stageIndex: index, mode: stage.mode, sound: stage.sound === true };
}

function becomeDue(state: SchedulerState, now: number, cfg: SchedulerConfig): Transition {
  return {
    state: { ...state, phase: 'due', dueSince: now, stageIndex: 0, pausedUntil: null },
    effects: [showEffect(cfg.ladder, 0)],
  };
}

export function tick(state: SchedulerState, now: number, cfg: SchedulerConfig): Transition {
  switch (state.phase) {
    case 'paused': {
      if (state.pausedUntil === null || now < state.pausedUntil) {
        return { state, effects: [] };
      }
      // DND expired: re-arm a full interval out. Missed intervals never queue.
      return { state: createInitialState(now, cfg), effects: [] };
    }

    case 'idle':
    case 'snoozed': {
      if (now < state.nextDueAt) return { state, effects: [] };
      if (!isWithinWorkHours(now, cfg)) return { state, effects: [] };
      return becomeDue(state, now, cfg);
    }

    case 'due': {
      const offsets = stageOffsets(cfg.ladder);
      const elapsed = now - (state.dueSince ?? now);
      let target = state.stageIndex;
      for (let i = state.stageIndex + 1; i < cfg.ladder.length; i++) {
        if (elapsed >= offsets[i]) target = i;
      }
      if (target === state.stageIndex) return { state, effects: [] };
      return {
        state: { ...state, stageIndex: target },
        effects: [showEffect(cfg.ladder, target)],
      };
    }
  }
}

/**
 * Clear the popup and re-arm a full interval from `now`. The action handlers
 * ignore their previous state by design — re-deriving from `now` is exactly
 * what stops missed intervals from queueing up.
 */
function rearm(now: number, cfg: SchedulerConfig): Transition {
  return { state: createInitialState(now, cfg), effects: [{ type: 'hide' }] };
}

export function onDrank(_state: SchedulerState, now: number, cfg: SchedulerConfig): Transition {
  return rearm(now, cfg);
}

export function onSkip(_state: SchedulerState, now: number, cfg: SchedulerConfig): Transition {
  return rearm(now, cfg);
}

export function onSnooze(
  _state: SchedulerState,
  now: number,
  minutes: number,
  _cfg: SchedulerConfig,
): Transition {
  return {
    state: {
      phase: 'snoozed',
      nextDueAt: now + minutes * MIN,
      dueSince: null,
      stageIndex: 0,
      pausedUntil: null,
    },
    effects: [{ type: 'hide' }],
  };
}

export function setDnd(
  _state: SchedulerState,
  until: number | null,
  now: number,
  cfg: SchedulerConfig,
): Transition {
  if (until === null) {
    return rearm(now, cfg);
  }
  return {
    state: {
      phase: 'paused',
      nextDueAt: now + cfg.intervalMinutes * MIN,
      dueSince: null,
      stageIndex: 0,
      pausedUntil: until,
    },
    effects: [{ type: 'hide' }],
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all ladder and scheduler tests green.

- [ ] **Step 5: Commit**

```bash
git add src/core/scheduler.ts tests/core/scheduler.test.ts
git commit -m "feat: add scheduler state machine with configurable escalation"
```

---

### Task 3: Message picker and the sarcastic pack

**Files:**
- Create: `src/core/messages.ts`
- Create: `packs/sarcastic.json`
- Test: `tests/core/messages.test.ts`
- Test: `tests/packs/sarcastic.test.ts`

**Interfaces:**
- Consumes: `Pack`, `PackLine` from `src/shared/types.ts`.
- Produces:
  - `interface PickContext { glasses: number; streak: number; goalPct: number }`
  - `renderTemplate(text: string, ctx: PickContext): string`
  - `effectiveStage(tag: number, ladderLength: number): number`
  - `eligibleLines(packs: Pack[], stageIndex: number, ladderLength: number): PackLine[]`
  - `pickLine(packs, stageIndex, ladderLength, recent: string[], ctx, rand: () => number): string`
  - `pushRecent(recent: string[], text: string, max?: number): string[]`
  - `RECENT_LIMIT = 8`

- [ ] **Step 1: Write the failing test for the picker**

`tests/core/messages.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  RECENT_LIMIT,
  effectiveStage,
  eligibleLines,
  pickLine,
  pushRecent,
  renderTemplate,
  type PickContext,
} from '../../src/core/messages.js';
import type { Pack } from '../../src/shared/types.js';

const ctx: PickContext = { glasses: 3, streak: 5, goalPct: 42 };

const pack: Pack = {
  id: 'test',
  name: 'Test',
  lines: [
    { text: 'early one', stage: [0] },
    { text: 'early two', stage: [0, 1] },
    { text: 'late one', stage: [2] },
    { text: 'anywhere' },
  ],
};

describe('renderTemplate', () => {
  it('substitutes every supported variable', () => {
    const out = renderTemplate('{{glasses}} / {{streak}} / {{goalPct}}%', ctx);
    expect(out).toBe('3 / 5 / 42%');
  });

  it('leaves unknown placeholders untouched', () => {
    expect(renderTemplate('{{nope}}', ctx)).toBe('{{nope}}');
  });
});

describe('effectiveStage', () => {
  it('passes a tag through when the ladder is long enough', () => {
    expect(effectiveStage(2, 3)).toBe(2);
  });

  it('clamps a tag beyond the ladder to the final stage', () => {
    expect(effectiveStage(2, 2)).toBe(1);
  });
});

describe('eligibleLines', () => {
  it('selects stage-tagged and untagged lines for stage 0', () => {
    const texts = eligibleLines([pack], 0, 3).map((l) => l.text);
    expect(texts).toEqual(['early one', 'early two', 'anywhere']);
  });

  it('selects only late and untagged lines for the final stage', () => {
    const texts = eligibleLines([pack], 2, 3).map((l) => l.text);
    expect(texts).toEqual(['late one', 'anywhere']);
  });

  it('folds a stage-2 line onto stage 1 of a two-stage ladder', () => {
    const texts = eligibleLines([pack], 1, 2).map((l) => l.text);
    expect(texts).toEqual(['early two', 'late one', 'anywhere']);
  });

  it('pools lines across multiple active packs', () => {
    const other: Pack = { id: 'b', name: 'B', lines: [{ text: 'from b' }] };
    const texts = eligibleLines([pack, other], 0, 3).map((l) => l.text);
    expect(texts).toContain('from b');
  });
});

describe('pickLine', () => {
  it('renders the chosen line', () => {
    const templated: Pack = { id: 't', name: 'T', lines: [{ text: '{{glasses}} glasses' }] };
    expect(pickLine([templated], 0, 1, [], ctx, () => 0)).toBe('3 glasses');
  });

  it('excludes recently used lines', () => {
    const picked = pickLine([pack], 0, 3, ['early one', 'early two'], ctx, () => 0);
    expect(picked).toBe('anywhere');
  });

  it('ignores the recent list when it would exclude everything', () => {
    const recent = ['early one', 'early two', 'anywhere'];
    const picked = pickLine([pack], 0, 3, recent, ctx, () => 0);
    expect(picked).toBe('early one');
  });

  it('returns a fallback when no line is eligible', () => {
    const empty: Pack = { id: 'e', name: 'E', lines: [] };
    expect(pickLine([empty], 0, 1, [], ctx, () => 0)).toBe('Time to drink water.');
  });
});

describe('pushRecent', () => {
  it('keeps only the most recent entries', () => {
    let recent: string[] = [];
    for (let i = 0; i < RECENT_LIMIT + 3; i++) recent = pushRecent(recent, `line ${i}`);
    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(recent[0]).toBe('line 3');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/core/messages.test.ts`
Expected: FAIL — cannot resolve `../../src/core/messages.js`.

- [ ] **Step 3: Create `src/core/messages.ts`**

```ts
import type { Pack, PackLine } from '../shared/types.js';

export const RECENT_LIMIT = 8;

const FALLBACK_LINE = 'Time to drink water.';

export interface PickContext {
  glasses: number;
  streak: number;
  goalPct: number;
}

export function renderTemplate(text: string, ctx: PickContext): string {
  return text
    .replaceAll('{{glasses}}', String(ctx.glasses))
    .replaceAll('{{streak}}', String(ctx.streak))
    .replaceAll('{{goalPct}}', String(ctx.goalPct));
}

/**
 * Stage tags are indices into the user's ladder. A tag beyond the ladder's
 * length folds onto the final stage, so tone still escalates on short ladders.
 */
export function effectiveStage(tag: number, ladderLength: number): number {
  const last = Math.max(0, ladderLength - 1);
  return Math.min(tag, last);
}

export function eligibleLines(
  packs: Pack[],
  stageIndex: number,
  ladderLength: number,
): PackLine[] {
  const out: PackLine[] = [];
  for (const pack of packs) {
    for (const line of pack.lines) {
      if (line.stage === undefined) {
        out.push(line);
        continue;
      }
      if (line.stage.some((tag) => effectiveStage(tag, ladderLength) === stageIndex)) {
        out.push(line);
      }
    }
  }
  return out;
}

export function pickLine(
  packs: Pack[],
  stageIndex: number,
  ladderLength: number,
  recent: string[],
  ctx: PickContext,
  rand: () => number = Math.random,
): string {
  const eligible = eligibleLines(packs, stageIndex, ladderLength);
  if (eligible.length === 0) return FALLBACK_LINE;

  const fresh = eligible.filter((line) => !recent.includes(line.text));
  const pool = fresh.length > 0 ? fresh : eligible;
  const chosen = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
  return renderTemplate(chosen.text, ctx);
}

export function pushRecent(recent: string[], text: string, max = RECENT_LIMIT): string[] {
  return [...recent, text].slice(-max);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- tests/core/messages.test.ts`
Expected: PASS — 13 tests.

- [ ] **Step 5: Write the failing test for the sarcastic pack**

`tests/packs/sarcastic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import sarcastic from '../../packs/sarcastic.json' with { type: 'json' };
import { eligibleLines } from '../../src/core/messages.js';
import type { Pack } from '../../src/shared/types.js';

const pack = sarcastic as Pack;

describe('sarcastic pack', () => {
  it('is identified as sarcastic', () => {
    expect(pack.id).toBe('sarcastic');
  });

  it('ships at least 60 lines', () => {
    expect(pack.lines.length).toBeGreaterThanOrEqual(60);
  });

  it('has no duplicate lines', () => {
    const texts = pack.lines.map((l) => l.text);
    expect(new Set(texts).size).toBe(texts.length);
  });

  it('has no blank lines', () => {
    expect(pack.lines.every((l) => l.text.trim().length > 0)).toBe(true);
  });

  it('offers lines at every stage of a three-stage ladder', () => {
    for (const stage of [0, 1, 2]) {
      expect(eligibleLines([pack], stage, 3).length).toBeGreaterThan(5);
    }
  });

  it('still offers final-stage lines on a two-stage ladder', () => {
    expect(eligibleLines([pack], 1, 2).length).toBeGreaterThan(5);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test -- tests/packs/sarcastic.test.ts`
Expected: FAIL — cannot resolve `../../packs/sarcastic.json`.

- [ ] **Step 7: Create `packs/sarcastic.json`**

```json
{
  "id": "sarcastic",
  "name": "Sarcastic",
  "lines": [
    { "text": "Your kidneys filed a complaint.", "stage": [0, 1] },
    { "text": "Cactus called. Wants its lifestyle back.", "stage": [0, 1] },
    { "text": "{{glasses}} glasses today. Bold strategy.", "stage": [0, 1] },
    { "text": "Coffee is not water. It is water with a debt attached.", "stage": [0, 1] },
    { "text": "Blink twice if you are hydrated. You did not blink.", "stage": [0, 1] },
    { "text": "Still here. Still thirsty. Still your problem.", "stage": [0, 1] },
    { "text": "The plant on your desk is doing better than you.", "stage": [0, 1] },
    { "text": "You have had this window open a while. So has your water.", "stage": [0, 1] },
    { "text": "Water. It is the one with no flavour. You will manage.", "stage": [0, 1] },
    { "text": "Congratulations on {{goalPct}}% of your goal. The bar was on the floor.", "stage": [0, 1] },
    { "text": "Your body is 60% water. Currently running a deficit.", "stage": [0, 1] },
    { "text": "This is not a suggestion. It is a glass.", "stage": [0, 1] },
    { "text": "Somewhere a glass of water is waiting. It has been waiting.", "stage": [0, 1] },
    { "text": "{{glasses}} glasses a day. Impressive, for a houseplant.", "stage": [0, 1] },
    { "text": "Tea counts a little. Not this much.", "stage": [0, 1] },
    { "text": "Hydration: the cheapest productivity hack you keep skipping.", "stage": [0, 1] },
    { "text": "Drink water, or keep pretending the headache is the code.", "stage": [0, 1] },
    { "text": "Nobody has ever regretted a glass of water. You are testing that.", "stage": [0, 1] },
    { "text": "Your last drink was a while ago. Long enough that I noticed.", "stage": [0, 1] },
    { "text": "You have time for this. You just checked your phone twice.", "stage": [0, 1] },
    { "text": "Consider: liquid, in your mouth. Revolutionary.", "stage": [0, 1] },
    { "text": "The glass is not going to walk over here.", "stage": [0, 1] },
    { "text": "Thirst is your body's error log. It is very verbose right now.", "stage": [0, 1] },
    { "text": "Water break. Yes now. No, it cannot wait for the build.", "stage": [0, 1] },
    { "text": "You are running on caffeine and spite. Neither is hydrating.", "stage": [0, 1] },
    { "text": "Day {{streak}} of the streak. Do not be the reason it ends.", "stage": [0, 1] },
    { "text": "Small ask. One glass. Then I go away for a bit.", "stage": [0, 1] },
    { "text": "I will keep sitting here. I have nothing else on.", "stage": [0, 1] },
    { "text": "Your future self is thirsty and blaming you specifically.", "stage": [0, 1] },
    { "text": "That is {{goalPct}}% of goal. Rounding up is not hydration.", "stage": [0, 1] },
    { "text": "The mug on your desk is empty. I assumed. I was right.", "stage": [0, 1] },
    { "text": "Water: free, nearby, ignored.", "stage": [0, 1] },
    { "text": "Two minutes away from the screen will not end your career.", "stage": [0, 1] },
    { "text": "Refill. It is a verb. You can do verbs.", "stage": [0, 1] },
    { "text": "A fish drinks more water than you, and it lives in the stuff.", "stage": [0, 1] },
    { "text": "You are one glass away from being smug about it.", "stage": [0, 1] },
    { "text": "Dehydrated people make worse decisions. Explains this afternoon.", "stage": [0, 1] },
    { "text": "I am not saying you are a raisin. I am saying trajectory matters.", "stage": [0, 1] },
    { "text": "Stand. Walk. Pour. Drink. Sit. Ninety seconds, total.", "stage": [0, 1] },
    { "text": "Your daily goal called. It is going to voicemail.", "stage": [0, 1] },
    { "text": "One glass now beats four at 11pm and a night of getting up.", "stage": [0, 1] },
    { "text": "This reminder will not dismiss itself. That was the entire point.", "stage": [0, 1] },
    { "text": "You could have finished the glass in the time you spent reading this.", "stage": [0, 1] },
    { "text": "{{glasses}} down today. The bar is somewhere above that.", "stage": [0, 1] },
    { "text": "Every other tab is a distraction. This one is a public service.", "stage": [0, 1] },
    { "text": "You optimise everything except the part that is 60% of you.", "stage": [0, 1] },
    { "text": "Sparkling, still, tap. I am not fussy. Pick one.", "stage": [0, 1] },
    { "text": "The streak is at {{streak}}. Streaks are fragile. So are you, currently.", "stage": [0, 1] },
    { "text": "DRINK. THE. WATER.", "stage": [2] },
    { "text": "I warned you politely. That phase is over.", "stage": [2] },
    { "text": "Full screen. Because the small one did not work.", "stage": [2] },
    { "text": "You ignored me twice. Here I am, larger.", "stage": [2] },
    { "text": "Nothing else happens until there is water in you.", "stage": [2] },
    { "text": "This is the escalation you configured. Enjoy.", "stage": [2] },
    { "text": "Snooze if you must. Drink if you can.", "stage": [2] },
    { "text": "I have your whole screen now. Weigh your options.", "stage": [2] },
    { "text": "Still {{goalPct}}% of goal. Still unacceptable.", "stage": [2] },
    { "text": "Yes this is dramatic. So is chronic dehydration.", "stage": [2] },
    { "text": "Go. Get. Water.", "stage": [2] },
    { "text": "You built me to do exactly this. Do not act surprised.", "stage": [2] },
    { "text": "The work will still be here. So will I, until you drink.", "stage": [2] },
    { "text": "Escalation complete. The ball is in your court, and the court is your monitor.", "stage": [2] },
    { "text": "This ends when the glass is empty.", "stage": [2] },
    { "text": "Loud, large, and unignorable. As requested.", "stage": [2] },
    { "text": "I do not blink. I do not tire. Drink the water.", "stage": [2] },
    { "text": "Whatever you were doing survived the last interruption too.", "stage": [2] },
    { "text": "Consider this your body's escalation policy.", "stage": [2] },
    { "text": "One glass. Then you get your screen back.", "stage": [2] }
  ]
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — pack test confirms 68 lines, no duplicates, coverage at every stage.

- [ ] **Step 9: Commit**

```bash
git add src/core/messages.ts packs/sarcastic.json tests/core/messages.test.ts tests/packs/sarcastic.test.ts
git commit -m "feat: add message picker with stage-aware sarcastic pack"
```

---

### Task 4: Config defaults and normalization

**Files:**
- Create: `src/core/config.ts`
- Test: `tests/core/config.test.ts`

**Interfaces:**
- Consumes: `Config`, `PresetName`, `Ladder` from `src/shared/types.ts`; `PRESET_LADDERS`, `validateLadder` from `src/core/ladder.ts`.
- Produces:
  - `DEFAULT_CONFIG: Config`
  - `CONFIG_VERSION = 1`
  - `normalizeConfig(raw: unknown): Config` — never throws; fills defaults, clamps numbers, replaces an invalid ladder with the standard preset.
  - `ladderForPreset(preset: PresetName, custom: Ladder): Ladder`

- [ ] **Step 1: Write the failing test**

`tests/core/config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONFIG_VERSION, DEFAULT_CONFIG, ladderForPreset, normalizeConfig } from '../../src/core/config.js';
import { PRESET_LADDERS, validateLadder } from '../../src/core/ladder.js';

describe('DEFAULT_CONFIG', () => {
  it('uses the standard preset ladder', () => {
    expect(DEFAULT_CONFIG.preset).toBe('standard');
    expect(DEFAULT_CONFIG.ladder).toEqual(PRESET_LADDERS.standard);
    expect(validateLadder(DEFAULT_CONFIG.ladder)).toEqual([]);
  });

  it('defaults to the sarcastic pack', () => {
    expect(DEFAULT_CONFIG.activePackIds).toEqual(['sarcastic']);
  });

  it('carries the current config version', () => {
    expect(DEFAULT_CONFIG.version).toBe(CONFIG_VERSION);
  });
});

describe('normalizeConfig', () => {
  it('returns defaults for empty or non-object input', () => {
    expect(normalizeConfig({})).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig(null)).toEqual(DEFAULT_CONFIG);
    expect(normalizeConfig('nonsense')).toEqual(DEFAULT_CONFIG);
  });

  it('preserves supplied values', () => {
    const out = normalizeConfig({ goalMl: 3000, glassMl: 300 });
    expect(out.goalMl).toBe(3000);
    expect(out.glassMl).toBe(300);
  });

  it('merges a partial schedule over the defaults', () => {
    const out = normalizeConfig({ schedule: { intervalMinutes: 30 } });
    expect(out.schedule.intervalMinutes).toBe(30);
    expect(out.schedule.workDays).toEqual(DEFAULT_CONFIG.schedule.workDays);
  });

  it('replaces an invalid ladder with the standard preset', () => {
    const out = normalizeConfig({ ladder: [{ mode: 'corner', delayMinutes: 7 }] });
    expect(out.ladder).toEqual(PRESET_LADDERS.standard);
  });

  it('keeps a valid custom ladder', () => {
    const custom = [
      { mode: 'corner', delayMinutes: 0 },
      { mode: 'center', delayMinutes: 4 },
    ];
    const out = normalizeConfig({ preset: 'custom', ladder: custom });
    expect(out.ladder).toEqual(custom);
  });

  it('clamps out-of-range numbers', () => {
    const out = normalizeConfig({
      schedule: { intervalMinutes: 0 },
      glassMl: 99999,
      goalMl: 1,
      defaultSnoozeMinutes: -5,
    });
    expect(out.schedule.intervalMinutes).toBe(1);
    expect(out.glassMl).toBe(2000);
    expect(out.goalMl).toBe(250);
    expect(out.defaultSnoozeMinutes).toBe(1);
  });

  it('drops invalid work days', () => {
    const out = normalizeConfig({ schedule: { workDays: [1, 9, -2, 5] } });
    expect(out.schedule.workDays).toEqual([1, 5]);
  });

  it('drops a stale dndUntil type', () => {
    const out = normalizeConfig({ dndUntil: 'later' });
    expect(out.dndUntil).toBeNull();
  });

  it('ignores unknown keys', () => {
    const out = normalizeConfig({ mysteryFlag: true }) as Record<string, unknown>;
    expect(out.mysteryFlag).toBeUndefined();
  });

  it('never throws on a ladder holding non-object elements', () => {
    // The likeliest shape of a hand-broken config file.
    expect(() => normalizeConfig({ ladder: [null] })).not.toThrow();
    expect(normalizeConfig({ ladder: [null] }).ladder).toEqual(PRESET_LADDERS.standard);
    expect(normalizeConfig({ ladder: ['corner'] }).ladder).toEqual(PRESET_LADDERS.standard);
    expect(normalizeConfig({ ladder: 7 }).ladder).toEqual(PRESET_LADDERS.standard);
  });

  it('falls back to defaults for empty arrays', () => {
    expect(normalizeConfig({ activePackIds: [] }).activePackIds).toEqual(
      DEFAULT_CONFIG.activePackIds,
    );
    expect(normalizeConfig({ schedule: { workDays: [] } }).schedule.workDays).toEqual(
      DEFAULT_CONFIG.schedule.workDays,
    );
  });

  it('shares no array references with the defaults', () => {
    const a = normalizeConfig({});
    const b = normalizeConfig({});
    expect(a.ladder).not.toBe(b.ladder);
    expect(a.ladder).not.toBe(PRESET_LADDERS.standard);
    expect(a.schedule.workDays).not.toBe(DEFAULT_CONFIG.schedule.workDays);
    expect(a.activePackIds).not.toBe(DEFAULT_CONFIG.activePackIds);
    expect(a.customLines).not.toBe(DEFAULT_CONFIG.customLines);
  });
});

describe('ladderForPreset', () => {
  it('returns the preset ladder for a named preset', () => {
    expect(ladderForPreset('gentle', [])).toEqual(PRESET_LADDERS.gentle);
  });

  it('returns the custom ladder for the custom preset', () => {
    const custom = [{ mode: 'corner' as const, delayMinutes: 0 }];
    expect(ladderForPreset('custom', custom)).toEqual(custom);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/core/config.test.ts`
Expected: FAIL — cannot resolve `../../src/core/config.js`.

- [ ] **Step 3: Create `src/core/config.ts`**

```ts
import type { Config, CornerPosition, Ladder, PresetName, Schedule } from '../shared/types.js';
import { PRESET_LADDERS, validateLadder } from './ladder.js';

export const CONFIG_VERSION = 1;

export const DEFAULT_CONFIG: Config = {
  version: CONFIG_VERSION,
  schedule: {
    intervalMinutes: 45,
    workStartMinute: 9 * 60,
    workEndMinute: 18 * 60,
    workDays: [1, 2, 3, 4, 5],
  },
  preset: 'standard',
  ladder: PRESET_LADDERS.standard,
  defaultSnoozeMinutes: 10,
  goalMl: 2500,
  glassMl: 250,
  cornerPosition: 'bottom-right',
  activePackIds: ['sarcastic'],
  customLines: [],
  autostart: true,
  soundEnabled: false,
  dndUntil: null,
};

const PRESETS: PresetName[] = ['gentle', 'nudge', 'standard', 'relentless', 'custom'];
const CORNERS: CornerPosition[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function normalizeSchedule(raw: unknown): Schedule {
  const r = asRecord(raw);
  const d = DEFAULT_CONFIG.schedule;
  const days = Array.isArray(r.workDays)
    ? (r.workDays as unknown[]).filter(
        (n): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 6,
      )
    : d.workDays;
  return {
    intervalMinutes: clampNumber(r.intervalMinutes, 1, 600, d.intervalMinutes),
    workStartMinute: clampNumber(r.workStartMinute, 0, 1439, d.workStartMinute),
    workEndMinute: clampNumber(r.workEndMinute, 1, 1440, d.workEndMinute),
    // Copied, never aliased: a returned Config must not share arrays with
    // DEFAULT_CONFIG, or one consumer mutating it corrupts every other.
    workDays: days.length > 0 ? [...days] : [...d.workDays],
  };
}

export function ladderForPreset(preset: PresetName, custom: Ladder): Ladder {
  if (preset === 'custom') return custom;
  return PRESET_LADDERS[preset];
}

export function normalizeConfig(raw: unknown): Config {
  const r = asRecord(raw);
  const d = DEFAULT_CONFIG;

  const preset = PRESETS.includes(r.preset as PresetName) ? (r.preset as PresetName) : d.preset;

  // validateLadder takes unknown and never throws, so a hand-edited ladder of
  // arbitrary JSON — [null], ["corner"], 7 — lands on the standard preset
  // instead of crashing a background app the user cannot see.
  const ladder: Ladder =
    validateLadder(r.ladder).length === 0
      ? (r.ladder as Ladder).map((stage) => ({ ...stage }))
      : PRESET_LADDERS.standard.map((stage) => ({ ...stage }));

  const packIds = Array.isArray(r.activePackIds)
    ? (r.activePackIds as unknown[]).filter((s): s is string => typeof s === 'string')
    : d.activePackIds;

  const customLines = Array.isArray(r.customLines)
    ? (r.customLines as unknown[]).filter((s): s is string => typeof s === 'string')
    : d.customLines;

  return {
    version: CONFIG_VERSION,
    schedule: normalizeSchedule(r.schedule),
    preset,
    ladder,
    defaultSnoozeMinutes: clampNumber(r.defaultSnoozeMinutes, 1, 240, d.defaultSnoozeMinutes),
    goalMl: clampNumber(r.goalMl, 250, 10000, d.goalMl),
    glassMl: clampNumber(r.glassMl, 50, 2000, d.glassMl),
    cornerPosition: CORNERS.includes(r.cornerPosition as CornerPosition)
      ? (r.cornerPosition as CornerPosition)
      : d.cornerPosition,
    activePackIds: packIds.length > 0 ? [...packIds] : [...d.activePackIds],
    customLines: [...customLines],
    autostart: typeof r.autostart === 'boolean' ? r.autostart : d.autostart,
    soundEnabled: typeof r.soundEnabled === 'boolean' ? r.soundEnabled : d.soundEnabled,
    dndUntil: typeof r.dndUntil === 'number' && Number.isFinite(r.dndUntil) ? r.dndUntil : null,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add src/core/config.ts tests/core/config.test.ts
git commit -m "feat: add config defaults with defensive normalization"
```

---

### Task 5: Intake log parsing and daily stats

**Files:**
- Create: `src/core/stats.ts`
- Test: `tests/core/stats.test.ts`

**Interfaces:**
- Consumes: `LogEvent` from `src/shared/types.ts`.
- Produces:
  - `parseLog(text: string): LogEvent[]` — skips malformed lines rather than throwing
  - `serializeEvent(event: LogEvent): string` — one JSON line, newline-terminated
  - `startOfLocalDay(ts: number): number`
  - `addLocalDays(ts: number, days: number): number` — DST-safe
  - `mlOnDay(events: LogEvent[], dayStart: number): number`
  - `glassesOnDay(events: LogEvent[], dayStart: number): number`
  - `currentStreak(events: LogEvent[], goalMl: number, now: number): number`
  - `goalPct(ml: number, goalMl: number): number` — integer 0..100+

- [ ] **Step 1: Write the failing test**

`tests/core/stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  addLocalDays,
  currentStreak,
  glassesOnDay,
  goalPct,
  mlOnDay,
  parseLog,
  serializeEvent,
  startOfLocalDay,
} from '../../src/core/stats.js';
import type { LogEvent } from '../../src/shared/types.js';

const NOW = new Date(2026, 7, 24, 14, 0).getTime();

function drank(dayOffset: number, hour: number, ml: number): LogEvent {
  return { ts: new Date(2026, 7, 24 + dayOffset, hour, 0).getTime(), type: 'drank', ml };
}

describe('parseLog', () => {
  it('parses newline-delimited events', () => {
    const text = '{"ts":1,"type":"drank","ml":250}\n{"ts":2,"type":"skip"}\n';
    expect(parseLog(text)).toEqual([
      { ts: 1, type: 'drank', ml: 250 },
      { ts: 2, type: 'skip' },
    ]);
  });

  it('skips malformed and blank lines instead of throwing', () => {
    const text = '{"ts":1,"type":"drank","ml":250}\nnot json\n\n{"type":"skip"}\n';
    expect(parseLog(text)).toEqual([{ ts: 1, type: 'drank', ml: 250 }]);
  });

  it('round-trips through serializeEvent', () => {
    const event: LogEvent = { ts: 42, type: 'snooze', minutes: 10 };
    expect(parseLog(serializeEvent(event))).toEqual([event]);
  });
});

describe('day helpers', () => {
  it('startOfLocalDay strips the time', () => {
    const start = startOfLocalDay(NOW);
    const d = new Date(start);
    expect([d.getHours(), d.getMinutes(), d.getSeconds()]).toEqual([0, 0, 0]);
    expect(d.getDate()).toBe(24);
  });

  it('addLocalDays walks calendar days', () => {
    const yesterday = new Date(addLocalDays(startOfLocalDay(NOW), -1));
    expect(yesterday.getDate()).toBe(23);
  });
});

describe('daily totals', () => {
  const events = [drank(0, 9, 250), drank(0, 11, 250), drank(-1, 10, 500), { ts: NOW, type: 'skip' } as LogEvent];

  it('sums only drank events on the given day', () => {
    expect(mlOnDay(events, startOfLocalDay(NOW))).toBe(500);
  });

  it('counts glasses on the given day', () => {
    expect(glassesOnDay(events, startOfLocalDay(NOW))).toBe(2);
  });

  it('goalPct rounds to an integer', () => {
    expect(goalPct(500, 2500)).toBe(20);
    expect(goalPct(0, 2500)).toBe(0);
  });
});

describe('currentStreak', () => {
  const GOAL = 1000;

  it('is zero with no events', () => {
    expect(currentStreak([], GOAL, NOW)).toBe(0);
  });

  it('counts today when today has already met the goal', () => {
    const events = [drank(0, 9, 1000)];
    expect(currentStreak(events, GOAL, NOW)).toBe(1);
  });

  it('does not break the streak merely because today is incomplete', () => {
    const events = [drank(-1, 9, 1000), drank(-2, 9, 1000)];
    expect(currentStreak(events, GOAL, NOW)).toBe(2);
  });

  it('counts today plus preceding days', () => {
    const events = [drank(0, 9, 1000), drank(-1, 9, 1000), drank(-2, 9, 1000)];
    expect(currentStreak(events, GOAL, NOW)).toBe(3);
  });

  it('stops at the first day below goal', () => {
    const events = [drank(-1, 9, 1000), drank(-2, 9, 400), drank(-3, 9, 1000)];
    expect(currentStreak(events, GOAL, NOW)).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/core/stats.test.ts`
Expected: FAIL — cannot resolve `../../src/core/stats.js`.

- [ ] **Step 3: Create `src/core/stats.ts`**

```ts
import type { LogEvent, LogEventType } from '../shared/types.js';

const TYPES: LogEventType[] = ['drank', 'skip', 'snooze'];

export function serializeEvent(event: LogEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export function parseLog(text: string): LogEvent[] {
  const events: LogEvent[] = [];
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    try {
      const parsed = JSON.parse(trimmed) as Partial<LogEvent>;
      if (typeof parsed.ts !== 'number') continue;
      if (!TYPES.includes(parsed.type as LogEventType)) continue;
      events.push(parsed as LogEvent);
    } catch {
      // A truncated final line after a crash is expected; skip it.
    }
  }
  return events;
}

export function startOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Calendar-day arithmetic, so DST transitions do not shift the boundary. */
export function addLocalDays(ts: number, days: number): number {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function eventsOnDay(events: LogEvent[], dayStart: number): LogEvent[] {
  const dayEnd = addLocalDays(dayStart, 1);
  return events.filter((e) => e.ts >= dayStart && e.ts < dayEnd);
}

export function mlOnDay(events: LogEvent[], dayStart: number): number {
  return eventsOnDay(events, dayStart)
    .filter((e) => e.type === 'drank')
    .reduce((sum, e) => sum + (e.ml ?? 0), 0);
}

export function glassesOnDay(events: LogEvent[], dayStart: number): number {
  return eventsOnDay(events, dayStart).filter((e) => e.type === 'drank').length;
}

export function goalPct(ml: number, goalMl: number): number {
  if (goalMl <= 0) return 0;
  return Math.round((ml / goalMl) * 100);
}

/**
 * Consecutive days meeting the goal, ending today. Today counts only once it
 * has met the goal, but an incomplete today never breaks a running streak.
 */
export function currentStreak(events: LogEvent[], goalMl: number, now: number): number {
  const today = startOfLocalDay(now);
  let streak = 0;
  let day = today;

  if (mlOnDay(events, today) >= goalMl) {
    streak += 1;
  }
  day = addLocalDays(day, -1);

  while (mlOnDay(events, day) >= goalMl) {
    streak += 1;
    day = addLocalDays(day, -1);
  }

  return streak;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add src/core/stats.ts tests/core/stats.test.ts
git commit -m "feat: add intake log parsing and daily hydration stats"
```

---

### Task 6: Popup window geometry

**Files:**
- Create: `src/core/geometry.ts`
- Test: `tests/core/geometry.test.ts`

**Interfaces:**
- Consumes: `WindowMode`, `CornerPosition` from `src/shared/types.ts`.
- Produces:
  - `interface Rect { x: number; y: number; width: number; height: number }`
  - `CORNER_SIZE: { width: 340; height: 150 }`, `CENTER_SIZE: { width: 520; height: 320 }`
  - `CORNER_MARGIN = 24`
  - `popupBounds(mode: WindowMode, workArea: Rect, corner: CornerPosition): Rect`

- [ ] **Step 1: Write the failing test**

`tests/core/geometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  CENTER_SIZE,
  CORNER_MARGIN,
  CORNER_SIZE,
  popupBounds,
  type Rect,
} from '../../src/core/geometry.js';

// A 1920x1080 display whose work area starts 40px down (menu bar / taskbar).
const workArea: Rect = { x: 0, y: 40, width: 1920, height: 1000 };

describe('popupBounds', () => {
  it('places a corner popup bottom-right by default margins', () => {
    const b = popupBounds('corner', workArea, 'bottom-right');
    expect(b.width).toBe(CORNER_SIZE.width);
    expect(b.height).toBe(CORNER_SIZE.height);
    expect(b.x).toBe(1920 - CORNER_SIZE.width - CORNER_MARGIN);
    expect(b.y).toBe(40 + 1000 - CORNER_SIZE.height - CORNER_MARGIN);
  });

  it('places a corner popup top-left inside the work area', () => {
    const b = popupBounds('corner', workArea, 'top-left');
    expect(b.x).toBe(CORNER_MARGIN);
    expect(b.y).toBe(40 + CORNER_MARGIN);
  });

  it('places a corner popup top-right', () => {
    const b = popupBounds('corner', workArea, 'top-right');
    expect(b.x).toBe(1920 - CORNER_SIZE.width - CORNER_MARGIN);
    expect(b.y).toBe(40 + CORNER_MARGIN);
  });

  it('places a corner popup bottom-left', () => {
    const b = popupBounds('corner', workArea, 'bottom-left');
    expect(b.x).toBe(CORNER_MARGIN);
    expect(b.y).toBe(40 + 1000 - CORNER_SIZE.height - CORNER_MARGIN);
  });

  it('centers a center popup in the work area', () => {
    const b = popupBounds('center', workArea, 'bottom-right');
    expect(b.width).toBe(CENTER_SIZE.width);
    expect(b.height).toBe(CENTER_SIZE.height);
    expect(b.x).toBe(Math.round((1920 - CENTER_SIZE.width) / 2));
    expect(b.y).toBe(40 + Math.round((1000 - CENTER_SIZE.height) / 2));
  });

  it('fills the whole work area for fullscreen', () => {
    expect(popupBounds('fullscreen', workArea, 'bottom-right')).toEqual(workArea);
  });

  it('keeps every edge inside a work area smaller than the popup', () => {
    const tiny: Rect = { x: 0, y: 0, width: 300, height: 200 };
    for (const mode of ['corner', 'center'] as const) {
      const b = popupBounds(mode, tiny, 'bottom-right');
      expect(b.x).toBeGreaterThanOrEqual(tiny.x);
      expect(b.y).toBeGreaterThanOrEqual(tiny.y);
      expect(b.x + b.width).toBeLessThanOrEqual(tiny.x + tiny.width);
      expect(b.y + b.height).toBeLessThanOrEqual(tiny.y + tiny.height);
    }
  });

  it('returns a copy for fullscreen rather than aliasing the work area', () => {
    const area: Rect = { x: 0, y: 40, width: 1920, height: 1000 };
    const b = popupBounds('fullscreen', area, 'bottom-right');
    expect(b).not.toBe(area);
    b.width = 1;
    expect(area.width).toBe(1920);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- tests/core/geometry.test.ts`
Expected: FAIL — cannot resolve `../../src/core/geometry.js`.

- [ ] **Step 3: Create `src/core/geometry.ts`**

```ts
import type { CornerPosition, WindowMode } from '../shared/types.js';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CORNER_SIZE = { width: 340, height: 150 } as const;
export const CENTER_SIZE = { width: 520, height: 320 } as const;
export const CORNER_MARGIN = 24;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function popupBounds(
  mode: WindowMode,
  workArea: Rect,
  corner: CornerPosition,
): Rect {
  if (mode === 'fullscreen') {
    return { ...workArea };
  }

  // Size is clamped before position. Clamping only x and y would keep the
  // popup's top-left corner on screen while its right and bottom edges hung
  // off it — a guard on two edges and silence on the other two.
  const preferred = mode === 'center' ? CENTER_SIZE : CORNER_SIZE;
  const width = Math.min(preferred.width, workArea.width);
  const height = Math.min(preferred.height, workArea.height);

  const minX = workArea.x;
  const maxX = workArea.x + workArea.width - width;
  const minY = workArea.y;
  const maxY = workArea.y + workArea.height - height;

  if (mode === 'center') {
    return {
      x: clamp(workArea.x + Math.round((workArea.width - width) / 2), minX, maxX),
      y: clamp(workArea.y + Math.round((workArea.height - height) / 2), minY, maxY),
      width,
      height,
    };
  }

  const right = workArea.x + workArea.width - width - CORNER_MARGIN;
  const bottom = workArea.y + workArea.height - height - CORNER_MARGIN;
  const left = workArea.x + CORNER_MARGIN;
  const top = workArea.y + CORNER_MARGIN;

  const x = corner === 'top-left' || corner === 'bottom-left' ? left : right;
  const y = corner === 'top-left' || corner === 'top-right' ? top : bottom;

  return {
    x: clamp(x, minX, maxX),
    y: clamp(y, minY, maxY),
    width,
    height,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all suites green.

- [ ] **Step 5: Commit**

```bash
git add src/core/geometry.ts tests/core/geometry.test.ts
git commit -m "feat: add popup window geometry for every escalation mode"
```

---

### Task 7: Popup renderer and preload bridge

**Files:**
- Create: `src/preload/index.ts`
- Create: `src/renderer/popup.html`
- Create: `src/renderer/index.tsx`
- Create: `src/renderer/Popup.tsx`
- Create: `src/renderer/popup.css`

**Interfaces:**
- Consumes: `PopupPayload`, `WindowMode` from `src/shared/types.ts`.
- Produces:
  - Preload bridge on `window.water`:
    - `onShow(cb: (payload: PopupPayload) => void): void`
    - `drank(): void`, `snooze(minutes: number): void`, `skip(): void`
  - IPC channel names, which Task 8's main process must match exactly:
    `popup:show` (main → renderer), `popup:drank`, `popup:snooze`, `popup:skip` (renderer → main).

There are no unit tests in this task — it is browser UI with no decision logic. Its verification is the manual run in Task 8, and every value it displays comes from modules already tested in Tasks 1–6.

**File naming:** the entry point is `index.tsx`, not `popup.tsx`, because `popup.tsx` and `Popup.tsx` differ only by case. NTFS and default APFS are both case-insensitive, so the two would be the same path on this dev machine *and* on the target MacBook — the second file written silently overwrites the first. Keep the names distinct in spelling, not just in case.

- [ ] **Step 1: Create `src/preload/index.ts`**

```ts
import { contextBridge, ipcRenderer } from 'electron';
import type { PopupPayload } from '../shared/types.js';

const api = {
  onShow(callback: (payload: PopupPayload) => void): void {
    ipcRenderer.on('popup:show', (_event, payload: PopupPayload) => callback(payload));
  },
  drank(): void {
    ipcRenderer.send('popup:drank');
  },
  snooze(minutes: number): void {
    ipcRenderer.send('popup:snooze', minutes);
  },
  skip(): void {
    ipcRenderer.send('popup:skip');
  },
};

contextBridge.exposeInMainWorld('water', api);

export type WaterApi = typeof api;
```

- [ ] **Step 2: Create `src/renderer/popup.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'"
    />
    <title>Water Reminder</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

- [ ] **Step 3: Create `src/renderer/popup.css`**

```css
:root {
  --bg: #0f2027;
  --bg-2: #1c4966;
  --accent: #4fc3f7;
  --text: #eaf6fb;
  --muted: #9fc4d6;
  color-scheme: dark;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  height: 100%;
  background: transparent;
  overflow: hidden;
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--text);
  user-select: none;
  cursor: default;
}

.shell {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.card {
  width: 100%;
  height: 100%;
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 18px 20px;
  border-radius: 16px;
  background: linear-gradient(145deg, var(--bg), var(--bg-2));
  border: 1px solid rgba(79, 195, 247, 0.35);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.45);
  animation: rise 220ms ease-out;
}

.shell.fullscreen .card {
  max-width: 900px;
  height: auto;
  flex-direction: column;
  text-align: center;
  padding: 48px;
  animation: rise 220ms ease-out, pulse 3.2s ease-in-out 220ms infinite;
}

.shell.center .card {
  flex-direction: column;
  text-align: center;
  padding: 28px;
}

.line {
  flex: 1;
  font-size: 17px;
  line-height: 1.35;
  font-weight: 500;
}

.shell.center .line {
  font-size: 22px;
}

.shell.fullscreen .line {
  font-size: 40px;
  line-height: 1.25;
}

.meta {
  font-size: 12px;
  color: var(--muted);
}

.actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

button {
  font: inherit;
  font-weight: 600;
  border-radius: 10px;
  border: 1px solid rgba(234, 246, 251, 0.22);
  background: rgba(234, 246, 251, 0.08);
  color: var(--text);
  padding: 9px 14px;
  cursor: pointer;
}

button:hover {
  background: rgba(234, 246, 251, 0.18);
}

button.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #06232f;
}

button.ghost {
  padding: 9px 11px;
  color: var(--muted);
}

.snooze-wrap {
  position: relative;
}

.snooze-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  display: flex;
  flex-direction: column;
  min-width: 130px;
  padding: 6px;
  gap: 4px;
  border-radius: 10px;
  background: #0c1b24;
  border: 1px solid rgba(234, 246, 251, 0.18);
  z-index: 5;
}

.ring {
  flex: none;
}

.ring text {
  font-size: 13px;
  font-weight: 700;
  fill: var(--text);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@keyframes pulse {
  0%,
  100% {
    box-shadow: 0 18px 45px rgba(0, 0, 0, 0.45);
  }
  50% {
    box-shadow: 0 18px 70px rgba(79, 195, 247, 0.45);
  }
}
```

- [ ] **Step 4: Create `src/renderer/Popup.tsx`**

```tsx
import { useEffect, useState } from 'react';
import type { PopupPayload } from '../shared/types.js';

const SNOOZE_CHOICES = [5, 10, 15, 30];

function Ring({ pct }: { pct: number }): JSX.Element {
  const clamped = Math.max(0, Math.min(100, pct));
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg className="ring" width="56" height="56" viewBox="0 0 56 56">
      <circle cx="28" cy="28" r={radius} fill="none" stroke="rgba(234,246,251,0.18)" strokeWidth="5" />
      <circle
        cx="28"
        cy="28"
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamped / 100)}
        transform="rotate(-90 28 28)"
      />
      <text x="28" y="32" textAnchor="middle">{`${clamped}%`}</text>
    </svg>
  );
}

export default function Popup(): JSX.Element {
  const [payload, setPayload] = useState<PopupPayload | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    window.water.onShow((next) => {
      setPayload(next);
      setMenuOpen(false);
    });
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent): void {
      if (payload === null) return;
      if (event.key === 'Enter') window.water.drank();
      else if (event.key.toLowerCase() === 's') window.water.snooze(payload.defaultSnoozeMinutes);
      else if (event.key === 'Escape') window.water.skip();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload]);

  if (payload === null) return <div className="shell" />;

  return (
    <div className={`shell ${payload.mode}`}>
      <div className="card">
        <Ring pct={payload.goalPct} />
        <div className="line">
          {payload.line}
          <div className="meta">{`${payload.glasses} glasses today`}</div>
        </div>
        <div className="actions">
          <button className="primary" onClick={() => window.water.drank()}>
            Drank it
          </button>
          <div className="snooze-wrap">
            <button onClick={() => setMenuOpen((open) => !open)}>
              {`Snooze ${payload.defaultSnoozeMinutes}m ▾`}
            </button>
            {menuOpen && (
              <div className="snooze-menu">
                {SNOOZE_CHOICES.map((minutes) => (
                  <button key={minutes} onClick={() => window.water.snooze(minutes)}>
                    {`${minutes} minutes`}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="ghost" title="Skip" onClick={() => window.water.skip()}>
            ✕
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Create `src/renderer/index.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import Popup from './Popup.js';
import type { WaterApi } from '../preload/index.js';
import './popup.css';

declare global {
  interface Window {
    water: WaterApi;
  }
}

const container = document.getElementById('root');
if (container === null) throw new Error('popup root element missing');

createRoot(container).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
```

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no output, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/preload/index.ts src/renderer/
git commit -m "feat: add popup renderer and context-isolated preload bridge"
```

---

### Task 8: Main process wiring — first end-to-end reminder

**Files:**
- Create: `src/main/config.ts`
- Create: `src/main/log.ts`
- Create: `src/main/packs.ts`
- Create: `src/main/windows.ts`
- Create: `src/main/index.ts`

**Interfaces:**
- Consumes: everything produced in Tasks 1–7. In particular `tick`/`onDrank`/`onSkip`/`onSnooze`/`setDnd`/`createInitialState` from `src/core/scheduler.js`, `pickLine`/`pushRecent` from `src/core/messages.js`, `normalizeConfig`/`DEFAULT_CONFIG` from `src/core/config.js`, `popupBounds` from `src/core/geometry.js`, `parseLog`/`serializeEvent`/`mlOnDay`/`glassesOnDay`/`goalPct`/`currentStreak`/`startOfLocalDay` from `src/core/stats.js`.
- Produces:
  - `src/main/config.ts`: `loadConfig(): Config`, `saveConfig(patch: Partial<Config>): Config`
  - `src/main/log.ts`: `appendEvent(event: LogEvent): void`, `readEvents(): LogEvent[]`
  - `src/main/packs.ts`: `loadPacks(activeIds: string[], customLines: string[]): Pack[]`
  - `src/main/windows.ts`: `class PopupManager { show(payload: PopupPayload, corner: CornerPosition): void; hide(): void; destroy(): void }`
  - `src/main/index.ts`: `applyEffects(transition: Transition): void` used by Task 9's tray actions, plus exported `actions` object `{ drank(): void; skip(): void; snooze(minutes: number): void; setDnd(until: number | null): void; refreshConfig(): void }`

**Known Phase 1 gap:** the scheduler's `show` effect carries a `sound` flag
(true on the Relentless preset's final stage), and this task deliberately does
not consume it — audio ships with the rest of the theming work in Phase 3.
The flag is plumbed so nothing has to change in the core later. Leave it
unused rather than half-implementing playback here.

- [ ] **Step 1: Create `src/main/config.ts`**

```ts
import Store from 'electron-store';
import type { Config } from '../shared/types.js';
import { DEFAULT_CONFIG, normalizeConfig } from '../core/config.js';

const store = new Store<{ config: unknown }>({ name: 'config' });

export function loadConfig(): Config {
  try {
    return normalizeConfig(store.get('config', DEFAULT_CONFIG));
  } catch (error) {
    // This app has no window to show an error in. Every I/O path here
    // degrades to a working default rather than throwing into a tick handler
    // and killing a process the user cannot see die.
    console.error('failed to read config, falling back to defaults:', error);
    return normalizeConfig({});
  }
}

export function saveConfig(patch: Partial<Config>): Config {
  const next = normalizeConfig({ ...loadConfig(), ...patch });
  try {
    store.set('config', next);
  } catch (error) {
    console.error('failed to persist config, continuing in memory:', error);
  }
  return next;
}
```

- [ ] **Step 2: Create `src/main/log.ts`**

```ts
import { app } from 'electron';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { LogEvent } from '../shared/types.js';
import { parseLog, serializeEvent } from '../core/stats.js';

function logPath(): string {
  return join(app.getPath('userData'), 'intake.jsonl');
}

export function appendEvent(event: LogEvent): void {
  try {
    appendFileSync(logPath(), serializeEvent(event), 'utf8');
  } catch (error) {
    // Losing one line of history is survivable. Throwing out of the IPC
    // handler that just recorded a drink is not.
    console.error('failed to append intake event:', error);
  }
}

export function readEvents(): LogEvent[] {
  try {
    const path = logPath();
    if (!existsSync(path)) return [];
    return parseLog(readFileSync(path, 'utf8'));
  } catch (error) {
    console.error('failed to read intake log:', error);
    return [];
  }
}
```

- [ ] **Step 3: Create `src/main/packs.ts`**

```ts
import { app } from 'electron';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Pack } from '../shared/types.js';

/**
 * Packs ship alongside the app. In development they sit in the repo root; in a
 * packaged build electron-builder copies them next to the app resources.
 */
function packsDir(): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'packs')
    : join(app.getAppPath(), 'packs');
}

function readPack(id: string): Pack | null {
  const path = join(packsDir(), `${id}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Pack;
  } catch {
    return null;
  }
}

export function loadPacks(activeIds: string[], customLines: string[]): Pack[] {
  const packs: Pack[] = [];
  for (const id of activeIds) {
    const pack = readPack(id);
    if (pack !== null) packs.push(pack);
  }
  if (customLines.length > 0) {
    packs.push({
      id: 'custom',
      name: 'Custom',
      lines: customLines.map((text) => ({ text })),
    });
  }
  return packs;
}
```

- [ ] **Step 4: Create `src/main/windows.ts`**

```ts
import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import type { CornerPosition, PopupPayload } from '../shared/types.js';
import { popupBounds } from '../core/geometry.js';

export class PopupManager {
  private window: BrowserWindow | null = null;
  private ready = false;
  private pending: PopupPayload | null = null;

  private create(): BrowserWindow {
    const window = new BrowserWindow({
      width: 340,
      height: 150,
      show: false,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    window.webContents.on('did-finish-load', () => {
      this.ready = true;
      if (this.pending !== null) {
        window.webContents.send('popup:show', this.pending);
        this.pending = null;
      }
    });

    window.on('closed', () => {
      this.window = null;
      this.ready = false;
    });

    if (process.env.ELECTRON_RENDERER_URL !== undefined) {
      void window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/popup.html`);
    } else {
      void window.loadFile(join(__dirname, '../renderer/popup.html'));
    }

    this.window = window;
    return window;
  }

  show(payload: PopupPayload, corner: CornerPosition): void {
    const window = this.window ?? this.create();

    const cursor = screen.getCursorScreenPoint();
    const display = screen.getDisplayNearestPoint(cursor);
    window.setBounds(popupBounds(payload.mode, display.workArea, corner));

    // The corner stage must never interrupt typing; the louder stages must sit
    // above everything, including full-screen apps.
    window.setAlwaysOnTop(true, payload.mode === 'fullscreen' ? 'screen-saver' : 'floating');

    if (this.ready) {
      window.webContents.send('popup:show', payload);
    } else {
      this.pending = payload;
    }

    if (payload.mode === 'corner') {
      window.showInactive();
    } else {
      window.show();
      window.focus();
    }
  }

  hide(): void {
    this.window?.hide();
  }

  destroy(): void {
    this.window?.destroy();
    this.window = null;
    this.ready = false;
  }
}
```

- [ ] **Step 5: Create `src/main/index.ts`**

```ts
import { app, ipcMain, powerMonitor } from 'electron';
import type { Config, Pack, PopupPayload } from '../shared/types.js';
import {
  createInitialState,
  onDrank,
  onSkip,
  onSnooze,
  setDnd,
  tick,
  type SchedulerConfig,
  type SchedulerState,
  type Transition,
} from '../core/scheduler.js';
import { pickLine, pushRecent, type PickContext } from '../core/messages.js';
import {
  currentStreak,
  glassesOnDay,
  goalPct,
  mlOnDay,
  startOfLocalDay,
} from '../core/stats.js';
import { loadConfig, saveConfig } from './config.js';
import { appendEvent, readEvents } from './log.js';
import { loadPacks } from './packs.js';
import { PopupManager } from './windows.js';

const TICK_MS = 1000;

let config: Config = { ...loadConfig() };
let packs: Pack[] = [];
let state: SchedulerState;
let recent: string[] = [];
let popups: PopupManager;

function schedulerConfig(): SchedulerConfig {
  return {
    intervalMinutes: config.schedule.intervalMinutes,
    ladder: config.ladder,
    workStartMinute: config.schedule.workStartMinute,
    workEndMinute: config.schedule.workEndMinute,
    workDays: config.schedule.workDays,
  };
}

function pickContext(now: number): PickContext {
  const events = readEvents();
  const today = startOfLocalDay(now);
  const ml = mlOnDay(events, today);
  return {
    glasses: glassesOnDay(events, today),
    streak: currentStreak(events, config.goalMl, now),
    goalPct: goalPct(ml, config.goalMl),
  };
}

export function applyEffects(transition: Transition): void {
  state = transition.state;
  const now = Date.now();

  for (const effect of transition.effects) {
    if (effect.type === 'hide') {
      popups.hide();
      continue;
    }

    const ctx = pickContext(now);
    const line = pickLine(packs, effect.stageIndex, config.ladder.length, recent, ctx);
    recent = pushRecent(recent, line);

    const payload: PopupPayload = {
      line,
      stageIndex: effect.stageIndex,
      mode: effect.mode,
      glasses: ctx.glasses,
      goalPct: ctx.goalPct,
      defaultSnoozeMinutes: config.defaultSnoozeMinutes,
    };
    popups.show(payload, config.cornerPosition);
  }
}

export const actions = {
  drank(): void {
    const now = Date.now();
    appendEvent({ ts: now, type: 'drank', ml: config.glassMl });
    applyEffects(onDrank(state, now, schedulerConfig()));
  },
  skip(): void {
    const now = Date.now();
    appendEvent({ ts: now, type: 'skip' });
    applyEffects(onSkip(state, now, schedulerConfig()));
  },
  snooze(minutes: number): void {
    // The renderer is first-party and sandboxed, but this is the main
    // process's only unchecked external input, and a NaN would set nextDueAt
    // to NaN — every later comparison false, the reminder silently never
    // firing again for the life of the process.
    if (!Number.isFinite(minutes) || minutes <= 0) return;
    const now = Date.now();
    appendEvent({ ts: now, type: 'snooze', minutes });
    applyEffects(onSnooze(state, now, minutes, schedulerConfig()));
  },
  setDnd(until: number | null): void {
    config = saveConfig({ dndUntil: until });
    applyEffects(setDnd(state, until, Date.now(), schedulerConfig()));
  },
  refreshConfig(): void {
    config = loadConfig();
    packs = loadPacks(config.activePackIds, config.customLines);
  },
  nextDueAt(): number {
    return state.nextDueAt;
  },
  state(): SchedulerState {
    return state;
  },
  config(): Config {
    return config;
  },
};

function startLoop(): void {
  setInterval(() => {
    applyEffects(tick(state, Date.now(), schedulerConfig()));
  }, TICK_MS);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  void app.whenReady().then(() => {
    config = loadConfig();
    packs = loadPacks(config.activePackIds, config.customLines);
    popups = new PopupManager();
    state = createInitialState(Date.now(), schedulerConfig());

    if (config.dndUntil !== null && config.dndUntil > Date.now()) {
      applyEffects(setDnd(state, config.dndUntil, Date.now(), schedulerConfig()));
    }

    ipcMain.on('popup:drank', () => actions.drank());
    ipcMain.on('popup:skip', () => actions.skip());
    ipcMain.on('popup:snooze', (_event, minutes: number) => actions.snooze(minutes));

    // Waking from sleep must produce one reminder, never a burst.
    powerMonitor.on('resume', () => {
      applyEffects(tick(state, Date.now(), schedulerConfig()));
    });

    app.dock?.hide();
    startLoop();
  });

  // A tray app has no windows to keep alive; never quit when none are open.
  app.on('window-all-closed', () => {
    // Intentionally empty.
  });
}
```

- [ ] **Step 6: Typecheck and run the full test suite**

Run: `npm run typecheck && npm test`
Expected: typecheck silent, all core tests PASS.

- [ ] **Step 7: Manually verify the reminder end to end**

Temporarily shorten the interval so the loop is observable. In a Node REPL or a scratch script, write a config with a 1-minute interval, or edit `DEFAULT_CONFIG.schedule.intervalMinutes` to `1` locally (revert before committing).

Run: `npm run dev`

Verify, in order:
1. After ~1 minute, a small card appears in the bottom-right corner.
2. **Type in another window while the card is showing — keystrokes go to that window, not the popup.** This is the `showInactive` requirement.
3. After 3 more minutes the popup becomes a centered window and takes focus.
4. After 5 more minutes it fills the screen.
5. Click `Drank it` — the popup disappears and does not return before the interval elapses.
6. Reopen, click `Snooze 10m ▾` → `5 minutes` — popup disappears, returns as a corner card after 5 minutes.
7. Click `✕` — popup disappears.
8. Confirm `%APPDATA%\water-reminder\intake.jsonl` contains one line per action with the right `type`.

Revert the interval change before committing.

- [ ] **Step 8: Commit**

```bash
git add src/main/
git commit -m "feat: wire scheduler, popups, and intake log into the main process"
```

---

### Task 9: Tray, do not disturb, and autostart

**Files:**
- Create: `scripts/make-icons.mjs`
- Create: `resources/icon-16.png`, `resources/icon-32.png`, `resources/icon-256.png` (generated by the script)
- Create: `src/main/tray.ts`
- Modify: `src/main/index.ts` — construct the tray after the popup manager, and honour `config.autostart`
- Modify: `package.json` — add the `icons` script

**Interfaces:**
- Consumes: `actions` and `applyEffects` from `src/main/index.ts`; `Config` from `src/shared/types.ts`.
- Produces: `src/main/tray.ts` exporting `createTray(deps: TrayDeps): { refresh(): void; destroy(): void }` where
  `interface TrayDeps { nextDueAt(): number; state(): { phase: string }; config(): Config; drank(): void; setDnd(until: number | null): void; openSettings(): void }`.
  `openSettings` is wired to a placeholder in Phase 1 and becomes the settings window in Phase 3.

- [ ] **Step 1: Create `scripts/make-icons.mjs`**

The tray needs a real PNG. Rather than commit an opaque binary blob, generate one deterministically — a rounded blue droplet on transparency.

```js
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources');

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Signed distance to a droplet: a circle below, tapering to a point above. */
function dropletAlpha(x, y, size) {
  const nx = (x + 0.5) / size - 0.5;
  const ny = (y + 0.5) / size - 0.5;

  const R = 0.28; // circle radius
  const cy = 0.06; // circle centre y
  const topY = -0.36; // apex y, above the circle

  const circle = Math.hypot(nx, ny - cy) - R;

  // Cone: bounded taper from the apex point down to the circle's width,
  // so the two pieces meet flush instead of the cone running unbounded.
  let cone;
  if (ny <= topY) {
    cone = Math.hypot(nx, topY - ny);
  } else if (ny >= cy) {
    cone = 1; // below the taper zone; the circle alone decides here
  } else {
    const t = (ny - topY) / (cy - topY); // 0 at apex .. 1 at the circle centre
    cone = Math.abs(nx) - R * t;
  }

  const d = Math.min(circle, cone);
  if (d <= -0.02) return 255;
  if (d >= 0.02) return 0;
  return Math.round(255 * (1 - (d + 0.02) / 0.04));
}

function makePng(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const a = dropletAlpha(x, y, size);
      raw[p++] = 0x4f;
      raw[p++] = 0xc3;
      raw[p++] = 0xf7;
      raw[p++] = a;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [16, 32, 256]) {
  const file = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, makePng(size));
  console.log(`wrote ${file}`);
}
```

- [ ] **Step 2: Add the script to `package.json` and generate the icons**

Add to `"scripts"`:

```json
"icons": "node scripts/make-icons.mjs"
```

Run: `npm run icons`
Expected: three `wrote ...` lines. Open `resources/icon-256.png` and confirm it looks like a blue droplet on a transparent background. If the shape is wrong, adjust the constants in `dropletAlpha` and re-run — this is the only step in the plan whose output is judged by eye.

- [ ] **Step 3: Create `src/main/tray.ts`**

```ts
import { Menu, Tray, app, nativeImage } from 'electron';
import { join } from 'node:path';
import type { Config } from '../shared/types.js';
import { addLocalDays } from '../core/stats.js';

export interface TrayDeps {
  nextDueAt(): number;
  state(): { phase: string };
  config(): Config;
  drank(): void;
  setDnd(until: number | null): void;
  openSettings(): void;
}

const MIN = 60_000;

function iconPath(): string {
  const file = process.platform === 'darwin' ? 'icon-16.png' : 'icon-32.png';
  return app.isPackaged
    ? join(process.resourcesPath, 'resources', file)
    : join(app.getAppPath(), 'resources', file);
}

function countdownLabel(deps: TrayDeps): string {
  const phase = deps.state().phase;
  if (phase === 'paused') return 'Paused';
  if (phase === 'due') return 'Waiting on you';
  const remaining = deps.nextDueAt() - Date.now();
  if (remaining <= 0) return 'Due now';
  return `Next drink in ${Math.max(1, Math.round(remaining / MIN))} min`;
}

export function createTray(deps: TrayDeps): { refresh(): void; destroy(): void } {
  const image = nativeImage.createFromPath(iconPath());
  image.setTemplateImage(process.platform === 'darwin');

  const tray = new Tray(image);

  function refresh(): void {
    const config = deps.config();
    const paused = config.dndUntil !== null && config.dndUntil > Date.now();

    tray.setToolTip(`Water Reminder — ${countdownLabel(deps)}`);
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: countdownLabel(deps), enabled: false },
        { type: 'separator' },
        { label: 'Drink now', click: () => deps.drank() },
        { type: 'separator' },
        { label: 'Pause 30 minutes', click: () => deps.setDnd(Date.now() + 30 * MIN) },
        { label: 'Pause 1 hour', click: () => deps.setDnd(Date.now() + 60 * MIN) },
        // addLocalDays lands on the next local midnight and is already covered
        // by the core's tests — "until tomorrow" is a real rule with rollover
        // and DST edges, so it does not get a private copy in the view layer.
        { label: 'Pause until tomorrow', click: () => deps.setDnd(addLocalDays(Date.now(), 1)) },
        { label: 'Resume reminders', enabled: paused, click: () => deps.setDnd(null) },
        { type: 'separator' },
        { label: 'Settings…', click: () => deps.openSettings() },
        { label: 'Quit', click: () => app.quit() },
      ]),
    );
  }

  refresh();
  const timer = setInterval(refresh, 30_000);

  return {
    refresh,
    destroy(): void {
      clearInterval(timer);
      tray.destroy();
    },
  };
}
```

- [ ] **Step 4: Wire the tray and autostart into `src/main/index.ts`**

Add the import beside the other `./` imports:

```ts
import { createTray } from './tray.js';
```

Declare the handle beside the other module-level `let` bindings:

```ts
let tray: ReturnType<typeof createTray> | null = null;
```

Inside `applyEffects`, refresh the tray after the effect loop so the countdown tracks reality. Add as the last line of the function:

```ts
  tray?.refresh();
```

Inside the `app.whenReady()` callback, after `state = createInitialState(...)` and before `startLoop()`:

```ts
    app.setLoginItemSettings({ openAtLogin: config.autostart, args: ['--hidden'] });

    tray = createTray({
      nextDueAt: () => actions.nextDueAt(),
      state: () => actions.state(),
      config: () => actions.config(),
      drank: () => actions.drank(),
      setDnd: (until) => actions.setDnd(until),
      openSettings: () => {
        // Phase 3 opens the settings window here. Until then, edit config.json.
        console.log('Settings live in config.json until Phase 3.');
      },
    });

    app.on('before-quit', () => {
      tray?.destroy();
    });
```

- [ ] **Step 5: Typecheck and test**

Run: `npm run typecheck && npm test`
Expected: typecheck silent, all core tests PASS.

- [ ] **Step 6: Manually verify the tray**

Run: `npm run dev`

Verify:
1. A droplet icon appears in the Windows system tray, and the app has **no taskbar button**.
2. Right-click shows the countdown, and it decreases across menu openings.
3. `Drink now` appends a `drank` line to `intake.jsonl` with no popup.
4. `Pause 30 minutes` — no popup fires; `Resume reminders` becomes enabled; choosing it re-arms.
5. `Quit` exits the process fully (check Task Manager).
6. Check the Windows startup entry: run `Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'` in PowerShell and confirm a `water-reminder` value exists.

- [ ] **Step 7: Commit**

```bash
git add scripts/make-icons.mjs resources/ src/main/tray.ts src/main/index.ts package.json
git commit -m "feat: add tray menu with do not disturb and login-item autostart"
```

---

### Task 10: Packaging, README, and the Phase 1 verification checklist

**Files:**
- Modify: `package.json` — add the `build` block for electron-builder
- Create: `README.md`
- Create: `docs/manual-verification.md`

**Interfaces:**
- Consumes: the built output of every earlier task.
- Produces: a runnable `.exe` installer and the per-OS checklist that Phase 2 executes on the MacBook.

- [ ] **Step 1: Add the electron-builder config to `package.json`**

Add this top-level `"build"` key:

```json
"build": {
  "appId": "com.sidvs.waterreminder",
  "productName": "Water Reminder",
  "directories": { "output": "dist", "buildResources": "resources" },
  "files": ["out/**/*", "package.json"],
  "extraResources": [
    { "from": "packs", "to": "packs" },
    { "from": "resources", "to": "resources" }
  ],
  "win": { "target": ["nsis"], "icon": "resources/icon-256.png" },
  "nsis": { "oneClick": false, "allowToChangeInstallationDirectory": true },
  "mac": {
    "target": ["dmg"],
    "category": "public.app-category.healthcare-fitness",
    "icon": "resources/icon-256.png",
    "identity": null,
    "extendInfo": { "LSUIElement": true }
  }
}
```

`LSUIElement: true` is what keeps the app out of the macOS Dock and app switcher. `identity: null` produces an ad-hoc signed build — fine for personal use, and the reason first launch on the Mac needs right-click → Open.

- [ ] **Step 2: Build the Windows installer**

Run: `npm run dist:win`
Expected: `dist/Water Reminder Setup 0.1.0.exe` exists.

- [ ] **Step 3: Install and verify the packaged build**

Run the installer, then launch the installed app (not `npm run dev`).

Verify:
1. Tray icon appears; no taskbar button.
2. A reminder fires and escalates — packaged builds load `packs/` from `resources`, so confirm the popup shows a **sarcastic line**, not the `Time to drink water.` fallback. Seeing the fallback means `extraResources` is misconfigured.
3. `Drank it` writes to `%APPDATA%\water-reminder\intake.jsonl`.
4. Reboot; confirm the app starts automatically with no visible window.

- [ ] **Step 4: Create `docs/manual-verification.md`**

```markdown
# Manual Verification Checklist

Unit tests cover scheduling, escalation, message selection, config, stats, and
geometry. This checklist covers what they cannot reach: real windows on a real
desktop. Run it per OS.

## Windows (Phase 1)

- [ ] Tray icon renders and is legible on both light and dark taskbars.
- [ ] App has no taskbar button.
- [ ] Corner card appears without stealing focus — type in another app while it
      is up and confirm every keystroke lands there.
- [ ] Center stage appears on schedule and takes focus.
- [ ] Fullscreen stage covers the display under the cursor.
- [ ] Fullscreen stage appears over a maximized window and over a fullscreen
      video.
- [ ] Drink / Snooze / Skip each clear the popup and write the right log line.
- [ ] Popup never disappears on its own — leave the final stage up for 10
      minutes and confirm it is still there.
- [ ] Snooze returns the popup at stage 0 after the chosen delay.
- [ ] Tray pause suppresses reminders; resume re-arms them.
- [ ] Autostart launches the app on login with no visible window.
- [ ] Sleep the machine past two intervals; on wake exactly one reminder fires.

## macOS (Phase 2)

Everything above, plus:

- [ ] App does not appear in the Dock (`LSUIElement`).
- [ ] App does not appear in the Cmd-Tab switcher.
- [ ] Menu-bar icon renders correctly as a template image in light and dark
      menu bars.
- [ ] Fullscreen stage floats above a native fullscreen app (a fullscreen
      browser or Keynote presentation) rather than switching Spaces.
- [ ] Corner card appears on the active Space, not only the one it was created
      on.
- [ ] Login item survives a reboot and appears under System Settings → General
      → Login Items.
- [ ] `.app` opens after right-click → Open on first launch (ad-hoc signature).
```

- [ ] **Step 5: Create `README.md`**

```markdown
# Water Reminder

A desktop water reminder that will not let you ignore it. A notification that
dismisses itself is a notification you forget; this one stays on screen until
you press Drink, Snooze, or Skip, and it gets progressively harder to ignore
while you leave it alone.

Runs on macOS and Windows. Lives in the menu bar / system tray.

## Development

```bash
npm install
npm run icons     # generate the tray icons (once)
npm run dev       # run the app
npm test          # unit tests
npm run typecheck
```

## Building

```bash
npm run dist:win  # Windows installer, on Windows
npm run dist:mac  # macOS .app + .dmg, must be run on a Mac
```

## How it works

All decision logic lives in `src/core/` as pure TypeScript with no Electron
imports, so it runs and is tested under plain Node on either OS. `src/main/` is
a thin Electron shell that applies the effects the core returns.

- `src/core/scheduler.ts` — when to fire and when to escalate
- `src/core/ladder.ts` — escalation presets and validation
- `src/core/messages.ts` — line selection, stage filtering, templating
- `src/core/config.ts` — defaults and defensive normalization
- `src/core/stats.ts` — intake log parsing, daily totals, streaks
- `src/core/geometry.ts` — popup placement per escalation stage

## Annoyance level

Escalation is a configurable ladder of stages. Presets:

| Preset | Behaviour | Times |
|---|---|---|
| Gentle | corner card only | 0m |
| Nudge | corner, then centered window | 0m, 5m |
| Standard | corner, centered, then fullscreen | 0m, 3m, 8m |
| Relentless | as Standard, sooner, with sound | 0m, 2m, 5m |
| Custom | your own stages | — |

At every level the final stage persists until you act. Gentle is small
forever, not temporary.

Until the Phase 3 settings UI lands, edit `config.json` in:

- macOS: `~/Library/Application Support/water-reminder/`
- Windows: `%APPDATA%\water-reminder\`

## Docs

- Design spec: `docs/superpowers/specs/2026-08-24-water-reminder-design.md`
- Phase 1 plan: `docs/superpowers/plans/2026-08-24-water-reminder-phase-1.md`
- Manual verification: `docs/manual-verification.md`
```

- [ ] **Step 6: Run the Windows section of the manual checklist**

Work through every Windows box in `docs/manual-verification.md` against the packaged build. Fix anything that fails before committing; a failing box here is a Phase 1 bug, not a Phase 2 problem.

- [ ] **Step 7: Commit**

```bash
git add package.json README.md docs/manual-verification.md
git commit -m "feat: add electron-builder packaging, README, and verification checklist"
```

---

## Phase 1 Done When

- `npm test` passes, covering ladder, scheduler, messages, config, stats, and geometry.
- `npm run typecheck` is clean.
- The packaged Windows build runs from the tray, fires on schedule, escalates through all three stages, and clears only on Drink / Snooze / Skip.
- Every Windows box in `docs/manual-verification.md` is ticked.
- The macOS section of that checklist is ready to run — that is Phase 2, on the MacBook.
