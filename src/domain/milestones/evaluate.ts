import type { GoalTargets } from './goalTargets'
import {
  COMFORTABLE_10K_KM,
  COMPROMISED_KM_REQUIRED_COUNT,
  FOUR_WORKOUT_WEEKS_REQUIRED,
  HUNDRED_WALL_BALL_SESSIONS_REQUIRED,
  LONGEST_RUN_TARGET_KM,
  MILESTONE_LABELS,
  MILESTONE_ORDER,
  MILESTONE_TARGET_WEEKS,
  RACE_LOAD_SLED_SESSIONS_REQUIRED,
  SECONDS_PER_MINUTE,
  WEEKLY_RUN_DISTANCE_TARGET_KM,
} from './constants'
import type { MilestoneKey } from './constants'

export type MilestoneStatus = 'notStarted' | 'inProgress' | 'achieved' | 'atRisk'

export interface MilestoneEvidence {
  label: string
  value: string
  target: string
  met: boolean
}

export interface MilestoneResult {
  key: MilestoneKey
  label: string
  status: MilestoneStatus
  targetWeek: number
  evidence: MilestoneEvidence[]
}

export interface MilestoneFacts {
  currentWeek: number
  totalWeeks: number
  weeksWithFourPlusSessions: number
  weeklyRunKm: { weekNumber: number; km: number }[]
  longestContinuousRunKm: number
  best5kSeconds: number | null
  compromisedKmMeanSec: number | null
  compromisedKmCount: number
  raceLoadSledSessions: number
  hundredWallBallSessions: number
  halfSimulationDone: boolean
  seventyFiveSimulationDone: boolean
  fullRehearsalDone: boolean
  symptomsFlagged: boolean
}

/** Formats a seconds duration as `m:ss` (or `h:mm:ss` were it ever needed —
 * every duration in this module is well under an hour). */
function formatClock(totalSeconds: number): string {
  const rounded = Math.round(totalSeconds)
  const minutes = Math.floor(rounded / SECONDS_PER_MINUTE)
  const seconds = rounded % SECONDS_PER_MINUTE
  return `${String(minutes)}:${String(seconds).padStart(2, '0')}`
}

function formatPace(secPerKm: number): string {
  return `${formatClock(secPerKm)}/km`
}

function formatKm(km: number): string {
  return `${km.toFixed(1)} km`
}

function formatBoolTarget(targetWeek: number): string {
  return `Done by week ${String(targetWeek)}`
}

/** A milestone whose target week has already passed without being achieved
 * is reported `atRisk`, never merely `inProgress` or `notStarted` — a raw
 * (non-`achieved`) status downgrades to `atRisk` once `currentWeek` is past
 * `targetWeek`; an `achieved` status is never touched. */
function applyTargetWeekRisk(status: MilestoneStatus, targetWeek: number, currentWeek: number): MilestoneStatus {
  if (status !== 'achieved' && currentWeek > targetWeek) return 'atRisk'
  return status
}

function buildResult(
  key: MilestoneKey,
  rawStatus: MilestoneStatus,
  currentWeek: number,
  evidence: MilestoneEvidence[],
): MilestoneResult {
  const targetWeek = MILESTONE_TARGET_WEEKS[key]
  return {
    key,
    label: MILESTONE_LABELS[key],
    status: applyTargetWeekRisk(rawStatus, targetWeek, currentWeek),
    targetWeek,
    evidence,
  }
}

function evaluateStandalone5k(facts: MilestoneFacts, targets: GoalTargets): MilestoneResult {
  const { best5kSeconds } = facts
  const targetLabel = formatClock(targets.standalone5kTargetSec)
  const met = best5kSeconds !== null && best5kSeconds <= targets.standalone5kTargetSec
  const status: MilestoneStatus = best5kSeconds === null ? 'notStarted' : met ? 'achieved' : 'inProgress'
  const evidence: MilestoneEvidence[] = [{
    label: 'Best standalone 5 km time',
    value: best5kSeconds === null ? 'Not yet run' : formatClock(best5kSeconds),
    target: `Under ${targetLabel}`,
    met,
  }]
  return buildResult('standalone5k', status, facts.currentWeek, evidence)
}

function evaluateCompromisedKmSet(facts: MilestoneFacts, targets: GoalTargets): MilestoneResult {
  const { compromisedKmCount, compromisedKmMeanSec } = facts
  const paceOk = compromisedKmMeanSec !== null && compromisedKmMeanSec <= targets.compromisedKmTargetSec
  const countOk = compromisedKmCount >= COMPROMISED_KM_REQUIRED_COUNT
  const achieved = countOk && paceOk
  const status: MilestoneStatus = achieved ? 'achieved' : compromisedKmCount > 0 ? 'inProgress' : 'notStarted'
  const evidence: MilestoneEvidence[] = [
    {
      label: 'Compromised 1 km efforts logged',
      value: String(compromisedKmCount),
      target: `At least ${String(COMPROMISED_KM_REQUIRED_COUNT)}`,
      met: countOk,
    },
    {
      label: 'Mean compromised km pace',
      value: compromisedKmMeanSec === null ? 'No data yet' : formatPace(compromisedKmMeanSec),
      target: `Under ${formatPace(targets.compromisedKmTargetSec)}`,
      met: paceOk,
    },
  ]
  return buildResult('compromisedKmSet', status, facts.currentWeek, evidence)
}

/**
 * Shared shape for the six milestones that are a single "current value vs.
 * absolute threshold" check with one evidence row: achieved at/above target,
 * inProgress with any positive progress, notStarted at zero.
 */
