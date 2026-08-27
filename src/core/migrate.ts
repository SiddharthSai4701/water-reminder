export interface MigrationEffects {
  /** Lines lifted out of a v1 config; the shell writes them to a pack file. */
  writeCustomPack?: string[];
}

export interface Migrated {
  raw: Record<string, unknown>;
  effects: MigrationEffects;
}

const CURRENT = 2;

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
    if (lines.length > 0) effects.writeCustomPack = lines;
    delete r.customLines;
  }

  if (version < CURRENT) r.version = CURRENT;
  return { raw: r, effects };
}
