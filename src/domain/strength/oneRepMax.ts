import type { ISODate, Unit } from '@/domain/types'
import { EPLEY_MAX_REPS, EPLEY_REPS_DIVISOR, ONE_RM_MIN_SESSIONS } from './constants'

export interface SetPerformance {
  weight: number
  reps: number
  unit: Unit
  rir?: number
}

export interface SessionPerformance {
  date: ISODate
  sets: SetPerformance[]
}

function isPositiveFinite(n: number): boolean {
  return Number.isFinite(n) && n > 0
}

/**
 * Epley estimated one-rep max: weight * (1 + reps / EPLEY_REPS_DIVISOR).
 * Returns null for non-positive/non-finite weight or reps, and for reps
 * above EPLEY_MAX_REPS, where the formula loses validity — withholding an
 * estimate there is correct behaviour, not a missing feature.
 */
export function epley1RM(weight: number, reps: number): number | null {
  if (!isPositiveFinite(weight) || !isPositiveFinite(reps)) return null
  if (reps > EPLEY_MAX_REPS) return null
  return weight * (1 + reps / EPLEY_REPS_DIVISOR)
}

/**
 * The highest Epley estimate across a session's sets — not necessarily the
 * heaviest weight lifted (e.g. 175x8 estimates higher than 200x1).
 */
export function sessionBest1RM(session: SessionPerformance): number | null {
  let best: number | null = null
  for (const set of session.sets) {
    const estimate = epley1RM(set.weight, set.reps)
    if (estimate !== null && (best === null || estimate > best)) best = estimate
  }
  return best
}

/**
 * The 1RM trend across sessions, in ascending date order. ISO dates sort
 * lexicographically as plain strings, so no date parsing is needed.
 * Sessions with no usable estimate are omitted.
 */
export function oneRepMaxTrend(sessions: SessionPerformance[]): { date: ISODate; estimated1RM: number }[] {
  const points: { date: ISODate; estimated1RM: number }[] = []
  for (const session of sessions) {
    const estimate = sessionBest1RM(session)
    if (estimate !== null) points.push({ date: session.date, estimated1RM: estimate })
  }
  return points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/** True once at least ONE_RM_MIN_SESSIONS sessions yield a usable estimate. */
export function hasEnough1RMData(sessions: SessionPerformance[]): boolean {
  const qualifying = sessions.filter((session) => sessionBest1RM(session) !== null).length
  return qualifying >= ONE_RM_MIN_SESSIONS
}
