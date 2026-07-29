import { db } from '@/data/db'
import { BACKUP_TABLES } from '@/domain/backup/constants'

/**
 * Current row count per `BACKUP_TABLES` table, read directly from the live
 * database — used only to show "this device has N record(s)" in the C1
 * import confirmation before any write happens. Deliberately a `count()`
 * per table rather than a shared transaction like `exportBackup`: nothing
 * here is written to disk or validated against, so a torn read across
 * tables only risks a slightly-stale display number, not data loss.
 */
export async function currentBackupCounts(): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const tableName of BACKUP_TABLES) {
    counts[tableName] = await db.table(tableName).count()
  }
  return counts
}
