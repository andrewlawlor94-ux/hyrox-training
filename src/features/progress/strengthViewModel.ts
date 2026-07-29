import type { Exercise, ISODate, Unit } from '@/data/types'
import { hasEnough1RMData, oneRepMaxTrend } from '@/domain/strength/oneRepMax'
import type { SessionPerformance } from '@/domain/strength/oneRepMax'
import { computePersonalBests } from '@/domain/strength/personalBests'
import type { PersonalBests } from '@/domain/strength/personalBests'
import type { StrengthRecommendation } from '@/domain/recommendations/strengthTarget'
import { RECENT_SESSIONS_LIMIT } from './constants'

export interface WorkingWeightPoint {
  date: ISODate
  weight: number
  unit: Unit
}

export interface OneRepMaxVM {
  hasEnough: boolean
  points: { date: ISODate; estimated1RM: number }[]
}

export interface StrengthDetailVM {
  exercise: Exercise
  workingWeight: WorkingWeightPoint[]
  oneRM: OneRepMaxVM
  personalBests: PersonalBests
  /** Most-recent-first, capped at `RECENT_SESSIONS_LIMIT` — enough to see a
   * short pattern without an unbounded list. */
  recentSessions: SessionPerformance[]
  recommendation: StrengthRecommendation
}

/** The "working weight" for a session is its first completed set's weight —
 * the same definition `recommendStrengthTarget`'s own `summarizeSession`
 * uses for straight-set prescriptions (see that function's doc comment), so
 * this chart and the recommendation card agree on what "working weight"
 * means rather than silently disagreeing on two different readings of the
 * same session. */
function workingWeightSeries(sessions: SessionPerformance[]): WorkingWeightPoint[] {
  const points: WorkingWeightPoint[] = []
  for (const session of sessions) {
    const first = session.sets[0]
    if (!first) continue
    points.push({ date: session.date, weight: first.weight, unit: first.unit })
  }
  return points
}

function sortDescByDate(sessions: SessionPerformance[]): SessionPerformance[] {
  return [...sessions].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

/**
 * Composes the tested pure functions (`oneRepMaxTrend`, `hasEnough1RMData`,
 * `computePersonalBests`) plus an already-computed `StrengthRecommendation`
 * into the single shape `StrengthProgress`'s child components render. Pure —
 * takes the recommendation as an argument rather than computing it, so this
 * function itself needs no repository access and stays trivially testable.
 */
export function buildStrengthDetailVM(
  exercise: Exercise,
  sessions: SessionPerformance[],
  recommendation: StrengthRecommendation,
): StrengthDetailVM {
  return {
    exercise,
    workingWeight: workingWeightSeries(sessions),
    oneRM: { hasEnough: hasEnough1RMData(sessions), points: oneRepMaxTrend(sessions) },
    personalBests: computePersonalBests(sessions),
    recentSessions: sortDescByDate(sessions).slice(0, RECENT_SESSIONS_LIMIT),
    recommendation,
  }
}
