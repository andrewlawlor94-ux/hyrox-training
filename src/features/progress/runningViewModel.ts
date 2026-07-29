import type {
  Exercise, ISODate, InstancePrescription, RunLog, RunType, WorkoutInstance, WorkoutStatus,
} from '@/data/types'
import { paceSecPerKm } from '@/domain/pace/pace'
import { goalTargets } from '@/domain/milestones/goalTargets'
import type { GoalTargets } from '@/domain/milestones/goalTargets'
import { evaluateMilestones } from '@/domain/milestones/evaluate'
import type { MilestoneResult } from '@/domain/milestones/evaluate'
import type { MilestoneKey } from '@/domain/milestones/constants'
import { computeTrajectory } from '@/domain/milestones/trajectory'
import type { TrajectoryResult } from '@/domain/milestones/trajectory'
import { BENCHMARK_5K_TOLERANCE_KM } from '@/features/home/constants'
import { WEEKS_WINDOW } from './constants'
import type { RunningRawData } from './runningData'

const M_PER_KM = 1000
const BENCHMARK_5K_KM = 5
/** ISO instant/date strings share the `YYYY-MM-DD` prefix (same trick
 * `exerciseRepo.exerciseHistory` uses to turn a `completedAt` into a date). */
const ISO_DATE_LENGTH = 10

const COMPLETED_STATUSES: readonly WorkoutStatus[] = ['completed', 'partiallyCompleted']

/** Display grouping, not a domain rule — mirrors `homeViewModel`'s own
 * private `RUNNING_MILESTONE_KEYS` (same rationale: the domain layer's
 * `MILESTONE_ORDER` stays flat and neutral about which milestones are
 * "running" ones). */
const RUNNING_MILESTONE_KEYS: readonly MilestoneKey[] = [
  'weeklyRunningDistance', 'longestContinuousRun', 'comfortable10k', 'standalone5k', 'compromisedKmSet',
]

export interface WeeklyVolumeRow {
  weekNumber: number
  plannedKm: number
  /** Prescribed running time (seconds) from duration-prescribed sessions --
   * see `prescribedRunDurationSec`. Kept separate from `plannedKm` rather
   * than converted into it, which would require fabricating a pace. */
  plannedDurationSec: number
  completedKm: number
  missedKm: number
  droppedKm: number
}

export interface PaceByTypeRow {
  runType: RunType
  meanPaceSecPerKm: number
  runCount: number
}

export interface EasyRunPacePoint {
  date: ISODate
  paceSecPerKm: number
}

export interface BenchmarkPoint {
  date: ISODate
  timeSec: number
}

export interface RunningProgressVM {
  weeklyVolume: WeeklyVolumeRow[]
  paceByType: PaceByTypeRow[]
  easyRunPace: EasyRunPacePoint[]
  benchmarkHistory: BenchmarkPoint[]
  milestones: MilestoneResult[]
  trajectory: TrajectoryResult
  targets: GoalTargets
  longestContinuousRunKm: number
}

/**
 * A run prescription's prescribed distance, in metres — plain `distanceM`
 * for a steady run, or `reps * workDistanceM` for an interval prescription
 * (same fields `homeViewModel.structureLineFor` already reads for the same
 * purpose). Zero for a prescription that specifies neither (a
 * duration-prescribed session -- see `prescribedRunDurationSec`, which
 * covers that case instead of this one fabricating a pace to fill it).
 */
function prescribedRunDistanceM(prescription: InstancePrescription): number {
  if (prescription.distanceM !== undefined) return prescription.distanceM
  if (prescription.intervalSpec?.workDistanceM !== undefined) {
    return prescription.intervalSpec.reps * prescription.intervalSpec.workDistanceM
  }
  return 0
}

/**
 * The duration counterpart of `prescribedRunDistanceM`, in seconds: plain
 * `durationSec`, or `reps * workSec` for a time-based interval. Zero for a
 * prescription that specifies neither, i.e. one already counted by
 * `prescribedRunDistanceM` instead.
 */
function prescribedRunDurationSec(prescription: InstancePrescription): number {
  if (prescription.durationSec !== undefined) return prescription.durationSec
  if (prescription.intervalSpec?.workSec !== undefined) {
    return prescription.intervalSpec.reps * prescription.intervalSpec.workSec
  }
  return 0
}

function isRunPrescription(prescription: InstancePrescription, exercisesById: ReadonlyMap<string, Exercise>): boolean {
  return exercisesById.get(prescription.exerciseId)?.category === 'run'
}

/** The most recent `WEEKS_WINDOW` elapsed weeks, oldest first — bounded so
 * the chart stays legible at 375px, and always including `currentWeek` even
 * if nothing has been logged for it yet (a week with no runs is zero, not
 * omitted — see the module doc). */
function weekWindow(currentWeek: number): number[] {
  const start = Math.max(1, currentWeek - WEEKS_WINDOW + 1)
  const weeks: number[] = []
  for (let week = start; week <= currentWeek; week += 1) weeks.push(week)
  return weeks
}

/**
 * Four independent per-week quantities (§17), never a single stacked
 * percentage: `plannedKm` is the total prescribed running distance for the
 * week regardless of what happened to it; `completedKm` is what was
 * actually logged; `missedKm`/`droppedKm` are the prescribed distance of
 * sessions the athlete skipped or the queue engine auto-dropped. A week
 * with no run prescriptions at all still gets a zero-filled row (seeded by
 * `weekWindow` up front), so it is never silently omitted from the chart.
 * `plannedDurationSec` rides alongside `plannedKm` so a week prescribed
 * entirely by duration (e.g. "easy run 30 min") never reads as a genuine
 * zero planned distance -- see `WeeklyVolumeRow`'s own doc comment.
 */
