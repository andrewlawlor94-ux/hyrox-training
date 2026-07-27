import type { ISODate } from '@/domain/types'
import { addDays, daysBetween, startOfIsoWeek } from '@/domain/dates'
import { MAX_GENERATED_BASE_WEEKS, PLAN_WEEKS_DEFAULT } from './constants'

/** Calendar days in one plan week — used to convert a week count into a day
 * offset when computing `weeksAvailable` and the deferred start date. */
const DAYS_PER_WEEK = 7
/** A race-in-the-past plan is still a real, usable plan: one week, the race
 * "week" and the only week, rather than a zero- or negative-length result. */
const SINGLE_WEEK_PLAN = 1

export type AnchorWarning = 'shortPlan' | 'raceInPast' | 'startDeferred'

export interface AnchorResult {
  /** Always a Monday — the queue engine's slot-to-day mapping depends on it. */
  planStartDate: ISODate
  raceWeekNumber: number
  totalWeeks: number
  coreWeeks: number
  baseWeeks: number
  deferredStartDate: ISODate | null
  warnings: AnchorWarning[]
  explanation: string
}

/**
 * Anchors a training plan to its race date. Week 24 (or however many core
 * weeks are requested) must always be the race week so the taper lands
 * correctly, which means the plan *start* is derived backwards from the
 * race date rather than forwards from today (§19, D1).
 *
 * Pure: no clock reads, no randomness. `today` is a required parameter.
 */
export function anchorPlan(args: { today: ISODate; raceDate: ISODate; coreWeeks?: number }): AnchorResult {
  const requestedCoreWeeks = args.coreWeeks ?? PLAN_WEEKS_DEFAULT
  const mondayToday = startOfIsoWeek(args.today)
  const mondayRace = startOfIsoWeek(args.raceDate)
  const weeksAvailable = daysBetween(mondayToday, mondayRace) / DAYS_PER_WEEK + 1

  // Race date already passed (or lands before this week starts): warn, but
  // still produce a usable single-week plan rather than throwing or going
  // negative.
  if (weeksAvailable < SINGLE_WEEK_PLAN) {
    return {
      planStartDate: mondayToday,
      raceWeekNumber: SINGLE_WEEK_PLAN,
      totalWeeks: SINGLE_WEEK_PLAN,
      coreWeeks: SINGLE_WEEK_PLAN,
      baseWeeks: 0,
      deferredStartDate: null,
      warnings: ['raceInPast'],
      explanation: `The race date has already passed, so a single usable week starts today, ${mondayToday}, instead of a negative-length plan.`,
    }
  }

  // Fewer weeks than requested: compress the core plan to fit rather than
  // starting in the past to preserve the full 24 weeks.
  if (weeksAvailable < requestedCoreWeeks) {
    const coreWeeks = weeksAvailable
    return {
      planStartDate: mondayToday,
      raceWeekNumber: coreWeeks,
      totalWeeks: coreWeeks,
      coreWeeks,
      baseWeeks: 0,
      deferredStartDate: null,
      warnings: ['shortPlan'],
      explanation: `Fewer than 24 weeks remain before race day, so the plan compresses to ${String(coreWeeks)} weeks, starting today, ${mondayToday}, with the taper still landing on race week.`,
    }
  }

  // Exactly enough weeks: start today, no compression, no filler.
  if (weeksAvailable === requestedCoreWeeks) {
    return {
      planStartDate: mondayToday,
      raceWeekNumber: requestedCoreWeeks,
      totalWeeks: requestedCoreWeeks,
      coreWeeks: requestedCoreWeeks,
      baseWeeks: 0,
      deferredStartDate: null,
      warnings: [],
      explanation: `The full ${String(requestedCoreWeeks)}-week plan starts today, ${mondayToday}, with the race landing in week ${String(requestedCoreWeeks)}.`,
    }
  }

  // More weeks than the core plan needs: fill the gap with editable Base
  // weeks so the athlete trains today instead of waiting, up to the cap.
  const gap = weeksAvailable - requestedCoreWeeks

  if (gap <= MAX_GENERATED_BASE_WEEKS) {
    const baseWeeks = gap
    const totalWeeks = baseWeeks + requestedCoreWeeks
    return {
      planStartDate: mondayToday,
      raceWeekNumber: totalWeeks,
      totalWeeks,
      coreWeeks: requestedCoreWeeks,
      baseWeeks,
      deferredStartDate: null,
      warnings: [],
      explanation: `${String(baseWeeks)} base week${baseWeeks === 1 ? '' : 's'} of aerobic and strength-maintenance work fill the gap ahead of the ${String(requestedCoreWeeks)}-week core plan, so training starts today, ${mondayToday}, rather than waiting for race week to get closer.`,
    }
  }

  // Beyond what Base weeks can usefully fill: defer the start instead so the
  // taper still lands on race week, and expose the deferred date for a
  // countdown display.
  const baseWeeks = MAX_GENERATED_BASE_WEEKS
  const totalWeeks = baseWeeks + requestedCoreWeeks
  const deferredStartDate = addDays(mondayRace, -DAYS_PER_WEEK * (requestedCoreWeeks + MAX_GENERATED_BASE_WEEKS - SINGLE_WEEK_PLAN))

  return {
    planStartDate: deferredStartDate,
    raceWeekNumber: totalWeeks,
    totalWeeks,
    coreWeeks: requestedCoreWeeks,
    baseWeeks,
    deferredStartDate,
    warnings: ['startDeferred'],
    explanation: `The race is more than ${String(requestedCoreWeeks + MAX_GENERATED_BASE_WEEKS)} weeks away, further out than base weeks can usefully fill, so the plan begins on ${deferredStartDate} instead of today — a countdown until then.`,
  }
}
