import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import { BACKUP_TABLES } from '@/domain/backup/constants'
import { seedTestDb } from '@/test/seedTestDb'
import { exportBackup } from '../exportBackup'

const NOW = '2026-01-06T09:00:00.000Z'

beforeEach(async () => {
  await resetDatabase()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('exportBackup reads every table inside one shared transaction', () => {
  it('every BACKUP_TABLES read happens against the same Dexie transaction instance', async () => {
    await seedTestDb({ withHistory: true })

    const seenTransactions = new Set<unknown>()
    for (const tableName of BACKUP_TABLES) {
      const table = db.table(tableName)
      // Cast needed only because the mock's own async wrapper widens Dexie's
      // `PromiseExtended` return type to a plain `Promise` — the runtime
      // behavior (and what `exportBackup` actually calls) is unaffected.
      vi.spyOn(table, 'toArray').mockImplementation((async () => {
        seenTransactions.add(Dexie.currentTransaction)
        return table.toCollection().toArray()
      }) as unknown as typeof table.toArray)
    }

    await exportBackup(NOW, '1.0.0')

    // A torn export (independent per-table transactions) would show a
    // distinct transaction per table (or `null`, outside any transaction).
    // A single read transaction over all of BACKUP_TABLES — which is what
    // makes the read atomic against concurrent writes — shows exactly one.
    expect(seenTransactions.size).toBe(1)
    expect([...seenTransactions][0]).not.toBeNull()
  })

  it('a write committing mid-export cannot produce a child row without its parent in the exported file', async () => {
    await seedTestDb({ withHistory: true })
    const instance = await db.workoutInstances.toCollection().first()
    if (!instance) throw new Error('expected at least one seeded workoutInstance')

    let writeSettled: Promise<void> | undefined

    // `workoutInstances` is read two tables before its child `strengthSets`
    // in BACKUP_TABLES. Firing the concurrent write the instant the parent
    // table's read resolves — deliberately NOT awaited here — gives it a
    // window to land after the parent snapshot is taken but before the
    // child table is read, which is exactly the interleaving a torn,
    // non-transactional export is vulnerable to.
    const parentTable = db.table('workoutInstances')
    const spy = vi.spyOn(parentTable, 'toArray').mockImplementation((async (): Promise<unknown[]> => {
      const result: unknown[] = await parentTable.toCollection().sortBy('id')
      // `Dexie.ignoreTransaction` steps outside the export's own ambient
      // transaction zone — without it, this write would be nested inside
      // the read transaction's PSD scope (an artifact of firing it from
      // inside a mocked table method) and Dexie would reject it outright as
      // an incompatible sub-transaction. A real concurrent write (a
      // component's autosave, `syncQueue`) is never nested this way; it is a
      // genuinely independent transaction on an unrelated call stack, so
      // this reproduces that shape rather than the mocking artifact.
      writeSettled = Dexie.ignoreTransaction(
        () => db.transaction('rw', db.workoutInstances, db.strengthSets, async () => {
          await db.workoutInstances.add({ ...instance, id: 'concurrent-instance', frozen: false })
          await db.strengthSets.add({
            id: 'concurrent-set',
            instanceId: 'concurrent-instance',
            instancePrescriptionId: 'concurrent-prescription',
            exerciseId: 'ex_back_squat',
            setIndex: 0,
            isCompleted: false,
            isWarmup: false,
          })
        }),
      )
      return result
    }) as unknown as typeof parentTable.toArray)

    const { json } = await exportBackup(NOW, '1.0.0')
    spy.mockRestore()

    // The concurrent write must actually complete before this test's
    // assertions run, whichever side of the export it landed on.
    expect(writeSettled).toBeDefined()
    await writeSettled

    const file = JSON.parse(json) as { data: Record<string, Array<Record<string, unknown>>> }
    const exportedInstanceIds = new Set((file.data.workoutInstances ?? []).map((row) => row.id))
    for (const set of file.data.strengthSets ?? []) {
      expect(exportedInstanceIds.has(set.instanceId)).toBe(true)
    }
  })
})
