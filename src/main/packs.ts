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
