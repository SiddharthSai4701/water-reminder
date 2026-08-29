import { describe, expect, it } from 'vitest';
import { migrateConfig } from '../../src/core/migrate.js';

describe('migrateConfig', () => {
  it('treats a config with no version as v1', () => {
    const { raw } = migrateConfig({ goalMl: 3000 });
    expect(raw.version).toBe(2);
    expect(raw.goalMl).toBe(3000);
  });

  it('moves v1 customLines into a pack-write effect', () => {
    const { raw, effects } = migrateConfig({
      version: 1,
      customLines: ['Drink up.', 'Still thirsty.'],
    });
    expect(effects.writeCustomPack).toEqual(['Drink up.', 'Still thirsty.']);
    expect(raw.customLines).toBeUndefined();
  });

  it('emits no effect when v1 had no custom lines', () => {
    const { effects } = migrateConfig({ version: 1, customLines: [] });
    expect(effects.writeCustomPack).toBeUndefined();
  });

  it('leaves a v2 config alone', () => {
    const { raw, effects } = migrateConfig({ version: 2, goalMl: 4000 });
    expect(raw).toEqual({ version: 2, goalMl: 4000 });
    expect(effects).toEqual({});
  });

  it('does not throw on arbitrary junk', () => {
    expect(() => migrateConfig(null)).not.toThrow();
    expect(() => migrateConfig(7)).not.toThrow();
    expect(migrateConfig('nonsense').raw.version).toBe(2);
  });
});

describe('migrating customLines keeps them in rotation', () => {
  it('activates the custom pack it just created', () => {
    // v1 appended the custom pack whenever customLines was non-empty, so those
    // lines were always live. Writing them to a file the config does not list
    // retires the user's own writing silently, on upgrade, with nothing shown.
    const { raw } = migrateConfig({ customLines: ['Mine.'], activePackIds: ['sarcastic'] });
    expect(raw.activePackIds).toEqual(['sarcastic', 'custom']);
  });

  it('keeps the default pack when v1 listed none', () => {
    const { raw } = migrateConfig({ customLines: ['Mine.'] });
    expect(raw.activePackIds).toEqual(['sarcastic', 'custom']);
  });

  it('does not add it twice', () => {
    const { raw } = migrateConfig({ customLines: ['Mine.'], activePackIds: ['custom'] });
    expect(raw.activePackIds).toEqual(['custom']);
  });

  it('leaves activePackIds alone when there were no custom lines', () => {
    const { raw } = migrateConfig({ activePackIds: ['deadpan'] });
    expect(raw.activePackIds).toEqual(['deadpan']);
  });
});
