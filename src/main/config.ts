import Store from 'electron-store';
import type { Config } from '../shared/types.js';
import { DEFAULT_CONFIG, normalizeConfig } from '../core/config.js';

const store = new Store<{ config: unknown }>({ name: 'config' });

export function loadConfig(): Config {
  try {
    return normalizeConfig(store.get('config', DEFAULT_CONFIG));
  } catch (error) {
    // This app has no window to show an error in. Every I/O path here
    // degrades to a working default rather than throwing into a tick handler
    // and killing a process the user cannot see die.
    console.error('failed to read config, falling back to defaults:', error);
    return normalizeConfig({});
  }
}

export function saveConfig(patch: Partial<Config>): Config {
  const next = normalizeConfig({ ...loadConfig(), ...patch });
  try {
    store.set('config', next);
  } catch (error) {
    console.error('failed to persist config, continuing in memory:', error);
  }
  return next;
}
