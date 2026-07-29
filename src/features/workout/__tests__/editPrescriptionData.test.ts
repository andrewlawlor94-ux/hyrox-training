import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import type { Exercise, InstancePrescription, WorkoutInstance, WorkoutTemplate } from '@/data/types'
import { EDIT_SCOPE_OPTIONS, effectiveValues, loadEditSheetData } from '../editPrescriptionData'

const NOW = '2026-07-27T10:00:00.000Z'

const STRENGTH_EXERCISE: Exercise = {
  id: 'ex_strength', name: 'Back Squat', category: 'squat', measurementType: 'strengthSets', loadStyle: 'totalBarbell',
  defaultUnit: 'lb', defaultRestSec: 150, progressionIncrement: 5, incrementUnit: 'lb',
  defaultSets: 4, repMin: 4, repMax: 6, techniqueNotes: '', isArchived: false, isSeeded: false,
  createdAt: NOW, updatedAt: NOW,
}

const STATION_EXERCISE: Exercise = {
  id: 'ex_station', name: 'Sled Push', category: 'sled', measurementType: 'distance', loadStyle: 'custom',
  defaultUnit: 'kg', defaultRestSec: 90, progressionIncrement: 0, incrementUnit: 'kg',
  techniqueNotes: '', isArchived: false, isSeeded: false, createdAt: NOW, updatedAt: NOW,
}

describe('effectiveValues', () => {
  it('falls back to the exercise default when the prescription omits a field', () => {
    const prescription: InstancePrescription = {
      id: 'ip_1', instanceId: 'wi_1', templateId: 'tmpl_1', exerciseId: 'ex_strength', order: 0, restSec: 150,
    }
    expect(effectiveValues(prescription, STRENGTH_EXERCISE)).toEqual({
      sets: 4, repMin: 4, repMax: 6, restSec: 150, targetLoad: null, targetRir: null,
    })
  })

  it('prefers the prescription snapshot over the exercise default when both are present', () => {
    const prescription: InstancePrescription = {
      id: 'ip_1', instanceId: 'wi_1', templateId: 'tmpl_1', exerciseId: 'ex_strength', order: 0,
      restSec: 200, sets: 5, repMin: 3, repMax: 5, targetLoad: 185, targetRir: 2,
    }
    expect(effectiveValues(prescription, STRENGTH_EXERCISE)).toEqual({
      sets: 5, repMin: 3, repMax: 5, restSec: 200, targetLoad: 185, targetRir: 2,
    })
  })

  it('never falls back to an exercise field for targetLoad/targetRir -- there is no such exercise default', () => {
    const prescription: InstancePrescription = {
      id: 'ip_1', instanceId: 'wi_1', templateId: 'tmpl_1', exerciseId: 'ex_strength', order: 0, restSec: 150,
    }
    const withHighDefaults: Exercise = { ...STRENGTH_EXERCISE, defaultSets: 10 }
    expect(effectiveValues(prescription, withHighDefaults).targetLoad).toBeNull()
    expect(effectiveValues(prescription, withHighDefaults).targetRir).toBeNull()
  })
})

describe('EDIT_SCOPE_OPTIONS', () => {
  it('offers exactly the three scopes worded plainly', () => {
    expect(EDIT_SCOPE_OPTIONS).toEqual([
      { value: 'thisWorkout', label: 'Just this workout' },
      { value: 'thisAndFuture', label: 'This and future sessions' },
      { value: 'exerciseDefaultOnly', label: 'Change the exercise default only' },
    ])
  })
})

describe('loadEditSheetData', () => {
  beforeEach(async () => {
    await resetDatabase()
    await db.exercises.bulkAdd([STRENGTH_EXERCISE, STATION_EXERCISE])
  })

  it('returns undefined for a missing instance', async () => {
    expect(await loadEditSheetData('no_such_instance')).toBeUndefined()
  })

  it('includes only strengthSets prescriptions, in order, excluding stations', async () => {
    const instance: WorkoutInstance = {
      id: 'wi_1', planId: 'plan_1', templateId: 'tmpl_1', weekNumber: 1, sessionSlot: 1,
      plannedDate: '2026-07-27', scheduledDate: '2026-07-27', sequence: 0, priority: 'essential',
      recoveryTags: [], status: 'available', isManualOverride: false, frozen: false,
    }
    await db.workoutInstances.add(instance)
    const template: WorkoutTemplate = {
      id: 'tmpl_1', planId: 'plan_1', planWeekId: 'week_1', sessionSlot: 1, sequenceInWeek: 0,
      name: 'Strength A', kind: 'strength', priority: 'essential', recoveryTags: [], estMinutes: 45, notes: '',
    }
    await db.workoutTemplates.add(template)
    const prescriptions: InstancePrescription[] = [
      { id: 'ip_station', instanceId: 'wi_1', templateId: 'tmpl_1', exerciseId: 'ex_station', order: 0, restSec: 90 },
      { id: 'ip_strength', instanceId: 'wi_1', templateId: 'tmpl_1', exerciseId: 'ex_strength', order: 1, restSec: 150 },
    ]
    await db.instancePrescriptions.bulkAdd(prescriptions)

    const data = await loadEditSheetData('wi_1')
    expect(data?.instance).toEqual(instance)
    expect(data?.candidates).toHaveLength(1)
    expect(data?.candidates[0]?.prescription.id).toBe('ip_strength')
    expect(data?.candidates[0]?.exercise.id).toBe('ex_strength')
  })
})