function evaluateThreshold(
  key: MilestoneKey,
  currentWeek: number,
  label: string,
  value: number,
  target: number,
  format: (n: number) => string,
): MilestoneResult {
  const met = value >= target
  const status: MilestoneStatus = met ? 'achieved' : value > 0 ? 'inProgress' : 'notStarted'
  const evidence: MilestoneEvidence[] = [{ label, value: format(value), target: `At least ${format(target)}`, met }]
  return buildResult(key, status, currentWeek, evidence)
}

const formatCount = (n: number): string => String(n)

function evaluateLongestContinuousRun(facts: MilestoneFacts): MilestoneResult {
  return evaluateThreshold('longestContinuousRun', facts.currentWeek, 'Longest continuous run', facts.longestContinuousRunKm, LONGEST_RUN_TARGET_KM, formatKm)
}

function evaluateComfortable10k(facts: MilestoneFacts): MilestoneResult {
  return evaluateThreshold('comfortable10k', facts.currentWeek, 'Longest continuous run', facts.longestContinuousRunKm, COMFORTABLE_10K_KM, formatKm)
}

function evaluateFourWorkoutWeeks(facts: MilestoneFacts): MilestoneResult {
  return evaluateThreshold('fourWorkoutWeeks', facts.currentWeek, 'Weeks with four or more sessions', facts.weeksWithFourPlusSessions, FOUR_WORKOUT_WEEKS_REQUIRED, formatCount)
}

function evaluateWeeklyRunningDistance(facts: MilestoneFacts): MilestoneResult {
  // Read-only scan for the peak week logged so far — never mutates `facts`.
  const peakKm = facts.weeklyRunKm.reduce((max, entry) => Math.max(max, entry.km), 0)
  return evaluateThreshold('weeklyRunningDistance', facts.currentWeek, 'Peak weekly running distance', peakKm, WEEKLY_RUN_DISTANCE_TARGET_KM, formatKm)
}

function evaluateRaceLoadSled(facts: MilestoneFacts): MilestoneResult {
  return evaluateThreshold('raceLoadSled', facts.currentWeek, 'Race-load sled sessions completed', facts.raceLoadSledSessions, RACE_LOAD_SLED_SESSIONS_REQUIRED, formatCount)
}

function evaluateHundredWallBall(facts: MilestoneFacts): MilestoneResult {
  return evaluateThreshold('hundredWallBall', facts.currentWeek, '100-wall-ball sessions completed', facts.hundredWallBallSessions, HUNDRED_WALL_BALL_SESSIONS_REQUIRED, formatCount)
}

function evaluateBooleanMilestone(key: MilestoneKey, done: boolean, currentWeek: number): MilestoneResult {
  const targetWeek = MILESTONE_TARGET_WEEKS[key]
  const status: MilestoneStatus = done ? 'achieved' : 'notStarted'
  const evidence: MilestoneEvidence[] = [{
    label: MILESTONE_LABELS[key],
    value: done ? 'Completed' : 'Not yet completed',
    target: formatBoolTarget(targetWeek),
    met: done,
  }]
  return buildResult(key, status, currentWeek, evidence)
}

function evaluateSymptomsManageable(facts: MilestoneFacts): MilestoneResult {
  const { symptomsFlagged } = facts
  const status: MilestoneStatus = symptomsFlagged ? 'atRisk' : 'achieved'
  const evidence: MilestoneEvidence[] = [{
    label: 'Symptom status',
    value: symptomsFlagged ? 'Elevated symptom flag active' : 'No elevated symptom flag',
    target: 'No elevated shin or sciatic flag',
    met: !symptomsFlagged,
  }]
  return buildResult('symptomsManageable', status, facts.currentWeek, evidence)
}

const EVALUATORS: Record<MilestoneKey, (facts: MilestoneFacts, targets: GoalTargets) => MilestoneResult> = {
  fourWorkoutWeeks: (facts) => evaluateFourWorkoutWeeks(facts),
  weeklyRunningDistance: (facts) => evaluateWeeklyRunningDistance(facts),
  longestContinuousRun: (facts) => evaluateLongestContinuousRun(facts),
  comfortable10k: (facts) => evaluateComfortable10k(facts),
  standalone5k: (facts, targets) => evaluateStandalone5k(facts, targets),
  compromisedKmSet: (facts, targets) => evaluateCompromisedKmSet(facts, targets),
  raceLoadSled: (facts) => evaluateRaceLoadSled(facts),
  hundredWallBall: (facts) => evaluateHundredWallBall(facts),
  halfSimulation: (facts) => evaluateBooleanMilestone('halfSimulation', facts.halfSimulationDone, facts.currentWeek),
  seventyFiveSimulation: (facts) => evaluateBooleanMilestone('seventyFiveSimulation', facts.seventyFiveSimulationDone, facts.currentWeek),
  fullRehearsal: (facts) => evaluateBooleanMilestone('fullRehearsal', facts.fullRehearsalDone, facts.currentWeek),
  symptomsManageable: (facts) => evaluateSymptomsManageable(facts),
}

/**
 * Evaluates all twelve §18 milestones from plan facts, in the stable §18
 * order (`MILESTONE_ORDER`). Pure: never mutates `facts`, never reads the
 * clock.
 */
export function evaluateMilestones(facts: MilestoneFacts, targets: GoalTargets): MilestoneResult[] {
  return MILESTONE_ORDER.map((key) => EVALUATORS[key](facts, targets))
}
