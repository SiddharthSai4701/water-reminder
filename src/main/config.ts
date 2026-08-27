import Store from 'electron-store';
import type { Config } from '../shared/types.js';
import { DEFAULT_CONFIG, normalizeConfig } from '../core/config.js';
import { migrateConfig } from '../core/migrate.js';
import { writeUserPack } from './packs.js';

const store = new Store<{ config: unknown }>({ name: 'config' });

export interface LoadedConfig {
  config: Config;
  /**
   * Lines a customLines migration could not write to disk. They stay live
   * for this session; the migration retries on the next launch.
   */
  pendingCustomLines: string[];
}

export function loadConfig(): LoadedConfig {
  try {
    const { raw, effects } = migrateConfig(store.get('config', DEFAULT_CONFIG));
    const config = normalizeConfig(raw);

    let migrated = true;
    let pendingCustomLines: string[] = [];

    if (effects.writeCustomPack !== undefined) {
      const lines = effects.writeCustomPack;
      migrated = writeUserPack('custom', {
        id: 'custom',
        name: 'Custom',
        lines: lines.map((text) => ({ text })),
      });
      if (!migrated) pendingCustomLines = lines;
    }

    // The version stamp is what records that the migration happened, so a
    // failed effect must not be persisted or it can never be retried.
    if (migrated) store.set('config', config);

    return { config, pendingCustomLines };
  } catch (error) {
    // This app has no window to show an error in. Every I/O path here
    // degrades to a working default rather than throwing into a tick handler
    // and killing a process the user cannot see die.
    console.error('failed to read config, falling back to defaults:', error);
    return { config: normalizeConfig({}), pendingCustomLines: [] };
  }
}

export function saveConfig(current: Config, patch: Partial<Config>): Config {
  const next = normalizeConfig({ ...current, ...patch });
  try {
    store.set('config', next);
  } catch (error) {
    console.error('failed to persist config, continuing in memory:', error);
  }
  return next;
}
