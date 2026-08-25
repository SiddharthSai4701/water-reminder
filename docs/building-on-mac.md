# Building on the MacBook

The macOS `.app` and `.dmg` **must be built on macOS**. Bundling, code
signing (even ad-hoc), and DMG creation all use macOS-only tooling;
electron-builder has no supported path for producing them from Windows.
This is why Phase 2 of the plan is a pass on the Mac.

## Get the code across

The repo has no git remote. Either push it to a remote and clone, or move
it directly with a git bundle, which carries the full history in one file:

```bash
# On Windows, from the repo root
git bundle create water-reminder.bundle --all
```

Copy `water-reminder.bundle` to the Mac (AirDrop, USB, cloud drive), then:

```bash
git clone water-reminder.bundle water-reminder
cd water-reminder
git checkout master
```

Do **not** copy `node_modules/` across — it holds a Windows build of
Electron and native modules that will not run on macOS. `npm install` on
the Mac fetches the right ones.

## Build

```bash
node --version      # must be 20 or newer
npm install
npm run icons       # regenerate the PNGs
npm test            # 104 tests, all should pass
npm run dist:mac
```

The result is `dist/Water Reminder-0.1.0-arm64.dmg`, targeting Apple
Silicon. On an Intel Mac, change `arch` to `x64` in `package.json`'s
`build.mac.target`.

## First launch

The build is ad-hoc signed (`"identity": null`), so Gatekeeper will refuse
a normal double-click. **Right-click the app → Open**, then confirm. This
is only needed once.

If macOS still blocks it:

```bash
xattr -cr "/Applications/Water Reminder.app"
```

## What to check first

`docs/manual-verification.md` holds the full checklist. The macOS-specific
items matter most, because none of them can be verified from Windows:

- The app does **not** appear in the Dock or in Cmd-Tab (`LSUIElement`).
- The menu-bar icon renders as a template image — correct in both light
  and dark menu bars.
- The fullscreen stage floats **above** a native fullscreen app (try a
  fullscreen browser or a Keynote presentation) rather than switching
  Spaces to reach it.
- The corner card appears on the Space you are currently on, not only the
  one it was created on.
- The login item survives a reboot and appears under System Settings →
  General → Login Items.

The fullscreen-above-fullscreen behaviour is the one most likely to need
work: it depends on the `screen-saver` window level and on
`setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })`, and
neither can be exercised on Windows.

## Settings

There is no settings UI until Phase 3. Configuration is JSON at:

```
~/Library/Application Support/water-reminder/config.json
```

Quit the app from the menu bar before editing, then relaunch.
