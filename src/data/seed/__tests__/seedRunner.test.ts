import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import { SEED_EXERCISES } from '../exercises'
import { SEED_HYROX_STANDARDS } from '../hyroxStandards'
import { seedIfEmpty } from '../seedRunner'

const NOW = '2026-01-05T00:00:00.000Z'

beforeEach(async () => { await resetDatabase() })

describe('seedIfEmpty', () => {
  it('inserts every seeded exercise and standard into an empty database', async () => {
    const result = await seedIfEmpty(db, NOW)

    expect(result).toEqual({ exercises: SEED_EXERCISES.length, standards: SEED_HYROX_STANDARDS.length })
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length)
    expect(await db.hyroxStandards.count()).toBe(SEED_HYROX_STANDARDS.length)
  })

  it('stamps seeded rows with the supplied `now`', async () => {
    await seedIfEmpty(db, NOW)
    const row = await db.exercises.get(SEED_EXERCISES[0].id)

    expect(row?.createdAt).toBe(NOW)
    expect(row?.updatedAt).toBe(NOW)
  })

  it('is a no-op when both tables are already populated', async () => {
    await seedIfEmpty(db, NOW)

    const result = await seedIfEmpty(db, NOW)

    expect(result).toEqual({ exercises: 0, standards: 0 })
    expect(await db.exercises.count()).toBe(SEED_EXERCISES.length)
    expect(await db.hyroxStandards.count()).toBe(SEED_HYROX_STANDARDS.length)
  })

  // The discriminating case: a broken implementation that always
  // `bulkPut`s the seed arrays (rather than gating on `count() === 0`)
  // would pass every "no-op" count assertion above -- bulkPut upserts by id,
  // so counts stay identical even as it silently reverts an edited row. Only
  // reading the row content back proves the edit survived a second boot.
  it('preserves a user-edited row across a second seed call', async () => {
    await seedIfEmpty(db, NOW)
    const target = SEED_EXERCISES[0]
    await db.exercises.update(target.id, { defaultRestSec: 999 })

    await seedIfEmpty(db, NOW)

    const reloaded = await db.exercises.get(target.id)
    expect(reloaded?.defaultRestSec).toBe(999)
  })

  it('preserves a user-edited standard across a second seed call', async () => {
    await seedIfEmpty(db, NOW)
    const target = SEED_HYROX_STANDARDS[0]
    await db.hyroxStandards.update(target.id, { notes: 'edited by athlete' })

    await seedIfEmpty(db, NOW)

    const reloaded = await db.hyroxStandards.get(target.id)
    expect(reloaded?.notes).toBe('edited by athlete')
  })

  it('never re-inserts a row the user deleted, and never touches the rest', async () => {
    await seedIfEmpty(db, NOW)
    const deletedId = SEED_EXERCISES[0].id
    await db.exercises.delete(deletedId)
    const countAfterDelete = await db.exercises.count()

    await seedIfEmpty(db, NOW)

    expect(await db.exercises.count()).toBe(countAfterDelete)
    expect(await db.exercises.get(deletedId)).toBeUndefined()
  })

  it('seeds each table independently based on its own emptiness', async () => {
    // Pre-populate exercises by hand; leave standards untouched (empty).
    await db.exercises.bulkPut(SEED_EXERCISES.map((e) => ({ ...e, createdAt: NOW, updatedAt: NOW })))

    const result = await seedIfEmpty(db, NOW)

    expect(result).toEqual({ exercises: 0, standards: SEED_HYROX_STANDARDS.length })
    expect(await db.hyroxStandards.count()).toBe(SEED_HYROX_STANDARDS.length)
  })
})
