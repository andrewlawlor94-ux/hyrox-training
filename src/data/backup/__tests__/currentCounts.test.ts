import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import { BACKUP_TABLES } from '@/domain/backup/constants'
import { seedTestDb } from '@/test/seedTestDb'
import { currentBackupCounts } from '../currentCounts'

beforeEach(async () => {
  await resetDatabase()
})

describe('currentBackupCounts', () => {
  it('reports one count per BACKUP_TABLES table matching the live database', async () => {
    await seedTestDb({ withHistory: true })

    const counts = await currentBackupCounts()

    for (const table of BACKUP_TABLES) {
      expect(counts[table]).toBe(await db.table(table).count())
    }
    expect(counts.workoutInstances).toBeGreaterThan(0)
    expect(counts.strengthSets).toBeGreaterThan(0)
  })

  it('is all zero against a freshly reset (empty) database', async () => {
    const counts = await currentBackupCounts()
    for (const table of BACKUP_TABLES) expect(counts[table]).toBe(0)
  })
})
