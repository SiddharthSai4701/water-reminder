import Store from 'electron-store';
import type { Config } from '../shared/types.js';
import { DEFAULT_CONFIG, normalizeConfig } from '../core/config.js';

const store = new Store<{ config: unknown }>({ name: 'config' });

export function loadConfig(): Config {
  return normalizeConfig(store.get('config', DEFAULT_CONFIG));
}

export function saveConfig(patch: Partial<Config>): Config {
  const next = normalizeConfig({ ...loadConfig(), ...patch });
  store.set('config', next);
  return next;
}
