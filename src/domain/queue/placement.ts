import type { ISODate, Priority, RecoveryTag } from '@/domain/types'
import { addDays, compareDates } from '@/domain/dates'
import type { OccupiedDay } from './eligibility'
import { isDayEligible } from './eligibility'
import { backdatedExplanation, deferredExplanation, droppedExplanation, movedExplanation, priorityGuardDropExplanation, weekdayName } from './explain'
import { AUTOMATED_PLACEMENT_WEEKDAYS_PER_WEEK, DAYS_PER_WEEK, PRIORITY_TIER_RANK } from './constants'

/** A not-yet-terminal instance still needing a placement decision. */
export interface OpenInstance {
  templateId: string
  weekNumber: number
  sequenceInWeek: number
  priority: Priority
  recoveryTags: RecoveryTag[]
  name: string
  plannedDate: ISODate
  /** True when an explicit DEFER event is the reason this instance is open —
   * it must land on a *different* day than `plannedDate`, not just an
   * eligible one, which is what distinguishes a deferral from ordinary
   * catch-up placement. */
  deferralRequested: boolean
}

export interface DroppedRecord {
  templateId: string
  priority: Priority
  reason: string
}

export interface PlacementOutcome {
  scheduledDate: ISODate | null
  explanation: string | null
  dropped: DroppedRecord | null
}

function laterOf(a: ISODate, b: ISODate): ISODate {
  return compareDates(a, b) >= 0 ? a : b
}

/** Every Monday-Saturday date in plan week `weekNumber`, restricted to
 * `[from, raceDate]`. Sunday is never a candidate for automated placement
 * (see `AUTOMATED_PLACEMENT_WEEKDAYS_PER_WEEK`). */
function candidateDaysForWeek(planStartDate: ISODate, weekNumber: number, from: ISODate, raceDate: ISODate): ISODate[] {
  const monday = addDays(planStartDate, (weekNumber - 1) * DAYS_PER_WEEK)
  const days: ISODate[] = []
  for (let offset = 0; offset < AUTOMATED_PLACEMENT_WEEKDAYS_PER_WEEK; offset += 1) {
    const day = addDays(monday, offset)
    if (compareDates(day, from) >= 0 && compareDates(day, raceDate) <= 0) days.push(day)
  }
  return days
}

function firstEligibleDay(days: ISODate[], tags: RecoveryTag[], occupied: OccupiedDay[], raceDate: ISODate): ISODate | null {
  for (const day of days) {
    if (isDayEligible({ candidate: day, candidateTags: tags, occupied, raceDate }).eligible) return day
  }
  return null
}

/** Step 8: the instance's own plan week, scanning forward from
 * `max(today, plannedDate)` (or `plannedDate + 1` for a deferral). */
function attemptOwnWeek(inst: OpenInstance, occupied: OccupiedDay[], today: ISODate, raceDate: ISODate, planStartDate: ISODate): ISODate | null {
  const earliestPlannedStart = inst.deferralRequested ? addDays(inst.plannedDate, 1) : inst.plannedDate
  const from = laterOf(today, earliestPlannedStart)
  const days = candidateDaysForWeek(planStartDate, inst.weekNumber, from, raceDate)
  return firstEligibleDay(days, inst.recoveryTags, occupied, raceDate)
}

/** Step 9's single escalation for `important`/`essential`: the following
 * plan week, tried exactly once. */
function attemptFollowingWeek(inst: OpenInstance, occupied: OccupiedDay[], raceDate: ISODate, planStartDate: ISODate): ISODate | null {
  const nextWeekNumber = inst.weekNumber + 1
  const nextWeekMonday = addDays(planStartDate, (nextWeekNumber - 1) * DAYS_PER_WEEK)
  const days = candidateDaysForWeek(planStartDate, nextWeekNumber, nextWeekMonday, raceDate)
  return firstEligibleDay(days, inst.recoveryTags, occupied, raceDate)
}

/**
 * A total order over open instances: `essential` before `important` before
 * `optional` (`PRIORITY_TIER_RANK`), then the existing `(weekNumber,
 * sequenceInWeek)` ordering within a tier, then `templateId` as a final,
 * data-derived tiebreaker so the result can never depend on input array
 * position. Placing strictly by tier — every essential decided, in full,
 * before any important is even attempted, and every important before any
 * optional — is what makes the priority-ladder invariant (an essential is
 * never `autoDropped` while a lower-priority same-week peer holds a
 * scheduled date) hold structurally rather than through a reactive,
 * after-the-fact correction: a lower-priority instance is simply never
 * *decided* while a higher-priority one still has an undecided fate.
 */