export function buildWeeklyVolume(
  instances: readonly WorkoutInstance[],
  prescriptionsByInstanceId: ReadonlyMap<string, InstancePrescription[]>,
  exercisesById: ReadonlyMap<string, Exercise>,
  runLogs: readonly RunLog[],
  currentWeek: number,
): WeeklyVolumeRow[] {
  const rows = new Map<number, WeeklyVolumeRow>()
  for (const week of weekWindow(currentWeek)) {
    rows.set(week, { weekNumber: week, plannedKm: 0, plannedDurationSec: 0, completedKm: 0, missedKm: 0, droppedKm: 0 })
  }

  const runLogsByInstanceId = new Map<string, RunLog[]>()
  for (const log of runLogs) {
    const list = runLogsByInstanceId.get(log.instanceId) ?? []
    list.push(log)
    runLogsByInstanceId.set(log.instanceId, list)
  }

  for (const instance of instances) {
    const row = rows.get(instance.weekNumber)
    if (!row) continue

    const runPrescriptions = (prescriptionsByInstanceId.get(instance.id) ?? [])
      .filter((p) => isRunPrescription(p, exercisesById))
    if (runPrescriptions.length === 0) continue

    const prescribedKm = runPrescriptions.reduce((sum, p) => sum + prescribedRunDistanceM(p), 0) / M_PER_KM
    row.plannedKm += prescribedKm
    row.plannedDurationSec += runPrescriptions.reduce((sum, p) => sum + prescribedRunDurationSec(p), 0)

    if (COMPLETED_STATUSES.includes(instance.status)) {
      const logs = runLogsByInstanceId.get(instance.id) ?? []
      row.completedKm += logs.reduce((sum, log) => sum + log.distanceKm, 0)
    } else if (instance.status === 'skipped') {
      row.missedKm += prescribedKm
    } else if (instance.status === 'autoDropped') {
      row.droppedKm += prescribedKm
    }
  }

  return [...rows.values()]
}

function runPace(log: RunLog): number | null {
  return log.paceSecPerKm ?? paceSecPerKm(log.distanceKm, log.durationSec)
}

function sortByLoggedAt(runLogs: readonly RunLog[]): RunLog[] {
  return [...runLogs].sort((a, b) => (a.loggedAt < b.loggedAt ? -1 : a.loggedAt > b.loggedAt ? 1 : 0))
}

/** Average pace grouped by `RunType`, at most one row per type actually
 * logged — never a fixed list of every possible type, so an athlete who has
 * never logged a `race` run never sees a fabricated zero row for it. */
export function buildPaceByType(runLogs: readonly RunLog[]): PaceByTypeRow[] {
  const byType = new Map<RunType, number[]>()
  for (const log of runLogs) {
    const pace = runPace(log)
    if (pace === null) continue
    const list = byType.get(log.runType) ?? []
    list.push(pace)
    byType.set(log.runType, list)
  }
  return [...byType.entries()].map(([runType, paces]) => ({
    runType,
    meanPaceSecPerKm: paces.reduce((sum, p) => sum + p, 0) / paces.length,
    runCount: paces.length,
  }))
}

/** Easy-run pace over time, oldest first. */
export function buildEasyRunPaceSeries(runLogs: readonly RunLog[]): EasyRunPacePoint[] {
  const points: EasyRunPacePoint[] = []
  for (const log of sortByLoggedAt(runLogs)) {
    if (log.runType !== 'easy') continue
    const pace = runPace(log)
    if (pace === null) continue
    points.push({ date: log.loggedAt.slice(0, ISO_DATE_LENGTH), paceSecPerKm: pace })
  }
  return points
}

/** Standalone 5 km benchmark history, oldest first — same tolerance
 * `homeFacts.best5kSeconds` uses to decide a benchmark-tagged run's distance
 * is close enough to count. */
export function buildBenchmarkHistory(runLogs: readonly RunLog[]): BenchmarkPoint[] {
  return sortByLoggedAt(runLogs)
    .filter((log) => log.runType === 'benchmark' && Math.abs(log.distanceKm - BENCHMARK_5K_KM) <= BENCHMARK_5K_TOLERANCE_KM)
    .map((log) => ({ date: log.loggedAt.slice(0, ISO_DATE_LENGTH), timeSec: log.durationSec }))
}

/**
 * Composes every piece `RunningProgress` renders from `RunningRawData`:
 * `goalTargets` (so the displayed 5 km/compromised-km targets move with the
 * goal), `evaluateMilestones`/`computeTrajectory` (Home's own domain calls,
 * reused rather than re-derived), and this module's own weekly-volume/pace
 * aggregations. Pure — safe to call from inside `useLiveQuery`.
 */
export function buildRunningProgressVM(raw: RunningRawData): RunningProgressVM {
  const targets = goalTargets(raw.targetSeconds)
  const allMilestones = evaluateMilestones(raw.facts, targets)
  const trajectory = computeTrajectory(allMilestones, raw.facts)
  const milestones = allMilestones.filter((m) => RUNNING_MILESTONE_KEYS.includes(m.key))

  return {
    weeklyVolume: buildWeeklyVolume(raw.instances, raw.prescriptionsByInstanceId, raw.exercisesById, raw.runLogs, raw.currentWeek),
    paceByType: buildPaceByType(raw.runLogs),
    easyRunPace: buildEasyRunPaceSeries(raw.runLogs),
    benchmarkHistory: buildBenchmarkHistory(raw.runLogs),
    milestones,
    trajectory,
    targets,
    longestContinuousRunKm: raw.facts.longestContinuousRunKm,
  }
}
