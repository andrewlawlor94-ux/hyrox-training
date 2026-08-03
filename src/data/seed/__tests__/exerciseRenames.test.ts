import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import { SEED_EXERCISES } from '../exercises'
import { SEED_EXERCISE_RENAMES } from '../exerciseRenames'
import { reconcileSeededNames, seedIfEmpty } from '../seedRunner'

const NOW = '2026-08-03T09:00:00.000Z'
const LATER = '2026-08-04T09:00:00.000Z'

beforeEach(async () => { await resetDatabase() })

/**
 * The athlete asked to rename Split squat to Bulgarian split squat, "just change
 * name but keep records and where they are in workouts".
 *
 * The trap this guards: `seedIfEmpty` deliberately never touches a table that
 * already has rows, so renaming in `SEED_EXERCISES` alone leaves every existing
 * athlete on the old name forever. `reconcileSeededNames` is the one thing that
 * reaches an already-seeded database.
 */
describe('seeded exercise renames', () => {
  it('renames a row seeded under the OLD name, on a database that already has content', async () => {
    // Simulate a database seeded before the rename: same id, previous name.
    const rename = SEED_EXERCISE_RENAMES[0]
    if (!rename) throw new Error('expected at least one rename to test')
    const current = SEED_EXERCISES.find((e) => e.id === rename.id)
    if (!current) throw new Error(`no seeded exercise "${rename.id}"`)
    await db.exercises.put({ ...current, name: rename.from, createdAt: NOW, updatedAt: NOW })

    const renamed = await reconcileSeededNames(db, LATER)

    expect(renamed).toContain(rename.id)
    const after = await db.exercises.get(rename.id)
    expect(after?.name).toBe(rename.to)
    // The ID is what history references, so it must be untouched.
    expect(after?.id).toBe(rename.id)
    expect(after?.updatedAt).toBe(LATER)
  })

  it('keeps every logged set and prescription pointing at the renamed exercise', async () => {
    const rename = SEED_EXERCISE_RENAMES[0]
    if (!rename) throw new Error('expected a rename')
    const current = SEED_EXERCISES.find((e) => e.id === rename.id)
    if (!current) throw new Error('missing seeded exercise')
    await db.exercises.put({ ...current, name: rename.from, createdAt: NOW, updatedAt: NOW })

    // A completed set and a prescription referencing it, as a real history would.
    await db.instancePrescriptions.add({
      id: 'ip_1', instanceId: 'wi_1', templateId: 'tmpl_1', exerciseId: rename.id, order: 1, restSec: 90,
    })
    await db.strengthSets.add({
      id: 'set_1', instanceId: 'wi_1', instancePrescriptionId: 'ip_1', exerciseId: rename.id,
      setIndex: 0, weight: 95, unit: 'lb', reps: 8, isCompleted: true, completedAt: NOW, isWarmup: false,
    })

    await reconcileSeededNames(db, LATER)

    // History survives byte-for-byte: only the exercise's display name moved.
    const set = await db.strengthSets.get('set_1')
    expect(set?.exerciseId).toBe(rename.id)
    expect(set?.weight).toBe(95)
    expect(set?.reps).toBe(8)
    expect((await db.instancePrescriptions.get('ip_1'))?.exerciseId).toBe(rename.id)
  })

  it('leaves a name the athlete chose themselves alone', async () => {
    const rename = SEED_EXERCISE_RENAMES[0]
    if (!rename) throw new Error('expected a rename')
    const current = SEED_EXERCISES.find((e) => e.id === rename.id)
    if (!current) throw new Error('missing seeded exercise')
    // Seeded rows stay editable in the library, so an athlete may well have
    // renamed this. Overwriting their wording would be worse than a stale name.
    await db.exercises.put({ ...current, name: 'My own squat name', createdAt: NOW, updatedAt: NOW })

    const renamed = await reconcileSeededNames(db, LATER)

    expect(renamed).toEqual([])
    expect((await db.exercises.get(rename.id))?.name).toBe('My own squat name')
  })

  it('is idempotent: a second pass renames nothing', async () => {
    await seedIfEmpty(db, NOW) // seeds with the CURRENT (new) names
    expect(await reconcileSeededNames(db, LATER)).toEqual([])
    expect(await reconcileSeededNames(db, LATER)).toEqual([])
  })

  it('every rename target matches the name actually shipped in SEED_EXERCISES', () => {
    // Guards the registry drifting from the seed: a `to` that no longer matches
    // would leave the two disagreeing about what the exercise is called.
    for (const rename of SEED_EXERCISE_RENAMES) {
      const seeded = SEED_EXERCISES.find((e) => e.id === rename.id)
      expect(seeded, `no seeded exercise "${rename.id}"`).toBeDefined()
      expect(seeded?.name, rename.id).toBe(rename.to)
      expect(rename.from).not.toBe(rename.to)
    }
  })
})
