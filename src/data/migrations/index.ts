import { v1 } from './v1'

/**
 * Ordered migration chain, one entry per schema version, applied in order by
 * `HyroxDb` via `db.version(m.version).stores(m.stores)`. To add version 2:
 * create `migrations/v2.ts` exporting `{ version: 2, stores: STORES_V2 }`
 * (a copy of STORES_V1 from schema.ts with the new/changed index strings),
 * append it here, and bump `SCHEMA_VERSION` in schema.ts. Never edit an
 * already-shipped entry — Dexie replays every version in order against an
 * existing database, so rewriting history here would corrupt upgrades for
 * athletes already past that version.
 */
export const MIGRATIONS = [v1] as const
