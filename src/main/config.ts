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

    let canPersist = true;
    let pendingCustomLines: string[] = [];

    if (effects.writeCustomPack !== undefined) {
      const lines = effects.writeCustomPack;
      canPersist = writeUserPack('custom', {
        id: 'custom',
        name: 'Custom',
        lines: lines.map((text) => ({ text })),
      });
      if (!canPersist) pendingCustomLines = lines;
    }

    // The version stamp is what records that the migration happened, so a
    // failed effect must not be persisted or it can never be retried.
    if (canPersist) {
      try {
        store.set('config', config);
      } catch (error) {
        // Only the persist failed; the migrated config in hand is still
        // correct and the file on disk is untouched. Keep using it for this
        // session instead of falling back to defaults, and let the version
        // stamp being stale drive a retry on the next launch.
        console.error('failed to persist the migrated config:', error);
      }
    }

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
