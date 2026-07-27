import type { ISODate, ISOInstant, Unit } from './primitives'
import type { RunType, SplitKind, Station, Surface } from './enums'

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
  distanceKm: number
  durationSec: number
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
  surface?: Surface
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
