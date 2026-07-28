import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import { addDays } from '@/domain/dates'
import { SEED_EXERCISES } from '@/data/seed/exercises'
import { installSeedPlan } from '../planRepo'

const NOW = '2026-07-27T10:00:00.000Z'
const TODAY = '2026-07-27'
// 26 weeks out: more than the 24-week core plan needs, but within
// `MAX_GENERATED_BASE_WEEKS` (8), so `anchorPlan` fills the gap with
// generated Base weeks rather than deferring the start (see
// `src/domain/planGeneration/anchor.ts`).
const WEEKS_OUT = 26
const RACE_DATE = addDays(TODAY, WEEKS_OUT * 7)

const SEED_EXERCISE_IDS: Set<string> = new Set(SEED_EXERCISES.map((e) => e.id))

beforeEach(async () => {
  await resetDatabase()
})

const TEST_TIMEOUT_MS = 20000

describe('installSeedPlan materializes Base-week content', () => {
  it('produces at least one Base week for a race date far enough out', async () => {
    const plan = await installSeedPlan({ today: TODAY, raceDate: RACE_DATE, now: NOW })
    const baseWeekCount = plan.weeksCount - 24
    expect(baseWeekCount).toBeGreaterThan(0)
    expect(baseWeekCount).toBeLessThanOrEqual(8)
  }, TEST_TIMEOUT_MS)

  it('gives every materialized WorkoutInstance at least one InstancePrescription', async () => {
    const plan = await installSeedPlan({ today: TODAY, raceDate: RACE_DATE, now: NOW })
    const instances = await db.workoutInstances.where('planId').equals(plan.id).toArray()
    expect(instances.length).toBeGreaterThan(0)

    const emptyInstances: typeof instances = []
    for (const instance of instances) {
      const count = await db.instancePrescriptions.where('instanceId').equals(instance.id).count()
      if (count === 0) emptyInstances.push(instance)
    }

    // Reported for visibility in test output regardless of pass/fail.
    console.log(`installSeedPlan: ${String(instances.length)} instances, ${String(emptyInstances.length)} with zero prescriptions`)

    expect(emptyInstances).toEqual([])
  }, TEST_TIMEOUT_MS)

  it('gives every Base-week easy-run session all three lower-leg durability exercises', async () => {
    const plan = await installSeedPlan({ today: TODAY, raceDate: RACE_DATE, now: NOW })
    const baseWeekCount = plan.weeksCount - 24
    // `WorkoutTemplate` has no `weekNumber` of its own (that lives on
    // `WorkoutInstance`/`PlanWeek`), so start from Base-week instances and
    // follow `templateId` to reach each session's recovery tags.
    const baseEasyRunInstances = await db.workoutInstances
      .where('planId').equals(plan.id)
      .filter((i) => i.weekNumber <= baseWeekCount && i.recoveryTags.includes('easyRun'))
      .toArray()
    expect(baseEasyRunInstances.length).toBeGreaterThan(0)

    const requiredIds = ['ex_calf_raise_straight_knee', 'ex_calf_raise_bent_knee', 'ex_tibialis_raise']
    for (const instance of baseEasyRunInstances) {
      const prescriptions = await db.prescriptions.where('templateId').equals(instance.templateId).toArray()
      const exerciseIds = prescriptions.map((p) => p.exerciseId)
      for (const requiredId of requiredIds) expect(exerciseIds).toContain(requiredId)
    }
  }, TEST_TIMEOUT_MS)

  it('schedules no hardRun-tagged session in any Base week', async () => {
    const plan = await installSeedPlan({ today: TODAY, raceDate: RACE_DATE, now: NOW })
    const baseWeekCount = plan.weeksCount - 24
    const baseInstances = await db.workoutInstances
      .where('planId').equals(plan.id)
      .filter((i) => i.weekNumber <= baseWeekCount)
      .toArray()
    expect(baseInstances.length).toBeGreaterThan(0)
    expect(baseInstances.every((i) => !i.recoveryTags.includes('hardRun'))).toBe(true)
  }, TEST_TIMEOUT_MS)

  it('every prescription exerciseId resolves against SEED_EXERCISES', async () => {
    const plan = await installSeedPlan({ today: TODAY, raceDate: RACE_DATE, now: NOW })
    const templates = await db.workoutTemplates.where('planId').equals(plan.id).toArray()
    const templateIds = templates.map((t) => t.id)
    const prescriptions = await db.prescriptions.where('templateId').anyOf(templateIds).toArray()
    expect(prescriptions.length).toBeGreaterThan(0)
    const unresolved = prescriptions.filter((p) => !SEED_EXERCISE_IDS.has(p.exerciseId))
    expect(unresolved).toEqual([])
  }, TEST_TIMEOUT_MS)

  it('every prescription has a positive restSec', async () => {
    const plan = await installSeedPlan({ today: TODAY, raceDate: RACE_DATE, now: NOW })
    const templates = await db.workoutTemplates.where('planId').equals(plan.id).toArray()
    const templateIds = templates.map((t) => t.id)
    const prescriptions = await db.prescriptions.where('templateId').anyOf(templateIds).toArray()
    expect(prescriptions.length).toBeGreaterThan(0)
    const nonPositive = prescriptions.filter((p) => !(p.restSec > 0))
    expect(nonPositive).toEqual([])
  }, TEST_TIMEOUT_MS)
})
