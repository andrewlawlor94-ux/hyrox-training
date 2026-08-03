// "Realign the schedule to today": read what the athlete has actually done,
// resume the plan at the week they really reached, and lay the rest out from
// today with race week still last. Kept out of `planRepo.ts` (already at the
// ~250-line guideline) and out of `planEditRepo.ts` (which owns within-week
// editing) because this is its own operation with its own preview.
import { db } from '@/data/db'
import type { ISODate, ISOInstant, WorkoutInstance, WorkoutStatus } from '@/data/types'
import { daysBetween, startOfIsoWeek } from '@/domain/dates'
import type { HistoricalSession, RealignDecision, SessionOutcome } from '@/domain/planGeneration/realign'
import { realignPlanToToday, resumeWeekFromHistory } from '@/domain/planGeneration/realign'
import { BASE_PHASE_NAME, materializePlan, pruneHistorylessPlanData } from './planMaterialize'
import { resetRecommendations, syncQueue } from './scheduleRepo'
import { getSettings, readSettings } from './settingsRepo'

/** Calendar days in one plan week. */
const DAYS_PER_WEEK = 7
/** Statuses that mean the session was genuinely done, in full or in part. */
const ATTENDED_STATUSES: readonly WorkoutStatus[] = ['completed', 'partiallyCompleted']
/** Decisions already made — a skip the athlete chose, or a drop the plan made
 * to protect recovery. Neither counts as progress, and neither holds its week
 * open waiting to be finished. */
const SETTLED_STATUSES: readonly WorkoutStatus[] = ['skipped', 'autoDropped']
/** Statuses that carry real work even though nothing is completed yet, so the
 * plan must never end before the week holding them. */
const HISTORY_BEARING_STATUSES: readonly WorkoutStatus[] = [...ATTENDED_STATUSES, 'inProgress']

function outcomeOf(instance: WorkoutInstance): SessionOutcome {
  if (ATTENDED_STATUSES.includes(instance.status)) return 'attended'
  if (SETTLED_STATUSES.includes(instance.status)) return 'settled'
  // upcoming / available / inProgress / deferred — work still genuinely to come.
  return 'outstanding'
}

export interface RealignPreview {
  decision: RealignDecision
  /** The plan week today falls in RIGHT NOW, straight off the calendar. Read
   * next to `decision.requestedResumeWeek` this is the drift itself: the plan
   * claims one week, the athlete's history says another. `0` or less when the
   * plan has not started yet. */
  currentWeekNumber: number
  /** Plan weeks that will end up entirely behind the resume week. */
  weeksLeftBehind: number
  /** Sessions in those weeks that were never done — skipped, dropped, or simply
   * never reached — and now never will be. */
  sessionsLeftBehind: number
  /** Manual pins and reschedules that will be cleared. */
  pinnedMovesCleared: number
}

interface RealignContext {
  planId: string
  startDate: ISODate
  baseWeeks: number
  coreWeeks: number
  instances: WorkoutInstance[]
  raceDate: ISODate
}

/** Pure read of everything the decision needs. `undefined` when there is no
 * active plan or no active race goal to align against. */
async function readContext(): Promise<RealignContext | undefined> {
  const settings = await readSettings()
  const plan = await db.plans.get(settings.activePlanId)
  if (!plan) return undefined
  const goal = await db.raceGoals.filter((g) => g.isActive).first()
  if (!goal) return undefined

  const [weeks, phases, instances] = await Promise.all([
    db.planWeeks.where('planId').equals(plan.id).toArray(),
    db.planPhases.where('planId').equals(plan.id).toArray(),
    db.workoutInstances.where('planId').equals(plan.id).toArray(),
  ])
  const phaseNameById = new Map(phases.map((phase) => [phase.id, phase.name]))
  const baseWeeks = weeks.filter((w) => phaseNameById.get(w.phaseId) === BASE_PHASE_NAME).length

  return {
    planId: plan.id,
    startDate: plan.startDate,
    baseWeeks,
    coreWeeks: Math.max(1, plan.weeksCount - baseWeeks),
    instances,
    raceDate: goal.raceDate,
  }
}

