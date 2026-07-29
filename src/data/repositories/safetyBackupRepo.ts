import { db } from '@/data/db'
import type { SafetyBackup } from '@/data/types'

/**
 * Reads the single pre-import safety snapshot `importBackup` writes just
 * before it clears every `BACKUP_TABLES` table (see that function's doc
 * comment). Before C3 this row had no non-test reader anywhere in `src` —
 * recovering from a mistaken import needed DevTools — so this is what lets
 * Settings surface it as a normal, restorable/exportable item instead.
 *
 * Returns `null` (never `undefined`) when no snapshot exists yet — callers
 * that feed this straight into `useLiveQuery` rely on that: `useLiveQuery`
 * itself reports "still loading" as `undefined`, so if this resolved to
 * `undefined` too, a genuinely-absent snapshot would be indistinguishable
 * from a query still in flight and the panel would never leave its loading
 * state (verified directly — the very bug this comment now guards against).
 */
export async function getSafetyBackup(): Promise<SafetyBackup | null> {
  const row = await db.safetyBackups.get('pre-import')
  return row ?? null
}
