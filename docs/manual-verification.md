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
