import type { ISODate, ISOInstant, Unit } from './primitives'
import type { LoadStyle, PaceSource, Priority, RecoveryTag, WorkoutKind } from './enums'

export interface Plan {
  id: string
  name: string
  weeksCount: number
  status: 'active' | 'archived'
  /** Present when this plan was duplicated from another (Plan manager). */
  sourcePlanId?: string
  startDate: ISODate
  raceGoalId: string
  createdAt: ISOInstant
}

export interface PlanPhase {
  id: string
  planId: string
  name: string
  weekStart: number
  weekEnd: number
  focus: string
}

export interface PlanWeek {
  id: string
  planId: string
  weekNumber: number
  phaseId: string
  label: string
  isDeload: boolean
  notes: string
}

export interface WorkoutTemplate {
  id: string
  planId: string
  planWeekId: string
  /** 1..6 */
  sessionSlot: number
  sequenceInWeek: number
  name: string
  kind: WorkoutKind
  priority: Priority
  recoveryTags: RecoveryTag[]
  estMinutes: number
  notes: string
  /** Percent of full station volume for this session, where applicable. */
  stationVolumePct?: number
}

/** Structure of an interval-based run prescription (e.g. 8x1km). */
export interface IntervalSpec {
  warmupSec?: number
  reps: number
  workSec?: number
  workDistanceM?: number
  recoverySec: number
  cooldownSec?: number
}

/**
 * A template's prescribed exercise/run/station parameters.
 *
 * `paceSource: 'goalRacePace'` means `targetPaceSecPerKm` is derived from the
 * athlete's active RaceGoal rather than stored as a literal, so changing the
 * goal updates every future race-pace session. Once the athlete hand-edits
 * the pace, it flips to `'manual'` and stops tracking the goal.
 */
export interface Prescription {
  id: string
  templateId: string
  exerciseId: string
  order: number
  sets?: number
  repMin?: number
  repMax?: number
  targetLoad?: number
  loadUnit?: Unit
  loadStyle?: LoadStyle
  distanceM?: number
  durationSec?: number
  targetPaceSecPerKm?: number
  paceSource?: PaceSource
  restSec: number
  intervalSpec?: IntervalSpec
  notes?: string
}