function byPriorityTier(a: OpenInstance, b: OpenInstance): number {
  const rankDiff = PRIORITY_TIER_RANK[a.priority] - PRIORITY_TIER_RANK[b.priority]
  if (rankDiff !== 0) return rankDiff
  if (a.weekNumber !== b.weekNumber) return a.weekNumber - b.weekNumber
  if (a.sequenceInWeek !== b.sequenceInWeek) return a.sequenceInWeek - b.sequenceInWeek
  if (a.templateId === b.templateId) return 0
  return a.templateId < b.templateId ? -1 : 1
}

/**
 * Places every open (non-frozen, non-pinned) instance, re-sorted internally
 * by `byPriorityTier` regardless of the order `openInstances` arrives in —
 * every essential is decided before any important is attempted, and every
 * important before any optional, which is what makes the priority-ladder
 * invariant hold by construction (see `byPriorityTier`) rather than through
 * a reactive "bump a lower-priority session" correction. Within a tier, the
 * existing `(weekNumber, sequenceInWeek)` order is what makes the
 * "no double-workout catch-up" behaviour fall out naturally: each instance
 * claims a day before the next one *in its tier* is even considered, so two
 * open instances of the same priority can never race for the same date
 * regardless of how far behind the plan is.
 *
 * `initialOccupied` (frozen instances plus pinned overrides) is copied, not
 * mutated, and grows by one entry each time an instance is placed.
 */
export function placeOpenInstances(
  openInstances: OpenInstance[],
  initialOccupied: OccupiedDay[],
  today: ISODate,
  raceDate: ISODate,
  planStartDate: ISODate,
): Map<string, PlacementOutcome> {
  const occupied: OccupiedDay[] = initialOccupied.map((o) => ({ ...o, tags: [...o.tags] }))
  const placements = new Map<string, PlacementOutcome>()
  const sorted = [...openInstances].sort(byPriorityTier)

  // Populated only with `weekNumber`s whose essential(s) were fully decided
  // and still dropped. Because every essential is processed (in full,
  // including its following-week escalation) before any important/optional
  // is even attempted, this set is complete by the time the first
  // lower-priority instance is considered — no lower-priority instance native
  // to one of these weeks may hold a scheduled date afterward, whether from
  // its own week or an escalation, or the invariant the priority ladder
  // exists to guarantee would be broken exactly as Finding A describes: a
  // lower-priority peer succeeding (via its own week *or* an escalation into
  // the essential's target week) while its same-week essential sits dropped.
  // This is a plain fact check against an already-final decision, not a
  // reactive search for a candidate to un-decide — the essential's own
  // outcome is never revisited.
  const weeksWithDroppedEssential = new Set<number>()

  const place = (inst: OpenInstance, day: ISODate): void => {
    occupied.push({ date: day, tags: [...inst.recoveryTags] })
    let explanation: string | null = null
    if (inst.deferralRequested) {
      explanation = deferredExplanation(inst.name, day)
    } else if (compareDates(day, inst.plannedDate) !== 0) {
      // A backdated completion (COMPLETE_EARLIER) that occupies this
      // instance's planned date is a different cause than an ordinary missed
      // day, and gets its own, causally-accurate copy rather than the
      // generic "was missed" phrasing (Finding 4).
      const backdatedOccupant = occupied.find((o) => o.date === inst.plannedDate && o.backdatedName !== undefined)
      explanation = backdatedOccupant?.backdatedName !== undefined
        ? backdatedExplanation(inst.name, backdatedOccupant.backdatedName)
        : movedExplanation(inst.name, day, `${weekdayName(inst.plannedDate)} was missed`)
    }
    placements.set(inst.templateId, { scheduledDate: day, explanation, dropped: null })
  }

  const drop = (inst: OpenInstance, guarded: boolean): void => {
    const explanation = guarded
      ? priorityGuardDropExplanation(inst.name, inst.priority)
      : droppedExplanation(inst.name, inst.priority, 'preserve recovery')
    const reason = guarded
      ? 'This week\'s essential session could not be placed, so lower-priority sessions in the same week are not scheduled either.'
      : 'No eligible day remained for this session before the plan needed to move on.'
    placements.set(inst.templateId, {
      scheduledDate: null,
      explanation,
      dropped: { templateId: inst.templateId, priority: inst.priority, reason },
    })
  }

  for (const inst of sorted) {
    if (inst.priority !== 'essential' && weeksWithDroppedEssential.has(inst.weekNumber)) {
      drop(inst, true)
      continue
    }

    const ownWeek = attemptOwnWeek(inst, occupied, today, raceDate, planStartDate)
    if (ownWeek !== null) {
      place(inst, ownWeek)
      continue
    }

    if (inst.priority === 'optional') {
      drop(inst, false)
      continue
    }

    const followingWeek = attemptFollowingWeek(inst, occupied, raceDate, planStartDate)
    if (followingWeek !== null) {
      place(inst, followingWeek)
      continue
    }

    drop(inst, false)
    if (inst.priority === 'essential') weeksWithDroppedEssential.add(inst.weekNumber)
  }

  return placements
}
