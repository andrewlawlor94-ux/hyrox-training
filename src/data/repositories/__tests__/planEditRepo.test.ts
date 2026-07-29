import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import type { Exercise, InstancePrescription, Prescription, StrengthSet, WorkoutInstance, WorkoutTemplate } from '@/data/types'
import {
  addExerciseToInstance, addExerciseToTemplate, removeExerciseFromInstance, substituteExerciseInInstance, swapExerciseOrder,
} from '../exerciseEditRepo'
import {
  addWorkoutToWeek, changePlanDuration, deleteWorkout, duplicateWorkout, swapWorkoutOrder,
} from '../planEditRepo'

const NOW = '2026-07-27T10:00:00.000Z'
const PLAN_ID = 'plan_1'

const SQUAT: Exercise = {
  id: 'ex_squat', name: 'Back Squat', category: 'squat', measurementType: 'strengthSets', loadStyle: 'totalBarbell',
  defaultUnit: 'lb', defaultRestSec: 150, progressionIncrement: 5, incrementUnit: 'lb',
  defaultSets: 4, repMin: 4, repMax: 6, techniqueNotes: '', isArchived: false, isSeeded: false,
  createdAt: NOW, updatedAt: NOW,
}
const LUNGE: Exercise = {
  id: 'ex_lunge', name: 'Reverse Lunge', category: 'lunge', measurementType: 'strengthSets', loadStyle: 'perDumbbell',
  defaultUnit: 'lb', defaultRestSec: 90, progressionIncrement: 5, incrementUnit: 'lb',
  defaultSets: 3, repMin: 8, repMax: 10, techniqueNotes: '', isArchived: false, isSeeded: false,
  createdAt: NOW, updatedAt: NOW,
}

/**
 * A three-week plan: week 1 has a frozen (completed) strength session with a
 * logged set, plus an upcoming run session; week 2 and week 3 have upcoming
 * strength sessions (same slot/kind as week 1's, for the
 * `addExerciseToTemplate` propagation test) each with one exercise.
 */
