import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import { getSafetyBackup } from '../safetyBackupRepo'

const NOW = '2026-01-06T09:00:00.000Z'

beforeEach(async () => {
  await resetDatabase()
})

describe('getSafetyBackup', () => {
  it('resolves to null (not undefined) when no snapshot row exists', async () => {
    // Explicitly `null`, not merely falsy: a `useLiveQuery` consumer treats
    // its own `undefined` as "still loading", so if this resolved to
    // `undefined` too, a genuinely-absent snapshot would be indistinguishable
    // from a query still in flight and a live-query-driven panel would never
    // leave its loading state.
    const result = await getSafetyBackup()
    expect(result).toBeNull()
  })

  it('resolves to the stored row once one exists', async () => {
    await db.safetyBackups.put({ id: 'pre-import', at: NOW, json: '{"format":"hyrox-training-backup"}' })
    const result = await getSafetyBackup()
    expect(result?.at).toBe(NOW)
    expect(result?.json).toContain('hyrox-training-backup')
  })
})
