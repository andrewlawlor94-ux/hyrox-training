import type { ChipTone } from '@/components'
import type {
  Exercise, ISODate, InstancePrescription, Priority, RecoveryTag, WorkoutInstance, WorkoutStatus, WorkoutTemplate,
} from '@/data/types'
import { daysBetween } from '@/domain/dates'
import { formatDistanceM, formatDuration } from '@/domain/units/format'
import type { MilestoneResult, MilestoneStatus } from '@/domain/milestones/evaluate'
import type { MilestoneFacts } from '@/domain/milestones/evaluate'
import type { MilestoneKey } from '@/domain/milestones/constants'
import type { TrajectoryResult, RaceEstimate } from '@/domain/milestones/trajectory'
import { ATTENDED_STATUSES, WEEKLY_SESSION_MINIMUM } from './constants'
import type { ExerciseStructure, GoalSnapshotVM, ScheduleRow, StatusChip, ThisWeekVM, TodaysWorkoutVM } from './types'

function wasAttended(status: WorkoutStatus): boolean {
  return (ATTENDED_STATUSES as readonly string[]).includes(status)
}

// --- Today's workout -------------------------------------------------------

const RECOVERY_TAG_PHRASE: Record<RecoveryTag, string> = {
  hardRun: 'a hard running effort',
  easyRun: 'an easy aerobic run',
  longRun: "this week's long run",
  lowerBodyStrength: 'lower-body strength work',
  upperBodyStrength: 'upper-body strength work',
  hybrid: 'a hybrid strength-and-conditioning session',
  highImpactStation: 'high-impact station work',
  lowImpactAerobic: 'low-impact aerobic work',
  recovery: 'active recovery',
  raceSimulation: 'a race-simulation session',
}

/**
 * Plain-language reason a session is recommended today, grounded in its actual
 * recovery tag — never a generic placeholder.
 *
 * Deliberately no longer appends "— priority: essential": the card renders the
 * priority as its own chip directly above this sentence, so that tail printed
 * the same fact twice. `priority` stays in the signature (unused, hence the
 * underscore) because every caller passes it and a future phrasing may want it.
 */
export function reasonForToday(_priority: Priority, tags: readonly RecoveryTag[]): string {
  const primaryTag = tags[0]
  const phrase = primaryTag ? RECOVERY_TAG_PHRASE[primaryTag] : 'the next session in the plan'
  return `Scheduled for today as ${phrase}.`
}

/**
 * A prescription's structure split into the exercise and its dose — `{ name:
 * 'Back squat', detail: '4 x 5' }` — rather than the single "Back squat: 4 x 5"
 * string this used to return.
 *
 * Every branch below already produced exactly `name: detail`, so this carries
 * the same information; returning the pair lets the card align the two as
 * columns instead of rendering a run of prose lines. `detail` is `''` when the
 * prescription has no dose at all, which the card renders as just the name.
 */
export function structureFor(exercise: Exercise, prescription: InstancePrescription): ExerciseStructure {
  const of = (detail: string): ExerciseStructure => ({ name: exercise.name, detail })

  if (exercise.measurementType === 'strengthSets') {
    const sets = prescription.sets ?? exercise.defaultSets ?? 0
    const repMin = prescription.repMin ?? exercise.repMin
    const repMax = prescription.repMax ?? exercise.repMax
    const repRange = repMin !== undefined && repMax !== undefined && repMin !== repMax
      ? `${String(repMin)}-${String(repMax)}`
      : String(repMin ?? repMax ?? '')
    return of(`${String(sets)} x ${repRange}`)
  }
  if (prescription.intervalSpec) {
    const spec = prescription.intervalSpec
    const work = spec.workDistanceM !== undefined
      ? formatDistanceM(spec.workDistanceM)
      : spec.workSec !== undefined ? formatDuration(spec.workSec) : ''
    return of(`${String(spec.reps)} x ${work}`)
  }
  if (prescription.distanceM !== undefined) return of(formatDistanceM(prescription.distanceM))
  if (prescription.durationSec !== undefined) return of(formatDuration(prescription.durationSec))
  return of('')
}

const ACTIVE_TODAY_STATUSES: readonly WorkoutStatus[] = ['upcoming', 'available']
const DONE_STATUSES: readonly WorkoutStatus[] = ['completed', 'partiallyCompleted']

/** `edit` tracks NOT-frozen: true for `inProgress`/`ACTIVE_TODAY_STATUSES`,
 * false for `DONE_STATUSES` (always frozen -- see `completeWorkout`), since
 * editing completed history is the one thing this app must never allow. */
function actionsFor(status: WorkoutStatus): TodaysWorkoutVM['actions'] {
  if (status === 'inProgress') {
    return { start: false, continue: true, completedEarlier: false, defer: false, skip: false, edit: true }
  }
  if (DONE_STATUSES.includes(status)) {
    return { start: false, continue: false, completedEarlier: false, defer: false, skip: false, edit: false }
  }
  if (ACTIVE_TODAY_STATUSES.includes(status)) {
    return { start: true, continue: false, completedEarlier: true, defer: true, skip: true, edit: true }
  }
  return { start: false, continue: false, completedEarlier: false, defer: false, skip: false, edit: false }
}

