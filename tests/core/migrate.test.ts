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
