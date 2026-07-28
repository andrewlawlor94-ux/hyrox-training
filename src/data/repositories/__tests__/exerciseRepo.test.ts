import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import type { Exercise } from '@/data/types'
import {
  archiveExercise, createExercise, duplicateExercise, exerciseHistory, listExercises, restoreExercise, updateExercise,
} from '../exerciseRepo'

const NOW = '2026-07-27T10:00:00.000Z'

function baseExerciseInput(overrides: Partial<Exercise> = {}): Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'isSeeded'> {
  return {
    name: 'Back Squat', category: 'squat', measurementType: 'strengthSets', loadStyle: 'totalBarbell',
    defaultUnit: 'lb', defaultRestSec: 150, progressionIncrement: 5, incrementUnit: 'lb',
    defaultSets: 4, repMin: 4, repMax: 6, techniqueNotes: '', isArchived: false,
    ...overrides,
  }
}

beforeEach(async () => { await resetDatabase() })

describe('exerciseRepo', () => {
  it('createExercise assigns an id, timestamps, and isSeeded: false', async () => {
    const ex = await createExercise(baseExerciseInput(), NOW)
    expect(ex.id).toBeTruthy()
    expect(ex.createdAt).toBe(NOW)
    expect(ex.updatedAt).toBe(NOW)
    expect(ex.isSeeded).toBe(false)
  })

  it('duplicateExercise copies fields, appends " (copy)" to the name, and produces a new id', async () => {
    const source = await createExercise(baseExerciseInput({ name: 'Bench Press' }), NOW)
    const copy = await duplicateExercise(source.id, NOW)
    expect(copy.id).not.toBe(source.id)
    expect(copy.name).toBe('Bench Press (copy)')
    expect(copy.category).toBe(source.category)
    expect(copy.isSeeded).toBe(false)
  })

  it('archiveExercise / restoreExercise flip isArchived without deleting', async () => {
    const ex = await createExercise(baseExerciseInput(), NOW)
    await archiveExercise(ex.id, NOW)
    expect((await db.exercises.get(ex.id))?.isArchived).toBe(true)
    await restoreExercise(ex.id, NOW)
    expect((await db.exercises.get(ex.id))?.isArchived).toBe(false)
    expect(await db.exercises.get(ex.id)).toBeDefined()
  })

  it('listExercises excludes archived by default, includes them on request', async () => {
    const active = await createExercise(baseExerciseInput({ name: 'Active' }), NOW)
    const archived = await createExercise(baseExerciseInput({ name: 'Archived' }), NOW)
    await archiveExercise(archived.id, NOW)

    const defaultList = await listExercises()
    expect(defaultList.map((e) => e.id)).toContain(active.id)
    expect(defaultList.map((e) => e.id)).not.toContain(archived.id)

    const withArchived = await listExercises({ includeArchived: true })
    expect(withArchived.map((e) => e.id)).toContain(archived.id)
  })

  it('listExercises filters by category and by case-insensitive search', async () => {
    await createExercise(baseExerciseInput({ name: 'Back Squat', category: 'squat' }), NOW)
    await createExercise(baseExerciseInput({ name: 'Bench Press', category: 'press' }), NOW)

    const squats = await listExercises({ category: 'squat' })
    expect(squats).toHaveLength(1)
    expect(squats[0]?.name).toBe('Back Squat')

    const searched = await listExercises({ search: 'bench' })
    expect(searched).toHaveLength(1)
    expect(searched[0]?.name).toBe('Bench Press')
  })

  it('updateExercise changing defaultRestSec does not alter any existing InstancePrescription.restSec', async () => {
    const ex = await createExercise(baseExerciseInput({ defaultRestSec: 150 }), NOW)
    await db.instancePrescriptions.add({
      id: 'ip_1', instanceId: 'wi_1', exerciseId: ex.id, order: 0, restSec: 150, templateId: 'tmpl_1',
    })
    await updateExercise(ex.id, { defaultRestSec: 200 }, NOW)
    expect((await db.exercises.get(ex.id))?.defaultRestSec).toBe(200)
    expect((await db.instancePrescriptions.get('ip_1'))?.restSec).toBe(150)
  })

  it('updateExercise changing progressionIncrement does not alter any completed StrengthSet', async () => {
    const ex = await createExercise(baseExerciseInput({ progressionIncrement: 5 }), NOW)
    const set = {
      id: 'set_1', instanceId: 'wi_1', instancePrescriptionId: 'ip_1', exerciseId: ex.id, setIndex: 0,
      weight: 175, unit: 'lb' as const, reps: 5, isCompleted: true, completedAt: NOW, isWarmup: false,
    }
    await db.strengthSets.add(set)
    await updateExercise(ex.id, { progressionIncrement: 10 }, NOW)
    expect(await db.strengthSets.get('set_1')).toEqual(set)
  })

  it('a custom exercise retains its rest default when added to a new workout', async () => {
    const ex = await createExercise(baseExerciseInput({ name: 'Custom Curl', defaultRestSec: 60 }), NOW)
    expect((await db.exercises.get(ex.id))?.defaultRestSec).toBe(60)
  })

  describe('exerciseHistory', () => {
    it('excludes warm-up sets, even when the warm-up is heavier than the working sets', async () => {
      const ex = await createExercise(baseExerciseInput(), NOW)
      // A warm-up at 225 lb, heavier than the 175 lb working set that follows.
      // If the guard leaks, the recommendation engine's "first completed set
      // is the working weight" contract would read 225 as the working load.
      await db.strengthSets.bulkAdd([
        {
          id: 'set_warmup', instanceId: 'wi_1', instancePrescriptionId: 'ip_1', exerciseId: ex.id, setIndex: 0,
          weight: 225, unit: 'lb', reps: 3, isCompleted: true, completedAt: '2026-07-27T09:00:00.000Z', isWarmup: true,
        },
        {
          id: 'set_working', instanceId: 'wi_1', instancePrescriptionId: 'ip_1', exerciseId: ex.id, setIndex: 1,
          weight: 175, unit: 'lb', reps: 5, isCompleted: true, completedAt: '2026-07-27T09:05:00.000Z', isWarmup: false,
        },
      ])
      const history = await exerciseHistory(ex.id)
      expect(history).toHaveLength(1)
      expect(history[0]?.sets).toHaveLength(1)
      expect(history[0]?.sets[0]?.weight).toBe(175)
    })

    it('excludes sets that are not completed', async () => {
      const ex = await createExercise(baseExerciseInput(), NOW)
      await db.strengthSets.add({
        id: 'set_uncompleted', instanceId: 'wi_1', instancePrescriptionId: 'ip_1', exerciseId: ex.id, setIndex: 0,
        weight: 175, unit: 'lb', reps: 5, isCompleted: false, isWarmup: false,
      })
      expect(await exerciseHistory(ex.id)).toHaveLength(0)
    })

    it('groups sets by instance into separate sessions', async () => {
      const ex = await createExercise(baseExerciseInput(), NOW)
      await db.strengthSets.bulkAdd([
        {
          id: 'set_a', instanceId: 'wi_1', instancePrescriptionId: 'ip_1', exerciseId: ex.id, setIndex: 0,
          weight: 175, unit: 'lb', reps: 5, isCompleted: true, completedAt: '2026-07-20T09:00:00.000Z', isWarmup: false,
        },
        {
          id: 'set_b', instanceId: 'wi_2', instancePrescriptionId: 'ip_2', exerciseId: ex.id, setIndex: 0,
          weight: 180, unit: 'lb', reps: 5, isCompleted: true, completedAt: '2026-07-27T09:00:00.000Z', isWarmup: false,
        },
      ])
      const history = await exerciseHistory(ex.id)
      expect(history).toHaveLength(2)
      expect(history.map((s) => s.date)).toEqual(['2026-07-20', '2026-07-27'])
    })
  })
})
