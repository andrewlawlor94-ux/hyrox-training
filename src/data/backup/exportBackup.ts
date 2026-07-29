import { db, SCHEMA_VERSION } from '@/data/db'
import { BACKUP_FORMAT, BACKUP_TABLES } from '@/domain/backup/constants'
import type { ISOInstant } from '@/data/types'

/**
 * Reads every portable table (`BACKUP_TABLES` — everything except
 * `safetyBackups`, which is machine-local; see that constant's doc comment)
 * via `db.table(name)`, builds a `counts` entry per table, and serializes
 * with two-space indentation so an athlete who opens the file can actually
 * read their own training history in it.
 *
 * All 22 reads run inside one shared `'r'` transaction over every
 * `BACKUP_TABLES` table. Without that, each `db.table(name).toArray()` opens
 * its own independent transaction, and a write (e.g. the 250ms autosave
 * debounce, or `useHomeData`'s fire-and-forget `syncQueue`) can commit
 * between two of those reads — producing a file where, say, a
 * `workoutInstances` row is missing but a `strengthSets` row that names it
 * as `instanceId` is present. That file passes its own count check (the
 * counts are computed from the same torn arrays) but fails `brokenReference`
 * on every future restore, permanently. A single read transaction gives the
 * whole export one consistent snapshot: IndexedDB queues any overlapping
 * write until the read transaction completes, so no write can land inside it.
 */
export async function exportBackup(
  now: ISOInstant,
  appVersion: string,
): Promise<{ json: string; counts: Record<string, number> }> {
  const data: Record<string, unknown[]> = {}
  const counts: Record<string, number> = {}
  const tables = BACKUP_TABLES.map((name) => db.table(name))

  await db.transaction('r', tables, async () => {
    for (const tableName of BACKUP_TABLES) {
      const rows = await db.table(tableName).toArray()
      data[tableName] = rows
      counts[tableName] = rows.length
    }
  })

  const file = {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion,
    exportedAt: now,
    counts,
    data,
  }

  return { json: JSON.stringify(file, null, 2), counts }
}
