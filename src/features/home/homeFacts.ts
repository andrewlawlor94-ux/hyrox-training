import type {
  HyroxStandard, ISODate, RunLog, Station, StationLog, WorkoutInstance, WorkoutTemplate,
} from '@/data/types'
import { daysBetween } from '@/domain/dates'
import type { MilestoneFacts } from '@/domain/milestones/evaluate'
import { ATTENDED_STATUSES, BENCHMARK_5K_TOLERANCE_KM, WALL_BALL_SESSION_REPS, WEEKLY_SESSION_MINIMUM } from './constants'

const BENCHMARK_5K_KM = 5
const SLED_STATIONS: readonly Station[] = ['sledPush', 'sledPull']

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function wasAttended(status: WorkoutInstance['status']): boolean {
  return (ATTENDED_STATUSES as readonly string[]).includes(status)
}

/** Current 1-based plan week for `today`, clamped to `[1, totalWeeks]` so a
 * `today` before the plan starts or after it ends never yields an
 * out-of-range week. */
export function currentPlanWeek(planStartDate: ISODate, today: ISODate, totalWeeks: number): number {
  const DAYS_PER_WEEK = 7
  const raw = Math.floor(daysBetween(planStartDate, today) / DAYS_PER_WEEK) + 1
  return Math.min(Math.max(raw, 1), totalWeeks)
}

function weeksWithFourPlusSessions(instances: WorkoutInstance[]): number {
  const perWeek = new Map<number, number>()
  for (const instance of instances) {
    if (!wasAttended(instance.status)) continue
    perWeek.set(instance.weekNumber, (perWeek.get(instance.weekNumber) ?? 0) + 1)
  }
  return [...perWeek.values()].filter((count) => count >= WEEKLY_SESSION_MINIMUM).length
}

function weeklyRunKmSeries(instances: WorkoutInstance[], runLogs: RunLog[]): { weekNumber: number; km: number }[] {
  const weekByInstanceId = new Map(instances.map((i) => [i.id, i.weekNumber]))
  const perWeek = new Map<number, number>()
  for (const log of runLogs) {
    const week = weekByInstanceId.get(log.instanceId)
    if (week === undefined) continue
    perWeek.set(week, (perWeek.get(week) ?? 0) + log.distanceKm)
  }
  return [...perWeek.entries()].map(([weekNumber, km]) => ({ weekNumber, km }))
}

function best5kSeconds(runLogs: RunLog[]): number | null {
  const candidates = runLogs.filter(
    (log) => log.runType === 'benchmark' && Math.abs(log.distanceKm - BENCHMARK_5K_KM) <= BENCHMARK_5K_TOLERANCE_KM,
  )
  if (candidates.length === 0) return null
  return Math.min(...candidates.map((log) => log.durationSec))
}

function compromisedKmStats(runLogs: RunLog[]): { count: number; meanSec: number | null } {
  const compromised = runLogs.filter((log) => log.runType === 'compromised')
  const paces = compromised.map((log) => log.paceSecPerKm ?? log.durationSec / log.distanceKm)
  return { count: compromised.length, meanSec: mean(paces) }
}

/** Distinct `instanceId`s whose station logs qualify under `predicate` — a
 * session counts once even if it produced several qualifying log rows. */
function distinctQualifyingInstances(logs: StationLog[], predicate: (log: StationLog) => boolean): number {
  return new Set(logs.filter(predicate).map((log) => log.instanceId)).size
}

function raceLoadSledSessions(stationLogs: StationLog[], standardsByStation: Map<Station, HyroxStandard>): number {
  return distinctQualifyingInstances(stationLogs, (log) => {
    if (!SLED_STATIONS.includes(log.station)) return false
    const standard = standardsByStation.get(log.station)
    if (standard?.loadKg === undefined || log.sledWeightKg === undefined) return false
    return log.sledWeightKg >= standard.loadKg
  })
}

function hundredWallBallSessions(stationLogs: StationLog[]): number {
  return distinctQualifyingInstances(
    stationLogs,
    (log) => log.station === 'wallBalls' && (log.reps ?? 0) >= WALL_BALL_SESSION_REPS,
  )
}

/** Whether any attended instance ran a `kind: 'simulation'` template at the
 * given `stationVolumePct` — the seed plan's own discriminator for half
 * (50%), 75%, and full-rehearsal (100%) simulations (see
 * `src/data/seed/plan24Week/runWeeks/*`), so this needs no name matching. */
function simulationDoneAt(
  instances: WorkoutInstance[],
  templatesById: Map<string, WorkoutTemplate>,
  stationVolumePct: number,
): boolean {
  return instances.some((instance) => {
    if (!wasAttended(instance.status)) return false
    const template = templatesById.get(instance.templateId)
    return template?.kind === 'simulation' && template.stationVolumePct === stationVolumePct
  })
}

export interface HomeFactsInput {
  today: ISODate
  planStartDate: ISODate
  totalWeeks: number
  instances: WorkoutInstance[]
  templatesById: Map<string, WorkoutTemplate>
  runLogs: RunLog[]
  stationLogs: StationLog[]
  standardsByStation: Map<Station, HyroxStandard>
  symptomsFlagged: boolean
}

const HALF_SIMULATION_PCT = 50
const SEVENTY_FIVE_SIMULATION_PCT = 75
const FULL_REHEARSAL_PCT = 100

/**
 * Builds `MilestoneFacts` (the domain layer's input contract for
 * `evaluateMilestones`/`computeTrajectory`/`estimateRaceRange`) from raw
 * repository rows. Pure — every input is a plain array/map already read by
 * the caller, so this is safe to call from inside a `useLiveQuery` callback.
 */
export function buildMilestoneFacts(input: HomeFactsInput): MilestoneFacts {
  const { count: compromisedKmCount, meanSec: compromisedKmMeanSec } = compromisedKmStats(input.runLogs)
  const longestContinuousRunKm = input.runLogs.reduce((max, log) => Math.max(max, log.distanceKm), 0)

  return {
    currentWeek: currentPlanWeek(input.planStartDate, input.today, input.totalWeeks),
    totalWeeks: input.totalWeeks,
    weeksWithFourPlusSessions: weeksWithFourPlusSessions(input.instances),
    weeklyRunKm: weeklyRunKmSeries(input.instances, input.runLogs),
    longestContinuousRunKm,
    best5kSeconds: best5kSeconds(input.runLogs),
    compromisedKmMeanSec,
    compromisedKmCount,
    raceLoadSledSessions: raceLoadSledSessions(input.stationLogs, input.standardsByStation),
    hundredWallBallSessions: hundredWallBallSessions(input.stationLogs),
    halfSimulationDone: simulationDoneAt(input.instances, input.templatesById, HALF_SIMULATION_PCT),
    seventyFiveSimulationDone: simulationDoneAt(input.instances, input.templatesById, SEVENTY_FIVE_SIMULATION_PCT),
    fullRehearsalDone: simulationDoneAt(input.instances, input.templatesById, FULL_REHEARSAL_PCT),
    symptomsFlagged: input.symptomsFlagged,
  }
}
