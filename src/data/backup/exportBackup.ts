import { db, SCHEMA_VERSION } from '@/data/db'
import { BACKUP_FORMAT, BACKUP_TABLES } from '@/domain/backup/constants'
import type { ISOInstant } from '@/data/types'

/**
 * Reads every portable table (`BACKUP_TABLES` — everything except
 * `safetyBackups`, which is machine-local; see that constant's doc comment)
 * via `db.table(name)`, builds a `counts` entry per table, and serializes
 * with two-space indentation so an athlete who opens the file can actually
 * read their own training history in it.
 */
export async function exportBackup(
  now: ISOInstant,
  appVersion: string,
): Promise<{ json: string; counts: Record<string, number> }> {
  const data: Record<string, unknown[]> = {}
  const counts: Record<string, number> = {}

  for (const tableName of BACKUP_TABLES) {
    const rows = await db.table(tableName).toArray()
    data[tableName] = rows
    counts[tableName] = rows.length
  }

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
