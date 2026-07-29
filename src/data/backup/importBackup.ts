import { db, SCHEMA_VERSION } from '@/data/db'
import { updateSettings } from '@/data/repositories/settingsRepo'
import type { ISOInstant } from '@/data/types'
import { BACKUP_TABLES } from '@/domain/backup/constants'
import { validateBackup } from '@/domain/backup/validate'
import type { ValidationFailure } from '@/domain/backup/validate'
import { exportBackup } from './exportBackup'

/** Tag written into the pre-import safety snapshot's own `appVersion` field
 * so a snapshot's JSON is recognizable at a glance (in DevTools, or in an
 * exported file) as "the last state before an import", distinct from a
 * normal export's real app version. `SafetySnapshotPanel` (C3) does feed this
 * same JSON back through `validateBackup`/`importBackup` when the athlete
 * taps "Restore snapshot" — it is a completely ordinary backup file in every
 * way that matters to validation, just tagged for provenance. */
const SAFETY_SNAPSHOT_TAG = 'pre-import-snapshot'

export type ImportResult =
  | { ok: true; counts: Record<string, number> }
  | { ok: false; failure: ValidationFailure }

/**
 * Validates `raw` fully before touching anything — a rejected import
 * performs ZERO writes, which is what makes attempting an import safe. Only
 * once `validateBackup` succeeds does this:
 *
 * 1. Snapshot every current portable table into a `safetyBackups` row
 *    (`id: 'pre-import'`) — the last chance to recover today's data if the
 *    import turns out to be a mistake.
 * 2. Inside one Dexie transaction: clear every `BACKUP_TABLES` table and
 *    `bulkPut` the imported rows, then bump `settings.schemaVersion` to the
 *    current `SCHEMA_VERSION` (an older imported backup's data is thereby
 *    migrated forward; `settings.lastBackupAt`, which lives on the same row,
 *    passes through untouched because it belongs to the imported file, not
 *    to this import).
 *
 * `safetyBackups` is deliberately outside `BACKUP_TABLES` (see that
 * constant's doc comment), so the snapshot this function just wrote in step
 * 1 is never itself cleared or overwritten by step 2.
 */
export async function importBackup(raw: string, now: ISOInstant): Promise<ImportResult> {
  const validation = validateBackup(raw)
  if (!validation.ok) return { ok: false, failure: validation.failure }
  const { file } = validation

  const safetySnapshot = await exportBackup(now, SAFETY_SNAPSHOT_TAG)
  await db.safetyBackups.put({ id: 'pre-import', at: now, json: safetySnapshot.json })

  const counts: Record<string, number> = {}
  const tables = BACKUP_TABLES.map((name) => db.table(name))

  await db.transaction('rw', tables, async () => {
    for (const table of tables) await table.clear()
    for (const tableName of BACKUP_TABLES) {
      const rows = file.data[tableName] ?? []
      counts[tableName] = rows.length
      if (rows.length > 0) await db.table(tableName).bulkPut(rows)
    }
    await updateSettings({ schemaVersion: SCHEMA_VERSION })
  })

  return { ok: true, counts }
}
