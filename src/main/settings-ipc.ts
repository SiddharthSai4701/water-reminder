import { ipcMain, shell } from 'electron';
import { formatPackText, parsePackText } from '../core/packtext.js';
import { atSourceLines, validatePackLines } from '../core/packvalidate.js';
import type { Config, Pack, PackSummary, PackWriteResult } from '../shared/types.js';
import {
  deleteUserPack,
  ensureUserPacksDir,
  hasShippedPack,
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

/**
 * Pack ids become filenames. The renderer is first-party and sandboxed, but
 * these are the only channels that put a renderer-supplied string into a
 * filesystem path, and one of them deletes: an id of `../config` on the
 * revert channel would take out the user's config file, silently, because
 * the unlink runs with { force: true }.
 */
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** `SAFE_ID.test` coerces, so a non-string would be checked as its own
 *  spelling — `null` would pass as "null". Rejected by type first. */
function isSafeId(id: unknown): id is string {
  return typeof id === 'string' && SAFE_ID.test(id);
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
      shipped: hasShippedPack(id),
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
    if (!isSafeId(id)) return '';
    const { packs } = loadPacksWithErrors([id]);
    const pack = packs.find((p) => p.id === id);
    return pack === undefined ? '' : formatPackText(pack.lines);
  });

  ipcMain.handle('settings:packs:write', (_e, id: string, text: string): PackWriteResult => {
    if (!isSafeId(id)) return { ok: false, errors: [{ message: 'invalid pack id' }] };

    const parsed = parsePackText(text);
    if (parsed.errors.length > 0) return { ok: false, errors: parsed.errors };

    // Through sourceLines, or every number the editor shows is off by however
    // many blank rows precede it.
    const issues = atSourceLines(validatePackLines(parsed.lines), parsed.sourceLines);
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
    if (!isSafeId(id)) return summaries(deps.config());
    // Revert deletes the user file and lets the shipped one show through. With
    // no shipped file there is nothing underneath, so this would be a
    // permanent delete of the only copy — which is what the v1 migration's
    // `custom` pack is. The pane does not offer the button in that case; this
    // is the boundary refusing to do it even if asked.
    if (!hasShippedPack(id)) return summaries(deps.config());
    deleteUserPack(id);
    deps.reloadPacks();
    return summaries(deps.config());
  });

  ipcMain.on('settings:packs:reveal', () => {
    try {
      // The directory only exists once something has been written into it, and
      // openPath on a missing path just returns an error string nobody reads.
      ensureUserPacksDir();
    } catch (error) {
      console.error('failed to create the user packs directory:', error);
    }
    void shell.openPath(userPacksDir());
  });
}