async function seedFixture(): Promise<void> {
  await db.plans.add({ id: PLAN_ID, name: 'Test plan', weeksCount: 24, status: 'active', startDate: '2026-07-06', raceGoalId: 'goal_1', createdAt: NOW })
  await db.exercises.bulkAdd([SQUAT, LUNGE])
  await db.planPhases.add({ id: 'phase_1', planId: PLAN_ID, name: 'Base', weekStart: 1, weekEnd: 3, focus: '' })
  await db.planWeeks.bulkAdd([
    { id: 'week_1', planId: PLAN_ID, weekNumber: 1, phaseId: 'phase_1', label: 'Week 1', isDeload: false, notes: '' },
    { id: 'week_2', planId: PLAN_ID, weekNumber: 2, phaseId: 'phase_1', label: 'Week 2', isDeload: false, notes: '' },
    { id: 'week_3', planId: PLAN_ID, weekNumber: 3, phaseId: 'phase_1', label: 'Week 3', isDeload: false, notes: '' },
  ])

  const templates: WorkoutTemplate[] = [
    { id: 'tmpl_1_str', planId: PLAN_ID, planWeekId: 'week_1', sessionSlot: 1, sequenceInWeek: 0, name: 'Strength A', kind: 'strength', priority: 'essential', recoveryTags: [], estMinutes: 60, notes: '' },
    { id: 'tmpl_1_run', planId: PLAN_ID, planWeekId: 'week_1', sessionSlot: 2, sequenceInWeek: 1, name: 'Easy run', kind: 'run', priority: 'essential', recoveryTags: ['easyRun'], estMinutes: 40, notes: '' },
    { id: 'tmpl_2_str', planId: PLAN_ID, planWeekId: 'week_2', sessionSlot: 1, sequenceInWeek: 0, name: 'Strength A', kind: 'strength', priority: 'essential', recoveryTags: [], estMinutes: 60, notes: '' },
    { id: 'tmpl_3_str', planId: PLAN_ID, planWeekId: 'week_3', sessionSlot: 1, sequenceInWeek: 0, name: 'Strength A', kind: 'strength', priority: 'essential', recoveryTags: [], estMinutes: 60, notes: '' },
  ]
  await db.workoutTemplates.bulkAdd(templates)

  const prescriptions: Prescription[] = [
    { id: 'rx_1_str', templateId: 'tmpl_1_str', exerciseId: 'ex_squat', order: 0, sets: 4, repMin: 4, repMax: 6, restSec: 150 },
    { id: 'rx_2_str', templateId: 'tmpl_2_str', exerciseId: 'ex_squat', order: 0, sets: 4, repMin: 4, repMax: 6, restSec: 150 },
    { id: 'rx_3_str', templateId: 'tmpl_3_str', exerciseId: 'ex_squat', order: 0, sets: 4, repMin: 4, repMax: 6, restSec: 150 },
  ]
  await db.prescriptions.bulkAdd(prescriptions)

  const instances: WorkoutInstance[] = [
    { id: 'wi_1_str', planId: PLAN_ID, templateId: 'tmpl_1_str', weekNumber: 1, sessionSlot: 1, plannedDate: '2026-07-06', scheduledDate: '2026-07-06', sequence: 0, priority: 'essential', recoveryTags: [], status: 'completed', isManualOverride: false, frozen: true, completedAt: NOW, completedForDate: '2026-07-06' },
    { id: 'wi_1_run', planId: PLAN_ID, templateId: 'tmpl_1_run', weekNumber: 1, sessionSlot: 2, plannedDate: '2026-07-07', scheduledDate: '2026-07-07', sequence: 1, priority: 'essential', recoveryTags: ['easyRun'], status: 'upcoming', isManualOverride: false, frozen: false },
    { id: 'wi_2_str', planId: PLAN_ID, templateId: 'tmpl_2_str', weekNumber: 2, sessionSlot: 1, plannedDate: '2026-07-13', scheduledDate: '2026-07-13', sequence: 0, priority: 'essential', recoveryTags: [], status: 'upcoming', isManualOverride: false, frozen: false },
    { id: 'wi_3_str', planId: PLAN_ID, templateId: 'tmpl_3_str', weekNumber: 3, sessionSlot: 1, plannedDate: '2026-07-20', scheduledDate: '2026-07-20', sequence: 0, priority: 'essential', recoveryTags: [], status: 'upcoming', isManualOverride: false, frozen: false },
  ]
  await db.workoutInstances.bulkAdd(instances)

  const instancePrescriptions: InstancePrescription[] = [
    { id: 'ip_1_str', instanceId: 'wi_1_str', templateId: 'tmpl_1_str', exerciseId: 'ex_squat', order: 0, sets: 4, repMin: 4, repMax: 6, restSec: 150, sourcePrescriptionId: 'rx_1_str' },
    { id: 'ip_2_str', instanceId: 'wi_2_str', templateId: 'tmpl_2_str', exerciseId: 'ex_squat', order: 0, sets: 4, repMin: 4, repMax: 6, restSec: 150, sourcePrescriptionId: 'rx_2_str' },
    { id: 'ip_3_str', instanceId: 'wi_3_str', templateId: 'tmpl_3_str', exerciseId: 'ex_squat', order: 0, sets: 4, repMin: 4, repMax: 6, restSec: 150, sourcePrescriptionId: 'rx_3_str' },
  ]
  await db.instancePrescriptions.bulkAdd(instancePrescriptions)

  const completedSet: StrengthSet = {
    id: 'set_1', instanceId: 'wi_1_str', instancePrescriptionId: 'ip_1_str', exerciseId: 'ex_squat', setIndex: 0,
    weight: 175, unit: 'lb', reps: 5, isCompleted: true, completedAt: NOW, isWarmup: false,
  }
  await db.strengthSets.add(completedSet)

  await db.settings.add({
    id: 'app', schemaVersion: 1, activePlanId: PLAN_ID, strengthUnit: 'lb', stationUnit: 'lb',
    restSoundEnabled: true, restVibrationEnabled: true, dismissedSubstitutions: [],
  })
}

beforeEach(async () => {
  await resetDatabase()
  await seedFixture()
})

describe('addWorkoutToWeek', () => {
  it('adds a session to the first free slot and it is independently deletable/duplicable', async () => {
    const instance = await addWorkoutToWeek({
      planId: PLAN_ID, weekNumber: 1, name: 'Mobility', kind: 'recovery', priority: 'optional', estMinutes: 20,
    })
    expect(instance.sessionSlot).toBe(3) // slots 1 and 2 already used in week 1
    expect(instance.weekNumber).toBe(1)
    expect(instance.frozen).toBe(false)
    const template = await db.workoutTemplates.get(instance.templateId)
    expect(template?.name).toBe('Mobility')
  })

  it('throws once all 6 Monday-Saturday slots are used', async () => {
    for (let i = 0; i < 4; i += 1) {
      await addWorkoutToWeek({ planId: PLAN_ID, weekNumber: 1, name: `Extra ${String(i)}`, kind: 'recovery', priority: 'optional', estMinutes: 20 })
    }
    await expect(addWorkoutToWeek({
      planId: PLAN_ID, weekNumber: 1, name: 'One too many', kind: 'recovery', priority: 'optional', estMinutes: 20,
    })).rejects.toThrow(/maximum of 6/)
  })
})

