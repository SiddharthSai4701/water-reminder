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
- [ ] Autostart launches the app on login with no visible window. Test this
      from an INSTALLED build only — autostart is registered only when
      `app.isPackaged`, because in dev the login item would point at bare
      `electron.exe` and show Electron's default welcome window at every boot.
- [ ] After uninstalling a build, confirm no `Run` key entry is left behind:
      `Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'`.
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

## macOS, Phase 3a: the settings window and packs

Passed already on v0.1.5 (2026-08-28), recorded here so a later change has
something to re-run against:

- [x] Settings opens from the tray menu and comes to the **front**, with the
      dock hidden and another app frontmost — including a fullscreen one.
      `app.focus({ steal: true })` under `LSUIElement` is what does this.
- [x] Settings opened while a reminder is showing stays **behind** the popup.
      The reminder still cannot be answered by clicking past it.

Not yet run:

- [ ] Once the reminder is answered, the settings window is reachable again.
- [ ] Every pane's controls save without a restart: change the interval, the
      hours, the days, the preset, a stage delay, the corner, the goal, the
      glass size, and autostart. Reopen settings and confirm each stuck.
- [ ] A clamped entry snaps back visibly. Type 9999 into the interval, click
      away, and confirm the field shows 600 rather than keeping 9999.
- [ ] An emptied number field is left alone rather than clamped to its floor:
      clear the interval field, click away, confirm the old value returns.
- [ ] **Reveal packs folder** opens Finder at
      `~/Library/Application Support/water-reminder/packs/`, including on a
      fresh install where nothing has written there yet.
- [ ] Edit the sarcastic pack, paste a duplicate of an existing line, Save.
      The error names the **right line number** — count the rows, including
      blank ones — and nothing is written.
- [ ] Fix it, Save, and confirm `sarcastic.json` now exists in the packs
      folder and the row is marked *Customised*.
- [ ] *Revert to shipped* deletes that file and the row stops being marked.
- [ ] Hand-corrupt a pack file, restart, and confirm the Packs pane shows the
      parse error rather than the pack silently vanishing.
- [ ] Do it again with JSON that is *valid but not a pack* — replace the file
      with `{"id":"x","name":"X"}`. The row must show an error, the settings
      window must still load, and reminders must keep firing. Before this was
      fixed it threw out of the one-second tick, where nothing reports it.
- [ ] Copy `sarcastic.json` to `mine.json` in the packs folder without editing
      the `"id"` field, restart, and confirm the new row shows its real line
      count and opens with its real content — not 0 lines and a blank editor.
- [ ] A pack that exists only in your folder (`custom.json` after a v1
      migration, or `mine.json` above) is badged **Yours** and has **no**
      "Revert to shipped" button. Deleting it would destroy the only copy.
- [ ] Start editing a pack, then click another section in the sidebar. It must
      ask before discarding what you typed.
- [ ] All four packs are listed with working active checkboxes, and the last
      active one refuses to be unchecked with a note saying why.
- [ ] An overnight window still fires after midnight: set 22:00-02:00, wait
      out one interval past midnight.
- [ ] With that window set, check the tray tooltip during the afternoon. It
      must name tonight's 22:00 opening, not midnight tomorrow.
- [ ] After a migration from a v1 config, `config.json` reads `version: 2`,
      has no `customLines`, and the old lines are in
      `<userData>/packs/custom.json`. **`activePackIds` must now include
      `custom`** — the file existing is not the same as the lines being used,
      and reminders must actually show one of them.
- [ ] A pack line that starts with a bracket survives an edit. Add
      `[0] literal text` to a pack, Save, reopen: it must still read
      `\[0] literal text` in the editor and must not have gained a stage tag.
- [ ] On a 09:00-18:00 window, retype the From hour to 18. The schedule must
      not flip to Always on partway through the keystrokes.
- [ ] Quit and relaunch: the next reminder keeps its old time rather than
      being pushed a full interval into the future.
