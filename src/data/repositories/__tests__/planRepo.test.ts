import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import type { Exercise, InstancePrescription, Prescription, StrengthSet, WorkoutInstance, WorkoutTemplate } from '@/data/types'
import { applyPrescriptionEdit, duplicatePlan, restoreSeedPlanPreservingHistory } from '../planRepo'

const NOW = '2026-07-27T10:00:00.000Z'

const EXERCISE: Exercise = {
  id: 'ex_1', name: 'Back Squat', category: 'squat', measurementType: 'strengthSets', loadStyle: 'totalBarbell',
  defaultUnit: 'lb', defaultRestSec: 150, progressionIncrement: 5, incrementUnit: 'lb',
  defaultSets: 4, repMin: 4, repMax: 6, techniqueNotes: '', isArchived: false, isSeeded: false,
  createdAt: NOW, updatedAt: NOW,
}

/**
 * A frozen (completed) instance in week 1 with a logged strength set, and a
 * non-frozen ("future") instance in week 2 -- both prescribing the same
 * exercise, which is what `thisAndFuture` matches on.
 */
async function seedTwoWeekFixture(): Promise<void> {
  await db.plans.add({ id: 'plan_1', name: 'Test plan', weeksCount: 24, status: 'active', startDate: '2026-07-06', raceGoalId: 'goal_1', createdAt: NOW })
  await db.exercises.add(EXERCISE)

  const templates: WorkoutTemplate[] = [
    { id: 'tmpl_1', planId: 'plan_1', planWeekId: 'week_1', sessionSlot: 1, sequenceInWeek: 0, name: 'Strength A', kind: 'strength', priority: 'essential', recoveryTags: [], estMinutes: 60, notes: '' },
    { id: 'tmpl_2', planId: 'plan_1', planWeekId: 'week_2', sessionSlot: 1, sequenceInWeek: 0, name: 'Strength A', kind: 'strength', priority: 'essential', recoveryTags: [], estMinutes: 60, notes: '' },
  ]
  await db.workoutTemplates.bulkAdd(templates)

  const prescriptions: Prescription[] = [
    { id: 'rx_1', templateId: 'tmpl_1', exerciseId: 'ex_1', order: 0, sets: 4, repMin: 4, repMax: 6, restSec: 150 },
    { id: 'rx_2', templateId: 'tmpl_2', exerciseId: 'ex_1', order: 0, sets: 4, repMin: 4, repMax: 6, restSec: 150 },
  ]
  await db.prescriptions.bulkAdd(prescriptions)

  const instances: WorkoutInstance[] = [
    { id: 'wi_1', planId: 'plan_1', templateId: 'tmpl_1', weekNumber: 1, sessionSlot: 1, plannedDate: '2026-07-06', scheduledDate: '2026-07-06', sequence: 0, priority: 'essential', recoveryTags: [], status: 'completed', isManualOverride: false, frozen: true, completedAt: NOW, completedForDate: '2026-07-06' },
    { id: 'wi_2', planId: 'plan_1', templateId: 'tmpl_2', weekNumber: 2, sessionSlot: 1, plannedDate: '2026-07-13', scheduledDate: '2026-07-13', sequence: 0, priority: 'essential', recoveryTags: [], status: 'upcoming', isManualOverride: false, frozen: false },
  ]
  await db.workoutInstances.bulkAdd(instances)

  const instancePrescriptions: InstancePrescription[] = [
    { id: 'ip_1', instanceId: 'wi_1', templateId: 'tmpl_1', exerciseId: 'ex_1', order: 0, sets: 4, repMin: 4, repMax: 6, restSec: 150, sourcePrescriptionId: 'rx_1' },
    { id: 'ip_2', instanceId: 'wi_2', templateId: 'tmpl_2', exerciseId: 'ex_1', order: 0, sets: 4, repMin: 4, repMax: 6, restSec: 150, sourcePrescriptionId: 'rx_2' },
  ]
  await db.instancePrescriptions.bulkAdd(instancePrescriptions)

  const completedSet: StrengthSet = {
    id: 'set_1', instanceId: 'wi_1', instancePrescriptionId: 'ip_1', exerciseId: 'ex_1', setIndex: 0,
    weight: 175, unit: 'lb', reps: 5, isCompleted: true, completedAt: NOW, isWarmup: false,
  }
  await db.strengthSets.add(completedSet)
}

beforeEach(async () => {
  await resetDatabase()
  await seedTwoWeekFixture()
})