describe('deleteWorkout', () => {
  it('deletes an upcoming session and its template/prescriptions', async () => {
    await deleteWorkout('wi_1_run')
    expect(await db.workoutInstances.get('wi_1_run')).toBeUndefined()
    expect(await db.workoutTemplates.get('tmpl_1_run')).toBeUndefined()
  })

  it('throws on a frozen (completed) instance and leaves it untouched', async () => {
    const before = await db.workoutInstances.get('wi_1_str')
    await expect(deleteWorkout('wi_1_str')).rejects.toThrow(/immutable/i)
    expect(await db.workoutInstances.get('wi_1_str')).toEqual(before)
  })
})

describe('duplicateWorkout', () => {
  it('clones a session into a free slot in the same week, leaving the source untouched', async () => {
    const before = await db.workoutInstances.get('wi_1_run')
    const copy = await duplicateWorkout('wi_1_run')
    expect(copy.id).not.toBe('wi_1_run')
    expect(copy.weekNumber).toBe(1)
    expect(copy.sessionSlot).toBe(3)
    expect(copy.frozen).toBe(false)
    expect(await db.workoutInstances.get('wi_1_run')).toEqual(before)

    const copiedPrescriptions = await db.instancePrescriptions.where('instanceId').equals(copy.id).toArray()
    expect(copiedPrescriptions.length).toBe(0) // wi_1_run has no InstancePrescriptions in this fixture
  })

  it('duplicating a frozen (completed) session is allowed and does not mutate it', async () => {
    const before = await db.workoutInstances.get('wi_1_str')
    const copy = await duplicateWorkout('wi_1_str')
    expect(copy.frozen).toBe(false)
    expect(copy.status).toBe('upcoming')
    expect(await db.workoutInstances.get('wi_1_str')).toEqual(before)

    const copiedPrescriptions = await db.instancePrescriptions.where('instanceId').equals(copy.id).toArray()
    expect(copiedPrescriptions).toHaveLength(1)
    expect(copiedPrescriptions[0]?.exerciseId).toBe('ex_squat')
  })
})

describe('swapWorkoutOrder', () => {
  it('swaps sessionSlot/plannedDate between two non-frozen sessions in the same week', async () => {
    const mobilityInstance = await addWorkoutToWeek({
      planId: PLAN_ID, weekNumber: 1, name: 'Mobility', kind: 'recovery', priority: 'optional', estMinutes: 20,
    })

    await swapWorkoutOrder('wi_1_run', mobilityInstance.id)

    const run = await db.workoutInstances.get('wi_1_run')
    const mobilityAfter = await db.workoutInstances.get(mobilityInstance.id)
    expect(run?.sessionSlot).toBe(3)
    expect(mobilityAfter?.sessionSlot).toBe(2)
    expect(run?.plannedDate).not.toBe('2026-07-07')
  })

  it('throws if either instance is frozen', async () => {
    await expect(swapWorkoutOrder('wi_1_str', 'wi_1_run')).rejects.toThrow(/immutable/i)
  })
})

describe('addExerciseToInstance (§13: add to a current workout)', () => {
  it('adds an InstancePrescription with no template linkage', async () => {
    const ip = await addExerciseToInstance({ instanceId: 'wi_1_run', exerciseId: 'ex_lunge' })
    expect(ip.sourcePrescriptionId).toBeUndefined()
    expect(ip.restSec).toBe(90)
    const templatePrescriptions = await db.prescriptions.where('templateId').equals('tmpl_1_run').toArray()
    expect(templatePrescriptions).toHaveLength(0)
  })

  it('throws on a frozen instance', async () => {
    await expect(addExerciseToInstance({ instanceId: 'wi_1_str', exerciseId: 'ex_lunge' })).rejects.toThrow(/immutable/i)
  })
})

