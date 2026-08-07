import type { ISODate, ISOInstant, Unit } from './primitives'
import type { RunType, SledSurface, SplitKind, Station, Surface } from './enums'

/** A single logged set. All fields are optional except identity and flags —
 * a set exists (and can be idempotently targeted for completion) before it
 * has values. */
export interface StrengthSet {
  id: string
  instanceId: string
  instancePrescriptionId: string
  exerciseId: string
  setIndex: number
  weight?: number
  unit?: Unit
  reps?: number
  rir?: number
  isCompleted: boolean
  /** Absent until the set is completed. */
  completedAt?: ISOInstant
  isWarmup: boolean
}

export interface RunLog {
  id: string
  instanceId: string
  instancePrescriptionId?: string
  /** Distance actually covered. For an interval session this is the WORK
   * distance — a warm-up and cool-down logged as time carry no distance. */
  distanceKm: number
  /** Whole-session elapsed time. For an interval session that includes the
   * warm-up, the recoveries and the cool-down as well as the reps. */
  durationSec: number
  /**
   * The pace that characterises this run, and NOT simply
   * `durationSec / distanceKm`.
   *
   * For an interval session it is the WORK-ONLY mean pace
   * (`summarizeSplits().meanWorkPaceSecPerKm`), because dividing the whole
   * session's elapsed time by the work distance is not a pace at all: it charges
   * the recoveries, the warm-up and the cool-down against the kilometres run at
   * effort. Doing exactly that reported an athlete's 6:17/km intervals as
   * 9:32/km in Progress.
   *
   * For every other run type the two coincide, since there is nothing in the
   * session that is not the run.
   */
  paceSecPerKm?: number
  surface: Surface
  runType: RunType
  notes: string
  loggedAt: ISOInstant
}

export interface IntervalSplit {
  id: string
  runLogId: string
  index: number
  kind: SplitKind
  distanceM?: number
  durationSec?: number
  paceSecPerKm?: number
}

export interface StationLog {
  id: string
  instanceId: string
  instancePrescriptionId?: string
  station: Station
  distanceM?: number
  reps?: number
  load?: number
  loadUnit?: Unit
  sledWeightKg?: number
  totalLoadKg?: number
  /** Only ever set for the two sled stations (see `StationBlock`) — the floor
   * the sled ran on, not a `Surface` (which describes a run's terrain). */
  surface?: SledSurface
  timeSec?: number
  breaks?: number
  setStructure?: string
  rpe?: number
  notes: string
}

export interface SymptomLog {
  id: string
  instanceId?: string
  forDate: ISODate
  sessionRpe: number
  shinPain: number
  sciaticPain: number
  notes: string
  loggedAt: ISOInstant
}
