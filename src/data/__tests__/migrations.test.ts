import { describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import { openDb, resetDatabase, SCHEMA_VERSION } from '../db'
import { MIGRATIONS } from '../migrations'

describe('migration chain', () => {
  it('declares one entry per schema version with no gaps', () => {
    expect(MIGRATIONS.map((m) => m.version)).toEqual(
      Array.from({ length: SCHEMA_VERSION }, (_, i) => i + 1),
    )
  })

  it('preserves rows written under v1 when reopened through the chain', async () => {
    await resetDatabase()
    // Write through a bare v1 handle, mimicking data created by an earlier release.
    const legacy = new Dexie('hyrox-training')
    legacy.version(1).stores({ exercises: 'id, name, category, isArchived' })
    await legacy.open()
    await legacy.table('exercises').put({ id: 'ex_legacy', name: 'Legacy lift', category: 'squat' })
    legacy.close()

    const upgraded = await openDb()
    const row = await upgraded.exercises.get('ex_legacy')
    expect(row?.name).toBe('Legacy lift')
  })

  it('does not drop unrelated tables during an upgrade', async () => {
    const upgraded = await openDb()
    expect(upgraded.tables.length).toBeGreaterThan(20)
  })
})
