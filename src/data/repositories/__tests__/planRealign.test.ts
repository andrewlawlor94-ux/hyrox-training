import { beforeEach, describe, expect, it } from 'vitest'
import { db, resetDatabase } from '@/data/db'
import type { Plan } from '@/data/types'
import { seedIfEmpty } from '@/data/seed/seedRunner'
import { installSeedPlan } from '../planRepo'
import { setRaceGoal } from '../goalRepo'
import { completeWorkout } from '../workoutRepo'
import { setOverride, syncQueue } from '../scheduleRepo'
import { previewRealign, realignScheduleToToday } from '../planRealignRepo'

/** The plan is installed on this Monday with a race exactly 24 weeks out, so it
 * starts today with 24 core weeks and no base weeks. */
const INSTALL_DAY = '2026-01-05'
const RACE = '2026-06-20' // the Saturday of plan week 24
const RACE_MONDAY = '2026-06-15'
const NOW = '2026-01-05T08:00:00.000Z'
/** Eleven weeks after the install: by the calendar the plan is now in week 12. */
const DRIFTED_TODAY = '2026-03-25' // a Wednesday
const DRIFTED_MONDAY = '2026-03-23'
/** Four weeks trained + thirteen weeks from this Monday through race week. */
const REALIGNED_WEEKS = 17
const REALIGNED_START = '2026-02-23'

async function installPlan(): Promise<string> {
  await resetDatabase()
  await seedIfEmpty(db, NOW)
  await setRaceGoal({ raceDate: RACE, targetSeconds: 5700, stretchSeconds: 5400 }, NOW)
  const plan = await installSeedPlan({ today: INSTALL_DAY, raceDate: RACE, now: NOW })
  return plan.id
}

/** Completes every session in the given plan weeks, each on its own planned
 * date, so history genuinely reaches them. Weeks NOT listed are left alone —
 * that is how a week ends up missed. */
async function trainWeeks(planId: string, weeks: readonly number[]): Promise<void> {
  const instances = await db.workoutInstances.where('planId').equals(planId).toArray()
  for (const instance of instances.filter((i) => weeks.includes(i.weekNumber))) {
    await completeWorkout({
      id: instance.id, state: 'completed', forDate: instance.plannedDate,
      now: `${instance.plannedDate}T18:00:00.000Z`,
    })
  }
}

async function activePlan(): Promise<Plan> {
  const plan = await db.plans.where('status').equals('active').first()
  if (!plan) throw new Error('no active plan')
  return plan
}

