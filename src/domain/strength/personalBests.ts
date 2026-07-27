import type { ISODate, Unit } from '@/domain/types'
import type { SessionPerformance } from './oneRepMax'
import { epley1RM } from './oneRepMax'

export interface PersonalBests {
  heaviestSet: { weight: number; reps: number; unit: Unit; date: ISODate } | null
  bestEstimated1RM: { value: number; unit: Unit; date: ISODate } | null
  mostRepsAtOrAbove: (weight: number) => { reps: number; date: ISODate } | null
  bestVolumeSession: { volume: number; unit: Unit; date: ISODate } | null
}

function sortAscendingByDate(sessions: SessionPerformance[]): SessionPerformance[] {
  return [...sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

/**
 * Computes personal bests from session history. Ties resolve to the
 * earliest date: sessions are visited in ascending date order and every
 * comparison uses strict `>`, so the first (earliest) occurrence of a tied
 * value is never displaced by a later one.
 */
export function computePersonalBests(sessions: SessionPerformance[]): PersonalBests {
  const sorted = sortAscendingByDate(sessions)

  let heaviestSet: PersonalBests['heaviestSet'] = null
  let bestEstimated1RM: PersonalBests['bestEstimated1RM'] = null
  let bestVolumeSession: PersonalBests['bestVolumeSession'] = null

  for (const session of sorted) {
    let sessionVolume = 0
    let sessionBestEstimate: number | null = null
    let sessionUnit: Unit | null = null

    for (const set of session.sets) {
      sessionUnit ??= set.unit
      sessionVolume += set.weight * set.reps

      if (heaviestSet === null || set.weight > heaviestSet.weight) {
        heaviestSet = { weight: set.weight, reps: set.reps, unit: set.unit, date: session.date }
      }

      const estimate = epley1RM(set.weight, set.reps)
      if (estimate !== null && (sessionBestEstimate === null || estimate > sessionBestEstimate)) {
        sessionBestEstimate = estimate
      }
    }

    if (
      sessionBestEstimate !== null && sessionUnit !== null
      && (bestEstimated1RM === null || sessionBestEstimate > bestEstimated1RM.value)
    ) {
      bestEstimated1RM = { value: sessionBestEstimate, unit: sessionUnit, date: session.date }
    }

    if (
      session.sets.length > 0 && sessionUnit !== null
      && (bestVolumeSession === null || sessionVolume > bestVolumeSession.volume)
    ) {
      bestVolumeSession = { volume: sessionVolume, unit: sessionUnit, date: session.date }
    }
  }

  const mostRepsAtOrAbove = (weight: number): { reps: number; date: ISODate } | null => {
    let best: { reps: number; date: ISODate } | null = null
    for (const session of sorted) {
      for (const set of session.sets) {
        if (set.weight >= weight && (best === null || set.reps > best.reps)) {
          best = { reps: set.reps, date: session.date }
        }
      }
    }
    return best
  }

  return { heaviestSet, bestEstimated1RM, mostRepsAtOrAbove, bestVolumeSession }
}
