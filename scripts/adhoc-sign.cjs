const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

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

  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });

  console.log(`  • ad-hoc signed  ${appPath}`);
};