export interface TodaysWorkoutInput {
  today: ISODate
  instances: readonly WorkoutInstance[]
  templatesById: ReadonlyMap<string, WorkoutTemplate>
  phaseLabelByWeek: ReadonlyMap<number, string>
  structureByInstanceId: ReadonlyMap<string, ExerciseStructure[]>
  explanationByInstanceId: ReadonlyMap<string, string>
  symptomCaution: string | undefined
}

function findNextUpcoming(instances: readonly WorkoutInstance[], today: ISODate): WorkoutInstance | undefined {
  return [...instances]
    .filter((i) => i.scheduledDate > today && ACTIVE_TODAY_STATUSES.includes(i.status))
    .sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : a.sequence - b.sequence))[0]
}

function restDayVM(): TodaysWorkoutVM {
  return {
    kind: 'restDay',
    name: 'No session scheduled today',
    phaseLabel: '',
    structure: [],
    reason: 'Today is a rest day in the current plan.',
    actions: actionsFor('autoDropped'),
  }
}

function allDoneTodayVM(
  instances: readonly WorkoutInstance[],
  today: ISODate,
  templatesById: ReadonlyMap<string, WorkoutTemplate>,
): TodaysWorkoutVM {
  const next = findNextUpcoming(instances, today)
  const nextName = next ? templatesById.get(next.templateId)?.name : undefined
  return {
    kind: 'allDoneToday',
    name: "Today's session is logged",
    phaseLabel: '',
    structure: [],
    reason: 'Every session scheduled for today has been logged.',
    actions: actionsFor('completed'),
    ...(nextName ? { nextUpcomingName: nextName } : {}),
  }
}

export function buildTodaysWorkoutVM(input: TodaysWorkoutInput): TodaysWorkoutVM {
  const todays = input.instances.filter((i) => i.scheduledDate === input.today)
  if (todays.length === 0) return restDayVM()

  const actionable = [...todays].sort((a, b) => a.sequence - b.sequence).find((i) => !wasAttended(i.status))
  if (!actionable) return allDoneTodayVM(input.instances, input.today, input.templatesById)

  const template = input.templatesById.get(actionable.templateId)
  const explanation = input.explanationByInstanceId.get(actionable.id) ?? actionable.adjustmentReason

  return {
    kind: 'session',
    instance: actionable,
    name: template?.name ?? '',
    phaseLabel: `${input.phaseLabelByWeek.get(actionable.weekNumber) ?? ''} · Week ${String(actionable.weekNumber)}`,
    priority: actionable.priority,
    ...(template ? { estMinutes: template.estMinutes } : {}),
    structure: [...(input.structureByInstanceId.get(actionable.id) ?? [])],
    reason: reasonForToday(actionable.priority, actionable.recoveryTags),
    ...(explanation ? { adjustmentReason: explanation } : {}),
    ...(input.symptomCaution ? { symptomCaution: input.symptomCaution } : {}),
    actions: actionsFor(actionable.status),
  }
}

// --- This week ---------------------------------------------------------------

function toScheduleRow(instance: WorkoutInstance, name: string): ScheduleRow {
  return {
    id: instance.id, name, scheduledDate: instance.scheduledDate, plannedDate: instance.plannedDate,
    status: instance.status, priority: instance.priority,
  }
}

/** Exactly one next-best-action sentence, never guilt language — a missed or
 * skipped session simply is not mentioned as a failure; the sentence only
 * ever names what is still ahead. */
function nextBestAction(weekInstances: readonly WorkoutInstance[], nameOf: (i: WorkoutInstance) => string): string {
  const upcoming = [...weekInstances]
    .filter((i) => ACTIVE_TODAY_STATUSES.includes(i.status) || i.status === 'inProgress')
    .sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : a.sequence - b.sequence))[0]
  if (!upcoming) return "This week's sessions are all logged."
  return `Next up: ${nameOf(upcoming)} on ${upcoming.scheduledDate}.`
}

export interface ThisWeekInput {
  weekNumber: number
  phaseLabel: string
  weekInstances: readonly WorkoutInstance[]
  namesByInstanceId: ReadonlyMap<string, string>
}

