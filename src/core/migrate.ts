import { DEFAULT_CONFIG } from './config.js';
export interface MigrationEffects {
  /** Lines lifted out of a v1 config; the shell writes them to a pack file. */
  writeCustomPack?: string[];
}

export interface Migrated {
  raw: Record<string, unknown>;
  effects: MigrationEffects;
}

const CURRENT = 2;

/** The pack the v1 customLines migration writes. Its id is also its filename. */
const CUSTOM_PACK_ID = 'custom';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? { ...(value as Record<string, unknown>) } : {};
}

/**
 * Reads the stored `version` and brings the shape forward. Takes `unknown`
 * and never throws: the input is a file the user may have hand-edited, and
 * this runs before the app has any window to report an error in.
 *
 * Migration is not recorded here. The caller persists the result only after
 * every effect has been performed, so a failed effect leaves the file at its
 * old version and the migration is retried on the next launch.
 */
export function migrateConfig(raw: unknown): Migrated {
  const r = asRecord(raw);
  const effects: MigrationEffects = {};
  const version = typeof r.version === 'number' && Number.isFinite(r.version) ? r.version : 1;

  if (version < 2) {
    const lines = Array.isArray(r.customLines)
      ? (r.customLines as unknown[]).filter((s): s is string => typeof s === 'string')
      : [];
    if (lines.length > 0) {
      effects.writeCustomPack = lines;
      // Writing the file is only half the move. v1 appended the custom pack
      // whenever customLines was non-empty, so the user's own lines were
      // always live; a v2 config that does not list `custom` retires them at
      // the moment of upgrade, silently, with the file sitting right there.
      const listed = Array.isArray(r.activePackIds)
        ? (r.activePackIds as unknown[]).filter((s): s is string => typeof s === 'string')
        : [];
      const ids = listed.length > 0 ? listed : [...DEFAULT_CONFIG.activePackIds];
      r.activePackIds = ids.includes(CUSTOM_PACK_ID) ? ids : [...ids, CUSTOM_PACK_ID];
    }
    delete r.customLines;
  }

  if (version < CURRENT) r.version = CURRENT;
  return { raw: r, effects };
}
