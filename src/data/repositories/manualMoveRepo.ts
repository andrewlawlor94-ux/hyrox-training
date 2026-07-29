// Task 27 (§14): previewing and committing a manual (pinned) move of one
// workout instance to a new date. The underlying pin mechanism (`setOverride`
// + `syncQueue`) and reset (`resetRecommendations`) already exist and are
// already tested (Task 16, `scheduleRepo.ts`) -- this module adds the
// "what would this conflict with, before I commit" preview the UI needs to
// warn the athlete, and the one convenience function that performs a move
// and records it as a single unit.
import { db } from '@/data/db'
import type { ISODate, ISOInstant } from '@/data/types'
import type { OccupiedDay } from '@/domain/queue/eligibility'
import { isDayEligible } from '@/domain/queue/eligibility'
import { pinSoftConflicts } from '@/domain/queue/pins'
import { assertMutable } from './guard'
import { appendEvent, setOverride, syncQueue } from './scheduleRepo'
import { getSettings } from './settingsRepo'

/**
 * Every plain-language conflict note a manual move of `instanceId` to `date`
 * would carry, computed with the same rules the queue engine's own pin
 * evaluation uses (`isDayEligible` + `pinSoftConflicts`) but WITHOUT writing
 * anything -- a pure preview so the UI can warn before the athlete commits.
 * Occupied days are every OTHER non-skipped/non-dropped instance in the
 * active plan, using its completed-for date when it has one, otherwise its
 * currently scheduled date; the instance being moved is excluded from its
 * own occupancy check. An empty array means no conflict at all.
 */
export async function previewMoveConflicts(args: { instanceId: string; date: ISODate }): Promise<string[]> {
  const instance = await db.workoutInstances.get(args.instanceId)
  if (!instance) throw new Error(`No WorkoutInstance "${args.instanceId}"`)

  const settings = await getSettings()
  const plan = await db.plans.get(settings.activePlanId)
  if (!plan) return []
  const goal = await db.raceGoals.filter((g) => g.isActive).first()
  const raceDate = goal?.raceDate ?? plan.startDate

  const siblings = await db.workoutInstances.where('planId').equals(plan.id).toArray()
  const occupied: OccupiedDay[] = siblings
    .filter((i) => i.id !== args.instanceId && i.status !== 'skipped' && i.status !== 'autoDropped')
    .map((i) => ({ date: i.completedForDate ?? i.scheduledDate, tags: [...i.recoveryTags] }))

  const evaluation = isDayEligible({ candidate: args.date, candidateTags: instance.recoveryTags, occupied, raceDate })
  return pinSoftConflicts(evaluation)
}

/**
 * Performs a manual move as one unit: appends the `MOVE` event (so it's part
 * of permanent schedule history), pins the instance onto `date`
 * (`setOverride`), then recomputes (`syncQueue`) so the change is visible
 * immediately. Guarded like every other instance write -- a frozen
 * (completed) instance can never be manually moved. Bypasses hard recovery
 * conflicts by design (§15: "manual moves ... let the athlete proceed") --
 * callers should show `previewMoveConflicts`'s result to the athlete first
 * and only call this after they choose to proceed.
 */
export async function moveWorkoutManually(args: { instanceId: string; date: ISODate; now: ISOInstant; today: ISODate }): Promise<void> {
  const instance = await db.workoutInstances.get(args.instanceId)
  if (!instance) throw new Error(`No WorkoutInstance "${args.instanceId}"`)
  assertMutable(instance)
  await appendEvent({ at: args.now, type: 'MOVE', instanceId: instance.templateId, payload: { date: args.date } })
  await setOverride({ instanceId: args.instanceId, date: args.date, now: args.now })
  await syncQueue(args.today)
}
