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

/**
 * Also called before revealing the folder: `shell.openPath` on a path that
 * does not exist yet fails silently, so the button would do nothing at all
 * until some other action happened to create the directory.
 */
export function ensureUserPacksDir(): void {
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