export function buildThisWeekVM(input: ThisWeekInput): ThisWeekVM {
  const { weekInstances, namesByInstanceId } = input
  const nameOf = (i: WorkoutInstance): string => namesByInstanceId.get(i.id) ?? ''

  const essentialInstances = weekInstances.filter((i) => i.priority === 'essential')
  const sessionCount = weekInstances.filter((i) => wasAttended(i.status)).length

  const partiallyCompleted = weekInstances.filter((i) => i.status === 'partiallyCompleted').map((i) => toScheduleRow(i, nameOf(i)))
  const skippedOrDropped = weekInstances
    .filter((i) => i.status === 'skipped' || i.status === 'autoDropped')
    .map((i) => toScheduleRow(i, nameOf(i)))
  const schedule = [...weekInstances].sort((a, b) => a.sequence - b.sequence).map((i) => toScheduleRow(i, nameOf(i)))
  const movedRows = schedule
    .filter((row) => row.scheduledDate !== row.plannedDate)
    .map((row) => ({ row, originalDate: row.plannedDate }))

  return {
    weekNumber: input.weekNumber,
    phaseLabel: input.phaseLabel,
    essentialCompletedCount: essentialInstances.filter((i) => i.status === 'completed').length,
    essentialTotalCount: essentialInstances.length,
    totalCompletedCount: weekInstances.filter((i) => i.status === 'completed').length,
    fourSessionMinimumMet: sessionCount >= WEEKLY_SESSION_MINIMUM,
    sessionCount,
    partiallyCompleted,
    skippedOrDropped,
    schedule,
    movedRows,
    nextBestAction: nextBestAction(weekInstances, nameOf),
  }
}

// --- Goal snapshot -----------------------------------------------------------

const STATUS_RANK: Record<MilestoneStatus, number> = { atRisk: 0, notStarted: 1, inProgress: 2, achieved: 3 }
const STATUS_TONE: Record<MilestoneStatus, ChipTone> = {
  atRisk: 'elevated', notStarted: 'neutral', inProgress: 'accent', achieved: 'green',
}
const STATUS_LABEL: Record<MilestoneStatus, string> = {
  atRisk: 'At risk', notStarted: 'Not started', inProgress: 'In progress', achieved: 'Achieved',
}

/** Running-specific milestones (§18), used to derive Home's single "running
 * milestone status" chip — a Home-only display grouping, not a domain rule:
 * the domain layer's own `MILESTONE_ORDER` stays flat and neutral. */
const RUNNING_MILESTONE_KEYS: readonly MilestoneKey[] = [
  'weeklyRunningDistance', 'longestContinuousRun', 'comfortable10k', 'standalone5k', 'compromisedKmSet',
]

/** Station/strength-maintenance milestones for Home's "strength-maintenance
 * status" chip — same display-only grouping rationale as above. */
const STRENGTH_MAINTENANCE_KEYS: readonly MilestoneKey[] = ['raceLoadSled', 'hundredWallBall']

function worstStatusChip(results: readonly MilestoneResult[], keys: readonly MilestoneKey[]): StatusChip {
  const [first, ...rest] = results.filter((r) => keys.includes(r.key))
  if (!first) return { tone: 'neutral', label: 'Not started' }
  const worst = rest.reduce((acc, r) => (STATUS_RANK[r.status] < STATUS_RANK[acc.status] ? r : acc), first)
  return { tone: STATUS_TONE[worst.status], label: STATUS_LABEL[worst.status] }
}

function symptomStatusChip(results: readonly MilestoneResult[]): StatusChip {
  const result = results.find((r) => r.key === 'symptomsManageable')
  if (!result) return { tone: 'neutral', label: 'Not started' }
  return { tone: STATUS_TONE[result.status], label: STATUS_LABEL[result.status] }
}

function missingBenchmarkParts(facts: MilestoneFacts): string[] {
  const missing: string[] = []
  if (facts.best5kSeconds === null) missing.push('a standalone 5 km benchmark')
  if (facts.compromisedKmMeanSec === null) missing.push('compromised-km pace data')
  if (!facts.seventyFiveSimulationDone) missing.push('the 75% simulation')
  return missing
}

export interface GoalSnapshotInput {
  today: ISODate
  raceDate: ISODate
  targetSeconds: number
  facts: MilestoneFacts
  milestones: readonly MilestoneResult[]
  trajectory: TrajectoryResult
  estimate: RaceEstimate | null
}

export function buildGoalSnapshotVM(input: GoalSnapshotInput): GoalSnapshotVM {
  const { facts, milestones, trajectory, estimate } = input
  const missing = missingBenchmarkParts(facts)

  return {
    raceDate: input.raceDate,
    daysToRace: daysBetween(input.today, input.raceDate),
    targetSeconds: input.targetSeconds,
    currentWeek: facts.currentWeek,
    totalWeeks: facts.totalWeeks,
    runningStatus: worstStatusChip(milestones, RUNNING_MILESTONE_KEYS),
    strengthStatus: worstStatusChip(milestones, STRENGTH_MAINTENANCE_KEYS),
    symptomStatus: symptomStatusChip(milestones),
    trajectory: trajectory.trajectory,
    explanation: trajectory.evidence,
    estimate,
    insufficientDataMessage: estimate === null
      ? `Not enough benchmark data yet to estimate a finishing time — still missing: ${missing.join(', ')}.`
      : null,
  }
}
