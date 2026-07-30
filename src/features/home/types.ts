import type { ChipTone } from '@/components'
import type { ISODate, Priority, WorkoutInstance, WorkoutStatus } from '@/data/types'
import type { Trajectory, RaceEstimate } from '@/domain/milestones/trajectory'

export interface TodaysWorkoutActions {
  start: boolean
  continue: boolean
  completedEarlier: boolean
  defer: boolean
  skip: boolean
  edit: boolean
}

/**
 * 'session': a real instance to show. 'allDoneToday': every session
 * scheduled for today is already completed/partiallyCompleted — the card
 * says so and offers the next upcoming session instead of an empty slot.
 * 'restDay': nothing at all is scheduled for today (never happened yet vs.
 * finished are different messages, per the brief's "empty slot" ban).
 * 'noPlan': no active plan exists at all.
 */
export type TodaysWorkoutKind = 'session' | 'allDoneToday' | 'restDay' | 'noPlan'

export interface TodaysWorkoutVM {
  kind: TodaysWorkoutKind
  instance?: WorkoutInstance
  name: string
  phaseLabel: string
  priority?: Priority
  estMinutes?: number
  structureLines: string[]
  reason: string
  adjustmentReason?: string
  symptomCaution?: string
  actions: TodaysWorkoutActions
  /** Name of the next upcoming session, shown when `kind === 'allDoneToday'`. */
  nextUpcomingName?: string
}

export interface ScheduleRow {
  id: string
  name: string
  scheduledDate: ISODate
  plannedDate: ISODate
  status: WorkoutStatus
  priority: Priority
}

export interface ThisWeekVM {
  weekNumber: number
  phaseLabel: string
  essentialCompletedCount: number
  essentialTotalCount: number
  totalCompletedCount: number
  fourSessionMinimumMet: boolean
  sessionCount: number
  partiallyCompleted: ScheduleRow[]
  skippedOrDropped: ScheduleRow[]
  schedule: ScheduleRow[]
  movedRows: { row: ScheduleRow; originalDate: ISODate }[]
  nextBestAction: string
}

export interface StatusChip {
  tone: ChipTone
  label: string
}

export interface GoalSnapshotVM {
  raceDate: ISODate
  /** Whole days from today to race day. Negative once the race has passed, so
   * the card can say "race day was N days ago" rather than a nonsense
   * countdown. Derived here rather than in the component so the card stays
   * purely presentational and clock-free. */
  daysToRace: number
  targetSeconds: number
  currentWeek: number
  totalWeeks: number
  runningStatus: StatusChip
  strengthStatus: StatusChip
  symptomStatus: StatusChip
  trajectory: Trajectory
  explanation: string[]
  estimate: RaceEstimate | null
  insufficientDataMessage: string | null
}

export interface HomeViewModel {
  hasPlan: boolean
  today: TodaysWorkoutVM
  week: ThisWeekVM | null
  goal: GoalSnapshotVM | null
}
