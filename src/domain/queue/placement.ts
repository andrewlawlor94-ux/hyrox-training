import type { ISODate, Priority, RecoveryTag } from '@/domain/types'
import { addDays, compareDates, daysBetween } from '@/domain/dates'
import type { OccupiedDay } from './eligibility'
import { isDayEligible } from './eligibility'
import { backdatedExplanation, deferredExplanation, droppedExplanation, movedExplanation, weekdayName } from './explain'
import { AUTOMATED_PLACEMENT_WEEKDAYS_PER_WEEK, BUMP_PRIORITY_ORDER, DAYS_PER_WEEK } from './constants'

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

/** True when `date` falls within plan week `weekNumber`'s calendar span
 * (Monday through Sunday), regardless of which template's own week that
 * date's session nominally belongs to — this is what lets an instance that
 * spilled over from an earlier week's escalation (`attemptFollowingWeek`)
 * still count as occupying *this* week's calendar space. */
function isDateInWeek(date: ISODate, weekNumber: number, planStartDate: ISODate): boolean {
  const monday = addDays(planStartDate, (weekNumber - 1) * DAYS_PER_WEEK)
  const offset = daysBetween(monday, date)
  return offset >= 0 && offset < DAYS_PER_WEEK
}

/** Frees up room in `weekNumber`'s calendar span for a still-unplaced
 * `essential` deferring into it, by shedding that week's own lowest-priority
 * session (optional before important, per `BUMP_PRIORITY_ORDER`). Mutates
 * `occupied` and `placements` in place. Returns whether a session was
 * actually shed.
 *
 * A candidate qualifies two ways: (1) it already holds a day that falls
 * within `weekNumber`'s calendar span — whether that's its own native week
 * or a day it reached by spilling over from an earlier week's escalation —
 * in which case that day is freed from `occupied`; or (2) it is native to
 * `weekNumber` and has not been decided at all yet, in which case it is
 * marked dropped *before* it ever gets a turn, rather than only being
 * eligible once it has already (by luck of processing order) claimed a day.
 * That second branch is what closes Finding 2b's gap: since the outer loop
 * processes weeks in ascending order, `weekNumber`'s own templates are
 * ordinarily still undecided when an earlier week's essential reaches this
 * point, so restricting the search to already-placed instances would let an
 * undecided lower-priority session go on to place successfully later —
 * exactly the invariant the priority ladder exists to prevent. A candidate
 * already decided as dropped offers nothing further and is skipped. The
 * `placements.has` guard in the main loop below is what stops a
 * preemptively-dropped candidate from being silently re-decided (and
 * potentially placed) once the outer loop reaches its own turn. */
function bumpLowestPriorityInWeek(
  weekNumber: number,
  openInstances: OpenInstance[],
  placements: Map<string, PlacementOutcome>,
  occupied: OccupiedDay[],
  planStartDate: ISODate,
): boolean {
  for (const priority of BUMP_PRIORITY_ORDER) {
    const candidate = openInstances.find((i) => {
      if (i.priority !== priority) return false
      const placed = placements.get(i.templateId)
      if (placed === undefined) return i.weekNumber === weekNumber
      if (placed.scheduledDate === null) return false
      return isDateInWeek(placed.scheduledDate, weekNumber, planStartDate)
    })
    if (candidate === undefined) continue

    const placed = placements.get(candidate.templateId)
    const scheduledDate = placed?.scheduledDate ?? null
    if (scheduledDate !== null) {
      const idx = occupied.findIndex((o) => o.date === scheduledDate)
      if (idx !== -1) occupied.splice(idx, 1)
    }
    placements.set(candidate.templateId, {
      scheduledDate: null,
      explanation: droppedExplanation(candidate.name, candidate.priority, 'make room for an essential session in the following week'),
      dropped: { templateId: candidate.templateId, priority: candidate.priority, reason: 'Made room for an essential session in the following week.' },
    })
    return true
  }
  return false
}

/**
 * Places every open (non-frozen, non-pinned) instance in the order given —
 * callers must pass instances already sorted by (weekNumber,
 * sequenceInWeek), which is what makes the "no double-workout catch-up"
 * behaviour fall out naturally: each instance claims a day before the next
 * one is even considered, so two open instances can never race for the same
 * date regardless of how far behind the plan is.
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

  const drop = (inst: OpenInstance): void => {
    placements.set(inst.templateId, {
      scheduledDate: null,
      explanation: droppedExplanation(inst.name, inst.priority, 'preserve recovery'),
      dropped: { templateId: inst.templateId, priority: inst.priority, reason: 'No eligible day remained for this session before the plan needed to move on.' },
    })
  }

  for (const inst of openInstances) {
    // Already decided — either a previous essential's bump preemptively
    // dropped this instance before its own turn (Finding 2b), or (in
    // principle) something else already resolved it. Re-processing it here
    // would silently overwrite that earlier, deliberate decision.
    if (placements.has(inst.templateId)) continue

    const ownWeek = attemptOwnWeek(inst, occupied, today, raceDate, planStartDate)
    if (ownWeek !== null) {
      place(inst, ownWeek)
      continue
    }

    if (inst.priority === 'optional') {
      drop(inst)
      continue
    }

    const followingWeek = attemptFollowingWeek(inst, occupied, raceDate, planStartDate)
    if (followingWeek !== null) {
      place(inst, followingWeek)
      continue
    }

    if (inst.priority === 'important') {
      drop(inst)
      continue
    }

    // essential: shed the *following* week's lowest-priority session (the
    // week it is actually deferring into, not its own) and retry once.
    const freedRoom = bumpLowestPriorityInWeek(inst.weekNumber + 1, openInstances, placements, occupied, planStartDate)
    const retryDay = freedRoom
      ? attemptOwnWeek(inst, occupied, today, raceDate, planStartDate) ?? attemptFollowingWeek(inst, occupied, raceDate, planStartDate)
      : null
    if (retryDay !== null) {
      place(inst, retryDay)
    } else {
      drop(inst)
    }
  }

  return placements
}
