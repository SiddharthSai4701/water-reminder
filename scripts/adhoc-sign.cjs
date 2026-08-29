const { execFileSync } = require('node:child_process');
const { readdirSync, rmSync, statSync } = require('node:fs');
const { join } = require('node:path');

/** The only localizations this app ships. Everything else is Chromium's. */
const KEEP_LPROJ = new Set(['en.lproj', 'en_US.lproj', 'Base.lproj']);

/**
 * Delete every localization the app does not use.
 *
 * `electronLanguages: ['en-US']` is set in the build config and does not work:
 * the v0.1.6 build shipped all 55 `.lproj` directories, about 40 MB, roughly a
 * sixth of the installed app. The backlog has claimed since Phase 1 that this
 * was "trimmed to en-US" — the setting was added, the result was never
 * measured, and the claim has been wrong ever since.
 *
 * Done here rather than by fighting the setting because this hook already
 * exists, runs on darwin only, and can be verified: the CI size report counts
 * what survives, so a regression shows up in the build log rather than in
 * someone's disk usage a year later.
 */
function pruneLocalizations(dir) {
  let removed = 0;
  let bytes = 0;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    // Symlinks inside a .framework point back into Versions/A; following them
    // would walk the same files twice and, worse, delete through the link.
    if (entry.isSymbolicLink()) continue;
    if (!entry.isDirectory()) continue;

    const path = join(dir, entry.name);
    if (entry.name.endsWith('.lproj')) {
      if (KEEP_LPROJ.has(entry.name)) continue;
      for (const file of readdirSync(path, { withFileTypes: true })) {
        if (file.isFile()) bytes += statSync(join(path, file.name)).size;
      }
      rmSync(path, { recursive: true, force: true });
      removed += 1;
      continue;
    }
    const inner = pruneLocalizations(path);
    removed += inner.removed;
    bytes += inner.bytes;
  }

  return { removed, bytes };
}

/**
 * Ad-hoc sign the .app before it is packaged into the .dmg.
 *
 * Apple Silicon requires every executable to carry at least an ad-hoc
 * signature. electron-builder's `identity: null` skips signing altogether,
 * which leaves an unsigned binary — and macOS reports an unsigned, quarantined
 * app as "is damaged and can't be opened" rather than as an unsigned one.
 *
 * With a real ad-hoc signature the app instead gets the ordinary unidentified
 * developer prompt, which right-click -> Open clears.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appPath = join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`,
  );

  // Strictly before signing: changing a single byte inside the bundle after
  // codesign runs invalidates the signature, and an invalid signature is worse
  // than none — macOS reports it as damaged rather than as unidentified.
  const pruned = pruneLocalizations(join(appPath, 'Contents'));
  console.log(
    `  • removed ${pruned.removed} localizations  ${(pruned.bytes / 1024 / 1024).toFixed(1)} MB`,
  );

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });

  console.log(`  • ad-hoc signed  ${appPath}`);
};
