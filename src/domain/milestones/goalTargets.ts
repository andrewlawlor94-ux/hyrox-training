import {
  BENCHMARK_5K_KM,
  COMPROMISED_PENALTY_SEC_PER_KM,
  MIN_STANDALONE_5K_PACE_SEC_PER_KM,
  RACE_RUN_KM,
  STATION_AND_ROXZONE_BUDGET_SEC,
} from './constants'

export interface GoalTargets {
  /** The active race-time goal these targets were derived from, in seconds. */
  targetSeconds: number
  /** Target per-km pace, in seconds, for the eight race-run kilometres. */
  compromisedKmTargetSec: number
  /** Target standalone (fresh) 5 km time, in seconds. */
  standalone5kTargetSec: number
  /** `targetSeconds` minus the station/roxzone budget — the time left for running. */
  runBudgetSec: number
}

/**
 * Derives the goal-dependent running milestones from the active target race
 * time (D15, §4.6). Recalculates whenever the goal changes — nothing here is
 * a hard-coded pace.
 *
 * `runBudgetSec` is clamped so that an absurd goal (e.g. a sub-17-minute
 * finish) can never push `standalone5kTargetSec` to zero or negative: the
 * floor keeps the derived compromised-km pace at least
 * `MIN_STANDALONE_5K_PACE_SEC_PER_KM` seconds slower than the penalty being
 * subtracted from it, so the 5 km target always comes out strictly positive.
 * For every realistic goal time the floor is far below the natural budget
 * and never engages.
 */
export function goalTargets(
  targetSeconds: number,
  opts?: { stationBudgetSec?: number; penaltySecPerKm?: number },
): GoalTargets {
  const stationBudgetSec = opts?.stationBudgetSec ?? STATION_AND_ROXZONE_BUDGET_SEC
  const penaltySecPerKm = opts?.penaltySecPerKm ?? COMPROMISED_PENALTY_SEC_PER_KM

  const minCompromisedKmTargetSec = penaltySecPerKm + MIN_STANDALONE_5K_PACE_SEC_PER_KM
  const minRunBudgetSec = RACE_RUN_KM * minCompromisedKmTargetSec

  const runBudgetSec = Math.max(minRunBudgetSec, targetSeconds - stationBudgetSec)
  const compromisedKmTargetSec = runBudgetSec / RACE_RUN_KM
  const standalone5kTargetSec = BENCHMARK_5K_KM * (compromisedKmTargetSec - penaltySecPerKm)

  return { targetSeconds, compromisedKmTargetSec, standalone5kTargetSec, runBudgetSec }
}
