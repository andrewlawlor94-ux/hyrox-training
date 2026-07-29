import type { MilestoneFacts, MilestoneResult } from './evaluate'
import type { GoalTargets } from './goalTargets'
import {
  COMPROMISED_KM_REQUIRED_COUNT,
  RACE_ESTIMATE_BAND_FRACTION,
  RACE_RUN_KM,
  TRAJECTORY_NEEDS_ATTENTION_DELTA,
  TRAJECTORY_SLIGHTLY_BEHIND_DELTA,
} from './constants'

export type Trajectory = 'ahead' | 'onTrack' | 'slightlyBehind' | 'needsAttention'

export interface TrajectoryResult {
  trajectory: Trajectory
  /** Progress-only summary. Never a predicted finishing time (D14). */
  headline: string
  /** Always names specific milestones — never a bare status label. */
  evidence: string[]
}

export interface RaceEstimate {
  lowSeconds: number
  highSeconds: number
}

/** Higher ranks are "better on track". Used only to compare against the
 * symptom cap's ceiling (`slightlyBehind`), never displayed directly. */
const TRAJECTORY_RANK: Record<Trajectory, number> = {
  needsAttention: 0,
  slightlyBehind: 1,
  onTrack: 2,
  ahead: 3,
}

function milestoneEvidenceLine(result: MilestoneResult): string {
  switch (result.status) {
    case 'achieved':
      return `${result.label}: achieved.`
    case 'atRisk':
      return `${result.label}: at risk — not yet met, target week ${String(result.targetWeek)}.`
    case 'inProgress':
      return `${result.label}: in progress.`
    case 'notStarted':
      return `${result.label}: not started.`
  }
}

function buildHeadline(trajectory: Trajectory, metCount: number, totalMilestones: number, currentWeek: number, totalWeeks: number): string {
  const progress = `${String(metCount)} of ${String(totalMilestones)} milestones met by week ${String(currentWeek)} of ${String(totalWeeks)}`
  switch (trajectory) {
    case 'ahead':
      return `Ahead of schedule — ${progress}.`
    case 'onTrack':
      return `On track — ${progress}.`
    case 'slightlyBehind':
      return `Slightly behind — ${progress}.`
    case 'needsAttention':
      return `Needs attention — ${progress}.`
  }
}

/**
 * Maps milestone-evidence counts to a trajectory (§4.6). `expectedByNow`
 * scales linearly with plan progress; the delta between met and expected
 * maps to a status via `TRAJECTORY_SLIGHTLY_BEHIND_DELTA` /
 * `TRAJECTORY_NEEDS_ATTENTION_DELTA`.
 *
 * Any elevated symptom flag caps the result at `slightlyBehind` at best —
 * the athlete's recurring shin/sciatic history and running volume are this
 * plan's main risk, so strong milestone numbers must never mask a flagged
 * symptom. The cap only ever pulls the status down (toward
 * `needsAttention`); it never improves a result that is already at or below
 * `slightlyBehind`.
 */
export function computeTrajectory(
  results: MilestoneResult[],
  facts: Pick<MilestoneFacts, 'currentWeek' | 'totalWeeks' | 'symptomsFlagged'>,
): TrajectoryResult {
  const totalMilestones = results.length
  const metCount = results.filter((r) => r.status === 'achieved').length
  const expectedByNow = Math.round((totalMilestones * facts.currentWeek) / facts.totalWeeks)
  const delta = metCount - expectedByNow

  let base: Trajectory
  if (delta <= TRAJECTORY_NEEDS_ATTENTION_DELTA) base = 'needsAttention'
  else if (delta <= TRAJECTORY_SLIGHTLY_BEHIND_DELTA) base = 'slightlyBehind'
  else if (delta === 0) base = 'onTrack'
  else base = 'ahead'

  const capApplies = facts.symptomsFlagged && TRAJECTORY_RANK[base] > TRAJECTORY_RANK.slightlyBehind
  const trajectory: Trajectory = capApplies ? 'slightlyBehind' : base

  const evidence = results.map(milestoneEvidenceLine)
  if (capApplies) {
    evidence.push(
      'Trajectory capped at slightlyBehind: an elevated symptom flag is active, and running volume is this plan\'s main risk.',
    )
  } else if (facts.symptomsFlagged) {
    evidence.push('An elevated symptom flag is active.')
  }

  const headline = buildHeadline(trajectory, metCount, totalMilestones, facts.currentWeek, facts.totalWeeks)

  return { trajectory, headline, evidence }
}

/**
 * A race-time range, never a point value (D14) — and only ever returned
 * once there is real evidence for all four of its inputs: a 5 km
 * benchmark, a compromised-km mean backed by at least
 * `COMPROMISED_KM_REQUIRED_COUNT` genuine efforts, and a completed 75%
 * simulation. Missing any one of these yields `null` rather than a guess
 * built on incomplete data — the mean alone being non-null is not enough:
 * `compromisedKmMeanSec` can be computed from as little as a single logged
 * kilometre, which is not "enough real data" by this domain's own stated
 * bar (`COMPROMISED_KM_REQUIRED_COUNT`), so the count is checked
 * independently rather than trusting the mean's mere presence.
 *
 * The projection itself uses only the observed compromised-km mean (the
 * closest available proxy for race-day running pace) plus the station and
 * roxzone budget recovered from `targets` — not the 5 km benchmark or the
 * simulation boolean, which serve only as corroborating evidence that there
 * is enough real data to venture an estimate at all.
 */
export function estimateRaceRange(facts: MilestoneFacts, targets: GoalTargets): RaceEstimate | null {
  const { best5kSeconds, compromisedKmMeanSec, compromisedKmCount, seventyFiveSimulationDone } = facts
  if (
    best5kSeconds === null
    || compromisedKmMeanSec === null
    || compromisedKmCount < COMPROMISED_KM_REQUIRED_COUNT
    || !seventyFiveSimulationDone
  ) return null

  const stationAndRoxzoneSec = targets.targetSeconds - targets.runBudgetSec
  const projectedSeconds = compromisedKmMeanSec * RACE_RUN_KM + stationAndRoxzoneSec

  const lowSeconds = projectedSeconds * (1 - RACE_ESTIMATE_BAND_FRACTION)
  const highSeconds = projectedSeconds * (1 + RACE_ESTIMATE_BAND_FRACTION)

  return { lowSeconds, highSeconds }
}