describe('realignScheduleToToday', () => {
  beforeEach(async () => { await resetDatabase() })

  it('reads the drift off history: the plan says week 12, the athlete is on week 5', async () => {
    const planId = await installPlan()
    await trainWeeks(planId, [1, 2, 3, 4])

    const preview = await previewRealign(DRIFTED_TODAY)
    expect(preview?.currentWeekNumber).toBe(12)
    expect(preview?.decision.requestedResumeWeek).toBe(5)
  })

  it('restarts the plan at the week history reached, beginning this week', async () => {
    const planId = await installPlan()
    await trainWeeks(planId, [1, 2, 3, 4])

    const decision = await realignScheduleToToday({ today: DRIFTED_TODAY, now: NOW })
    expect(decision?.outcome).toBe('realigned')
    expect(decision?.resumeWeek).toBe(5)
    // Four weeks before this Monday, so week 5 starts this Monday.
    expect((await activePlan()).startDate).toBe(REALIGNED_START)

    const instances = await db.workoutInstances.where('planId').equals(planId).toArray()
    const week5 = instances.filter((i) => i.weekNumber === 5 && !i.frozen)
    expect(week5.length).toBeGreaterThan(0)
    for (const instance of week5) {
      expect(instance.plannedDate >= DRIFTED_MONDAY, instance.id).toBe(true)
      expect(instance.plannedDate < '2026-03-30', instance.id).toBe(true)
    }
  })

  it('still ends on race week, so the taper is not pushed past race day', async () => {
    const planId = await installPlan()
    await trainWeeks(planId, [1, 2, 3, 4])
    await realignScheduleToToday({ today: DRIFTED_TODAY, now: NOW })

    const plan = await activePlan()
    const weeks = await db.planWeeks.where('planId').equals(plan.id).toArray()
    const finalWeek = Math.max(...weeks.map((w) => w.weekNumber))
    expect(finalWeek).toBe(plan.weeksCount)

    const instances = await db.workoutInstances.where('planId').equals(planId).toArray()
    expect(instances.filter((i) => !i.frozen && i.plannedDate > RACE).map((i) => i.plannedDate)).toEqual([])
    // The final week IS race week, not a week short of it.
    expect(instances.filter((i) => i.weekNumber === finalWeek).some((i) => i.plannedDate >= RACE_MONDAY)).toBe(true)
  })

  it('shortens the plan to fit the runway that is actually left', async () => {
    const planId = await installPlan()
    expect((await activePlan()).weeksCount).toBe(24)

    await trainWeeks(planId, [1, 2, 3, 4])
    await realignScheduleToToday({ today: DRIFTED_TODAY, now: NOW })
    expect((await activePlan()).weeksCount).toBe(REALIGNED_WEEKS)
  })

  it('keeps every completed session, its date, its status and its logged work', async () => {
    const planId = await installPlan()
    await trainWeeks(planId, [1, 2, 3, 4])
    const before = (await db.workoutInstances.where('planId').equals(planId).toArray())
      .filter((i) => i.frozen)
      .map((i) => ({ id: i.id, completedForDate: i.completedForDate, status: i.status, week: i.weekNumber }))
    expect(before.length).toBeGreaterThan(0)
    const logsBefore = await db.strengthSets.count()

    await realignScheduleToToday({ today: DRIFTED_TODAY, now: NOW })

    const after = await db.workoutInstances.where('planId').equals(planId).toArray()
    for (const original of before) {
      const still = after.find((i) => i.id === original.id)
      expect(still, original.id).toBeDefined()
      expect(still?.completedForDate, original.id).toBe(original.completedForDate)
      expect(still?.status, original.id).toBe(original.status)
      expect(still?.frozen, original.id).toBe(true)
      expect(still?.weekNumber, original.id).toBe(original.week)
    }
    expect(await db.strengthSets.count()).toBe(logsBefore)
  })

  /**
   * The week the athlete genuinely missed. It is behind the resume point now, so
   * nothing in it may still be sitting there waiting to be done — that is what
   * "start today" means.
   */
  it('leaves nothing pending in a week that is now behind the resume point', async () => {
    const planId = await installPlan()
    // Week 2 was missed entirely; weeks 1, 3 and 4 were trained.
    await trainWeeks(planId, [1, 3, 4])

    const preview = await previewRealign(DRIFTED_TODAY)
    expect(preview?.decision.resumeWeek).toBe(5)
    expect(preview?.weeksLeftBehind).toBe(4)
    // Week 2's sessions were never done, and the preview says so rather than
    // reporting nothing missed.
    expect(preview?.sessionsLeftBehind).toBeGreaterThan(0)

    await realignScheduleToToday({ today: DRIFTED_TODAY, now: NOW })

    const instances = await db.workoutInstances.where('planId').equals(planId).toArray()
    const pending = instances.filter(
      (i) => i.weekNumber < 5 && !i.frozen && i.status !== 'autoDropped' && i.status !== 'skipped',
    )
    expect(pending.map((i) => `week ${String(i.weekNumber)} ${i.status}`)).toEqual([])
  })

  it('clears pinned moves, which are usually what put the schedule out of step', async () => {
    const planId = await installPlan()
    await trainWeeks(planId, [1, 2, 3, 4])
    const target = (await db.workoutInstances.where('planId').equals(planId).toArray())
      .find((i) => !i.frozen && i.weekNumber === 12)
    if (!target) throw new Error('no week 12 session to pin')
    await setOverride({ instanceId: target.id, date: '2026-03-26', now: NOW })
    expect(await previewRealign(DRIFTED_TODAY)).toMatchObject({ pinnedMovesCleared: 1 })

    await realignScheduleToToday({ today: DRIFTED_TODAY, now: NOW })
    expect(await db.scheduleOverrides.count()).toBe(0)
  })

  it('is idempotent: realigning again the same day changes nothing', async () => {
    const planId = await installPlan()
    await trainWeeks(planId, [1, 2, 3, 4])
    await realignScheduleToToday({ today: DRIFTED_TODAY, now: NOW })
    const first = await activePlan()

    const second = await realignScheduleToToday({ today: DRIFTED_TODAY, now: NOW })
    expect(second?.outcome).toBe('alreadyAligned')
    expect(second?.requiresRegeneration).toBe(false)
    const after = await activePlan()
    expect(after.startDate).toBe(first.startDate)
    expect(after.weeksCount).toBe(first.weeksCount)
  })

  it('gives today a session to do, which is the point of starting today', async () => {
    const planId = await installPlan()
    await trainWeeks(planId, [1, 2, 3, 4])
    await realignScheduleToToday({ today: DRIFTED_TODAY, now: NOW })

    const instances = await db.workoutInstances.where('planId').equals(planId).toArray()
    expect(instances.filter((i) => i.scheduledDate === DRIFTED_TODAY && !i.frozen).length).toBeGreaterThan(0)
  })

  it('does nothing at all when race day has already passed', async () => {
    const planId = await installPlan()
    await trainWeeks(planId, [1, 2, 3, 4])
    const before = await activePlan()

    const decision = await realignScheduleToToday({ today: '2026-07-01', now: NOW })
    expect(decision?.outcome).toBe('raceInPast')
    const after = await activePlan()
    expect(after.startDate).toBe(before.startDate)
    expect(after.weeksCount).toBe(before.weeksCount)
  })

  it('starts the plan over from week 1 when nothing has been trained', async () => {
    await installPlan()
    await syncQueue(DRIFTED_TODAY)

    const decision = await realignScheduleToToday({ today: DRIFTED_TODAY, now: NOW })
    expect(decision?.resumeWeek).toBe(1)
    const plan = await activePlan()
    expect(plan.startDate).toBe(DRIFTED_MONDAY)
    // Thirteen weeks from this Monday through race week is all the runway left.
    expect(plan.weeksCount).toBe(13)
  })

  it('leaves every instance with at least one prescription after regenerating', async () => {
    const planId = await installPlan()
    await trainWeeks(planId, [1, 2, 3, 4])
    await realignScheduleToToday({ today: DRIFTED_TODAY, now: NOW })

    const instances = await db.workoutInstances.where('planId').equals(planId).toArray()
    const withRx = new Set((await db.instancePrescriptions.toArray()).map((p) => p.instanceId))
    expect(instances.filter((i) => !withRx.has(i.id)).map((i) => i.id)).toEqual([])
  })

  it('returns null rather than throwing when there is no plan to realign', async () => {
    await resetDatabase()
    await seedIfEmpty(db, NOW)
    expect(await realignScheduleToToday({ today: DRIFTED_TODAY, now: NOW })).toBeNull()
    expect(await previewRealign(DRIFTED_TODAY)).toBeUndefined()
  })
})