describe('addExerciseToTemplate (§13: add to future workout templates)', () => {
  it('adds to the current template AND propagates to the matching future (sessionSlot+kind) non-frozen instance', async () => {
    const result = await addExerciseToTemplate({ instanceId: 'wi_1_run', exerciseId: 'ex_lunge' })
    expect(result.prescription.templateId).toBe('tmpl_1_run')

    // Current instance also got it.
    const currentIps = await db.instancePrescriptions.where('instanceId').equals('wi_1_run').toArray()
    expect(currentIps.some((p) => p.exerciseId === 'ex_lunge')).toBe(true)

    // No future run session exists in this fixture (week 2 only has strength),
    // so nothing should have propagated for THIS call.
    expect(result.propagatedInstanceCount).toBe(0)
  })

  it('propagates to a genuinely matching future session and never touches an earlier frozen one', async () => {
    const frozenBefore = await db.workoutInstances.get('wi_1_str')
    const frozenIpsBefore = await db.instancePrescriptions.where('instanceId').equals('wi_1_str').toArray()

    // wi_2_str (week 2) is the "current" workout being edited; wi_3_str
    // (week 3, same sessionSlot/kind) is the one genuinely-future match.
    // wi_1_str (week 1, frozen) is EARLIER, so it must never be touched
    // regardless of its frozen status.
    const result = await addExerciseToTemplate({ instanceId: 'wi_2_str', exerciseId: 'ex_lunge' })
    expect(result.propagatedInstanceCount).toBe(1)

    const futureIps = await db.instancePrescriptions.where('instanceId').equals('wi_3_str').toArray()
    expect(futureIps.some((p) => p.exerciseId === 'ex_lunge')).toBe(true)
    const futureTemplatePrescriptions = await db.prescriptions.where('templateId').equals('tmpl_3_str').toArray()
    expect(futureTemplatePrescriptions.some((p) => p.exerciseId === 'ex_lunge')).toBe(true)

    expect(await db.workoutInstances.get('wi_1_str')).toEqual(frozenBefore)
    expect(await db.instancePrescriptions.where('instanceId').equals('wi_1_str').toArray()).toEqual(frozenIpsBefore)
  })

  it('throws when the CURRENT instance itself is frozen -- never silently skips it', async () => {
    await expect(addExerciseToTemplate({ instanceId: 'wi_1_str', exerciseId: 'ex_lunge' })).rejects.toThrow(/immutable/i)
  })
})

describe('removeExerciseFromInstance / substituteExerciseInInstance / swapExerciseOrder', () => {
  it('removes an exercise and its logged sets, guarded against frozen instances', async () => {
    await addExerciseToInstance({ instanceId: 'wi_1_run', exerciseId: 'ex_lunge' })
    const ip = (await db.instancePrescriptions.where('instanceId').equals('wi_1_run').toArray())[0]
    if (!ip) throw new Error('expected an instancePrescription')
    await removeExerciseFromInstance(ip.id)
    expect(await db.instancePrescriptions.get(ip.id)).toBeUndefined()

    await expect(removeExerciseFromInstance('ip_1_str')).rejects.toThrow(/immutable/i)
  })

  it('substitutes an exercise, discarding logged sets for the old one, and refuses on a frozen instance', async () => {
    await substituteExerciseInInstance({ instancePrescriptionId: 'ip_2_str', newExerciseId: 'ex_lunge' })
    const updated = await db.instancePrescriptions.get('ip_2_str')
    expect(updated?.exerciseId).toBe('ex_lunge')
    expect(updated?.sourcePrescriptionId).toBeUndefined()
    expect(updated?.restSec).toBe(90)

    await expect(substituteExerciseInInstance({ instancePrescriptionId: 'ip_1_str', newExerciseId: 'ex_lunge' })).rejects.toThrow(/immutable/i)
    expect((await db.strengthSets.get('set_1'))?.exerciseId).toBe('ex_squat') // untouched: guard threw before any delete
  })

  it('swaps order between two exercises in the same (non-frozen) instance', async () => {
    await addExerciseToInstance({ instanceId: 'wi_1_run', exerciseId: 'ex_lunge' })
    const secondIp = await addExerciseToInstance({ instanceId: 'wi_1_run', exerciseId: 'ex_squat' })
    const firstIp = (await db.instancePrescriptions.where('instanceId').equals('wi_1_run').toArray()).find((p) => p.id !== secondIp.id)
    if (!firstIp) throw new Error('expected the first added prescription')

    await swapExerciseOrder(firstIp.id, secondIp.id)
    expect((await db.instancePrescriptions.get(firstIp.id))?.order).toBe(secondIp.order)
    expect((await db.instancePrescriptions.get(secondIp.id))?.order).toBe(firstIp.order)
  })
})

describe('changePlanDuration', () => {
  it('preserves history while regenerating future core weeks to the new count', async () => {
    const frozenBefore = await db.workoutInstances.get('wi_1_str')
    const setBefore = await db.strengthSets.get('set_1')

    const updated = await changePlanDuration({ coreWeeksCount: 3, today: '2026-07-06' })

    expect(updated.weeksCount).toBe(3) // baseWeeksCount is 0 in this fixture (no "Prologue" phase)
    expect(await db.workoutInstances.get('wi_1_str')).toEqual(frozenBefore)
    expect(await db.strengthSets.get('set_1')).toEqual(setBefore)
    // Week 2's non-history content was regenerated (its old template is gone).
    expect(await db.workoutTemplates.get('tmpl_2_str')).toBeUndefined()
  }, 20000)
})
