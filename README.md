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

- **Status and backlog: `docs/status-and-backlog.md`** — start here. Where
  each phase stands, what is still unverified on macOS, every deferred
  review finding, and why Tauri was investigated and rejected.
- Design spec: `docs/superpowers/specs/2026-08-24-water-reminder-design.md`
- Phase 1 plan: `docs/superpowers/plans/2026-08-24-water-reminder-phase-1.md`
- Manual verification: `docs/manual-verification.md`
- Building on the Mac: `docs/building-on-mac.md`
