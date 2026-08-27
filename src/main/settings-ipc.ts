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
