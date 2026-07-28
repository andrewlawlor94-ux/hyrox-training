import { beforeEach, describe, expect, it } from 'vitest'
import { PLAN_WEEKS_DEFAULT } from '@/domain/planGeneration/constants'
import { anchorPlan } from '@/domain/planGeneration/anchor'
import { db, resetDatabase } from '@/data/db'
import { seedIfEmpty } from '@/data/seed/seedRunner'
import { installSeedPlan, restoreSeedPlanPreservingHistory } from '@/data/repositories/planRepo'
import { setRaceGoal } from '@/data/repositories/goalRepo'

const TODAY = '2026-07-27' // a Monday
const NOW = '2026-07-27T08:00:00.000Z'

/** Race date N weeks after TODAY, landing on a Saturday. */
function raceDateWeeksOut(weeks: number): string {
  const start = Date.UTC(2026, 6, 27)
  return new Date(start + (weeks * 7 + 5) * 86_400_000).toISOString().slice(0, 10)
}

async function install(weeksOut: number) {
  await resetDatabase()
  await seedIfEmpty(db, NOW)
  const raceDate = raceDateWeeksOut(weeksOut)
  await setRaceGoal({ raceDate, targetSeconds: 5700, stretchSeconds: 5400 }, NOW)
  const plan = await installSeedPlan({ today: TODAY, raceDate, now: NOW })
  const weeks = await db.planWeeks.where('planId').equals(plan.id).toArray()
  const instances = await db.workoutInstances.where('planId').equals(plan.id).toArray()
  return { plan, raceDate, weeks, instances, anchor: anchorPlan({ today: TODAY, raceDate }) }
}

describe('compressed plans (race closer than 24 weeks out)', () => {
  beforeEach(async () => { await resetDatabase() })

  it('materializes only the anchored week count, not all 24 core weeks', async () => {
    const { weeks, anchor } = await install(16)
    expect(anchor.coreWeeks).toBeLessThan(PLAN_WEEKS_DEFAULT)
    expect(weeks).toHaveLength(anchor.totalWeeks)
  })

  it('keeps Plan.weeksCount consistent with the weeks actually created', async () => {
    const { plan, weeks } = await install(16)
    expect(plan.weeksCount).toBe(weeks.length)
  })

  it('never plans a session dated after race day', async () => {
    const { instances, raceDate } = await install(16)
    const late = instances.filter((i) => i.plannedDate > raceDate).map((i) => i.plannedDate)
    expect(late).toEqual([])
  })

  it('preserves the taper by keeping the LAST seed weeks, not the first', async () => {
    // Dropping from the end would leave the athlete mid-Build on race day.
    const { plan } = await install(16)
    const weeks = await db.planWeeks.where('planId').equals(plan.id).toArray()
    const finalWeek = weeks.sort((a, b) => a.weekNumber - b.weekNumber).at(-1)
    if (!finalWeek) throw new Error('no weeks materialized')
    const phase = await db.planPhases.get(finalWeek.phaseId)
    expect(phase?.name).toBe('Taper')
  })

  it('still materializes all 24 core weeks when there is room', async () => {
    const { weeks, anchor } = await install(26)
    expect(anchor.coreWeeks).toBe(PLAN_WEEKS_DEFAULT)
    expect(weeks).toHaveLength(anchor.baseWeeks + PLAN_WEEKS_DEFAULT)
  })

  it('gives every materialized instance at least one prescription', async () => {
    const { instances } = await install(16)
    const rx = await db.instancePrescriptions.toArray()
    const withRx = new Set(rx.map((p) => p.instanceId))
    expect(instances.filter((i) => !withRx.has(i.id)).map((i) => i.id)).toEqual([])
  })

  it('restore re-derives the same week count instead of clamping base weeks to zero', async () => {
    const { plan, weeks } = await install(16)
    await restoreSeedPlanPreservingHistory({ today: TODAY, now: NOW })
    const after = await db.planWeeks.where('planId').equals(plan.id).toArray()
    expect(after).toHaveLength(weeks.length)
  })
})