describe('applyPrescriptionEdit', () => {
  it('thisWorkout changes only that InstancePrescription', async () => {
    const setBefore = await db.strengthSets.get('set_1')
    const frozenBefore = await db.workoutInstances.get('wi_1')

    await applyPrescriptionEdit({ instanceId: 'wi_2', prescriptionId: 'ip_2', patch: { restSec: 200 }, scope: 'thisWorkout', now: NOW })

    expect((await db.instancePrescriptions.get('ip_2'))?.restSec).toBe(200)
    expect((await db.instancePrescriptions.get('ip_1'))?.restSec).toBe(150)
    expect((await db.prescriptions.get('rx_2'))?.restSec).toBe(150)
    expect((await db.exercises.get('ex_1'))?.defaultRestSec).toBe(150)
    expect(await db.strengthSets.get('set_1')).toEqual(setBefore)
    expect(await db.workoutInstances.get('wi_1')).toEqual(frozenBefore)
  })

  it('thisWorkout on a frozen instance throws HistoryImmutableError', async () => {
    await expect(applyPrescriptionEdit({
      instanceId: 'wi_1', prescriptionId: 'ip_1', patch: { restSec: 200 }, scope: 'thisWorkout', now: NOW,
    })).rejects.toThrow(/immutable/i)
  })

  it('thisAndFuture changes the template Prescription and every non-frozen future InstancePrescription, leaving frozen ones untouched', async () => {
    const setBefore = await db.strengthSets.get('set_1')
    const frozenInstanceBefore = await db.workoutInstances.get('wi_1')
    const frozenPrescriptionBefore = await db.instancePrescriptions.get('ip_1')

    await applyPrescriptionEdit({ instanceId: 'wi_2', prescriptionId: 'ip_2', patch: { restSec: 200 }, scope: 'thisAndFuture', now: NOW })

    expect((await db.prescriptions.get('rx_2'))?.restSec).toBe(200)
    expect((await db.instancePrescriptions.get('ip_2'))?.restSec).toBe(200)
    // Frozen (wi_1's) prescription and template are untouched.
    expect(await db.instancePrescriptions.get('ip_1')).toEqual(frozenPrescriptionBefore)
    expect((await db.prescriptions.get('rx_1'))?.restSec).toBe(150)
    expect(await db.workoutInstances.get('wi_1')).toEqual(frozenInstanceBefore)
    expect(await db.strengthSets.get('set_1')).toEqual(setBefore)
    expect((await db.exercises.get('ex_1'))?.defaultRestSec).toBe(150)
  })

  it('exerciseDefaultOnly changes the Exercise and neither the template nor any scheduled instance', async () => {
    const setBefore = await db.strengthSets.get('set_1')
    const ip1Before = await db.instancePrescriptions.get('ip_1')
    const ip2Before = await db.instancePrescriptions.get('ip_2')
    const rx1Before = await db.prescriptions.get('rx_1')
    const rx2Before = await db.prescriptions.get('rx_2')

    await applyPrescriptionEdit({ instanceId: 'wi_2', prescriptionId: 'ip_2', patch: { restSec: 200 }, scope: 'exerciseDefaultOnly', now: NOW })

    expect((await db.exercises.get('ex_1'))?.defaultRestSec).toBe(200)
    expect(await db.instancePrescriptions.get('ip_1')).toEqual(ip1Before)
    expect(await db.instancePrescriptions.get('ip_2')).toEqual(ip2Before)
    expect(await db.prescriptions.get('rx_1')).toEqual(rx1Before)
    expect(await db.prescriptions.get('rx_2')).toEqual(rx2Before)
    expect(await db.strengthSets.get('set_1')).toEqual(setBefore)
  })
})

describe('duplicatePlan', () => {
  it('produces an independent plan whose edits do not affect the original', async () => {
    await db.planPhases.add({ id: 'phase_1', planId: 'plan_1', name: 'Base', weekStart: 1, weekEnd: 6, focus: '' })
    await db.planWeeks.add({ id: 'week_1', planId: 'plan_1', weekNumber: 1, phaseId: 'phase_1', label: 'Week 1', isDeload: false, notes: '' })

    const copy = await duplicatePlan('plan_1', 'Copy of Test plan', NOW)
    expect(copy.id).not.toBe('plan_1')
    expect(copy.sourcePlanId).toBe('plan_1')

    const copiedTemplates = await db.workoutTemplates.where('planId').equals(copy.id).toArray()
    expect(copiedTemplates).toHaveLength(2)
    const copiedTemplate = copiedTemplates.find((t) => t.sessionSlot === 1 && t.planWeekId !== 'week_1')
    if (!copiedTemplate) throw new Error('expected a copied template')

    const copiedPrescription = (await db.prescriptions.where('templateId').equals(copiedTemplate.id).toArray())[0]
    if (!copiedPrescription) throw new Error('expected a copied prescription')

    await db.prescriptions.put({ ...copiedPrescription, restSec: 999 })

    expect((await db.prescriptions.get('rx_1'))?.restSec).toBe(150)
    expect((await db.prescriptions.get('rx_2'))?.restSec).toBe(150)
    expect((await db.prescriptions.get(copiedPrescription.id))?.restSec).toBe(999)
  })
})

describe('restoreSeedPlanPreservingHistory', () => {
  it('recreates templates and future instances while every completed instance and every log row survives with identical values', async () => {
    await db.settings.add({
      id: 'app', schemaVersion: 1, activePlanId: 'plan_1', strengthUnit: 'lb', stationUnit: 'lb',
      restSoundEnabled: true, restVibrationEnabled: true, dismissedSubstitutions: [],
    })

    const frozenInstanceBefore = await db.workoutInstances.get('wi_1')
    const setBefore = await db.strengthSets.get('set_1')

    await restoreSeedPlanPreservingHistory({ today: '2026-07-06', now: NOW })

    // History survives byte-identical.
    expect(await db.workoutInstances.get('wi_1')).toEqual(frozenInstanceBefore)
    expect(await db.strengthSets.get('set_1')).toEqual(setBefore)

    // The untouched "future" fixture instance/template are gone, replaced.
    expect(await db.workoutTemplates.get('tmpl_2')).toBeUndefined()

    // Fresh instances now exist for the real 24-week seed plan (week 2's
    // slot 1 is "Strength A + sled" per the shipped seed content).
    const week2Instances = await db.workoutInstances.where('weekNumber').equals(2).toArray()
    expect(week2Instances.length).toBeGreaterThan(0)
    const week2Templates = await Promise.all(week2Instances.map((i) => db.workoutTemplates.get(i.templateId)))
    expect(week2Templates.some((t) => t?.name === 'Strength A + sled')).toBe(true)
  }, 20000)
})
