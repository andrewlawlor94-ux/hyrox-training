import type { IntervalSplit, SplitKind } from '@/domain/types'
import { paceSecPerKm } from './pace'

/** Metres in a kilometre, for converting a split's distanceM into the km
 * unit paceSecPerKm expects. */
const M_PER_KM = 1000
/** The only SplitKind counted toward work-rep stats; warmup/recovery/
 * cooldown splits contribute to session totals but not work stats. */
const WORK_KIND: SplitKind = 'work'

export interface SplitSummary {
  workCount: number
  totalWorkDistanceM: number
  totalSessionDistanceM: number
  totalWorkDurationSec: number
  meanWorkPaceSecPerKm: number | null
  fastestWorkPaceSecPerKm: number | null
  slowestWorkPaceSecPerKm: number | null
}

type SplitInput = Pick<IntervalSplit, 'kind' | 'distanceM' | 'durationSec'>
type SplitDistanceDuration = Pick<IntervalSplit, 'distanceM' | 'durationSec'>

/** Pace for a single split, or null if either field is missing or invalid. */
export function splitPaceSecPerKm(split: SplitDistanceDuration): number | null {
  if (split.distanceM === undefined || split.durationSec === undefined) return null
  return paceSecPerKm(split.distanceM / M_PER_KM, split.durationSec)
}

/**
 * Summarizes an interval session's splits. `meanWorkPaceSecPerKm` divides
 * the summed work duration by the summed work distance across work splits
 * that have both fields — it is deliberately NOT the average of per-split
 * paces, which would misweight unequal-length reps.
 */
export function summarizeSplits(splits: SplitInput[]): SplitSummary {
  let workCount = 0
  let totalWorkDistanceM = 0
  let totalWorkDurationSec = 0
  let totalSessionDistanceM = 0
  let pacedWorkDistanceM = 0
  let pacedWorkDurationSec = 0
  let fastestWorkPaceSecPerKm: number | null = null
  let slowestWorkPaceSecPerKm: number | null = null

  for (const split of splits) {
    if (split.distanceM !== undefined) totalSessionDistanceM += split.distanceM
    if (split.kind !== WORK_KIND) continue

    workCount += 1
    if (split.distanceM !== undefined) totalWorkDistanceM += split.distanceM
    if (split.durationSec !== undefined) totalWorkDurationSec += split.durationSec

    if (split.distanceM !== undefined && split.durationSec !== undefined) {
      pacedWorkDistanceM += split.distanceM
      pacedWorkDurationSec += split.durationSec
      const pace = splitPaceSecPerKm(split)
      if (pace !== null) {
        if (fastestWorkPaceSecPerKm === null || pace < fastestWorkPaceSecPerKm) fastestWorkPaceSecPerKm = pace
        if (slowestWorkPaceSecPerKm === null || pace > slowestWorkPaceSecPerKm) slowestWorkPaceSecPerKm = pace
      }
    }
  }

  const meanWorkPaceSecPerKm = pacedWorkDistanceM > 0
    ? paceSecPerKm(pacedWorkDistanceM / M_PER_KM, pacedWorkDurationSec)
    : null

  return {
    workCount,
    totalWorkDistanceM,
    totalSessionDistanceM,
    totalWorkDurationSec,
    meanWorkPaceSecPerKm,
    fastestWorkPaceSecPerKm,
    slowestWorkPaceSecPerKm,
  }
}