function decide(context: RealignContext, today: ISODate): RealignDecision {
  const sessions: HistoricalSession[] = context.instances.map((instance) => ({
    weekNumber: instance.weekNumber,
    outcome: outcomeOf(instance),
  }))
  const lastHistoryWeek = context.instances
    .filter((instance) => instance.frozen || HISTORY_BEARING_STATUSES.includes(instance.status))
    .reduce((highest, instance) => Math.max(highest, instance.weekNumber), 0)

  return realignPlanToToday({
    today,
    raceDate: context.raceDate,
    currentStartDate: context.startDate,
    baseWeeks: context.baseWeeks,
    currentCoreWeeks: context.coreWeeks,
    resumeWeek: resumeWeekFromHistory(sessions),
    lastHistoryWeek,
  })
}

/**
 * What a realign would do, without doing any of it. A realign moves every
 * upcoming session and can regenerate the plan's future content, so the athlete
 * gets to read the consequences first.
 *
 * A pure read — safe inside `useLiveQuery`.
 */
export async function previewRealign(today: ISODate): Promise<RealignPreview | undefined> {
  const context = await readContext()
  if (context === undefined) return undefined
  const decision = decide(context, today)

  const leftBehind = context.instances.filter((instance) => instance.weekNumber < decision.resumeWeek)
  const weeksLeftBehind = new Set(leftBehind.map((instance) => instance.weekNumber)).size
  // Anything not attended, not just what is still open: a session those weeks
  // auto-dropped was never done either, and reporting only the open ones would
  // read as "nothing was missed" for exactly the drift this fixes.
  const sessionsLeftBehind = leftBehind.filter((instance) => outcomeOf(instance) !== 'attended').length
  const pinnedMovesCleared = await db.scheduleOverrides.count()
  const currentWeekNumber = daysBetween(startOfIsoWeek(context.startDate), startOfIsoWeek(today)) / DAYS_PER_WEEK + 1

  return { decision, currentWeekNumber, weeksLeftBehind, sessionsLeftBehind, pinnedMovesCleared }
}

/**
 * Puts the plan back in step with the athlete: the week history says they
 * reached starts today, race week is still the plan's last week, and every
 * stale pin and manual reschedule is dropped.
 *
 * What survives, by construction:
 * - Every completed session, its logs, and the dates it was really done on.
 *   Nothing here writes to a frozen `WorkoutInstance`, and the `syncQueue` that
 *   follows skips every frozen row.
 * - Every in-progress session that has logged work (`pruneHistorylessPlanData`
 *   treats a logged row as history whether or not the session is frozen).
 *
 * What does not: hand-edits to sessions that have never been started, but ONLY
 * when the plan's length actually changes and its future content therefore has
 * to be regenerated. A realign that just shifts dates leaves every row in place
 * and edits it in situ — which is why `requiresRegeneration` is part of the
 * decision rather than an assumption.
 *
 * Returns the decision so the caller can tell the athlete what happened, or
 * `null` when there is no active plan and goal to align.
 */
export async function realignScheduleToToday(args: { today: ISODate; now: ISOInstant }): Promise<RealignDecision | null> {
  const decision = await db.transaction('r', db.tables, async () => {
    const context = await readContext()
    return context === undefined ? null : decide(context, args.today)
  })
  if (decision === null) return null

  // Nothing to align against: leave the plan exactly as it is rather than
  // rearranging it around a date that has gone.
  if (decision.outcome === 'raceInPast') return decision

  await db.transaction('rw', db.tables, async () => {
    const settings = await getSettings()
    const plan = await db.plans.get(settings.activePlanId)
    if (!plan) return

    if (decision.requiresRegeneration) {
      const { existingPlanWeeks, skipSlots } = await pruneHistorylessPlanData(plan.id)
      await materializePlan({
        planId: plan.id, planStartDate: decision.startDate,
        baseWeeksCount: decision.baseWeeks, coreWeeksCount: decision.coreWeeks,
        existingPlanWeeks, skipSlots,
      })
    }

    await db.plans.put({ ...plan, startDate: decision.startDate, weeksCount: decision.totalWeeks })
  })

  // Clears every pin and discards prior MOVE/DEFER events while keeping every
  // completion — a schedule that is "out of whack" usually is because of those,
  // and re-deriving dates around them would only reproduce the mess.
  await resetRecommendations(args.now)
  await syncQueue(args.today)
  return decision
}
