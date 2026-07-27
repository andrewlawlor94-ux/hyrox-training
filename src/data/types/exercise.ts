import type { ISOInstant, Unit } from './primitives'
import type { ExerciseCategory, LoadStyle, MeasurementType, Station } from './enums'

/**
 * `progressionIncrement` + `incrementUnit` drive auto-progression in the
 * strength recommendation engine. HYROX station loads are fixed by
 * competition standard, so their increment is 0 and they never auto-progress.
 * `isSeeded` distinguishes shipped library entries from user-created ones, so
 * "restore the original plan" can safely re-seed without clobbering
 * user-added exercises.
 */
export interface Exercise {
  id: string
  name: string
  category: ExerciseCategory
  measurementType: MeasurementType
  loadStyle: LoadStyle
  defaultUnit: Unit
  defaultRestSec: number
  progressionIncrement: number
  incrementUnit: Unit
  /** Strength-only defaults; absent for distance/pace measurement types. */
  defaultSets?: number
  repMin?: number
  repMax?: number
  /** Distance/duration-only defaults; absent for strength measurement types. */
  defaultDistanceM?: number
  defaultDurationSec?: number
  techniqueNotes: string
  isArchived: boolean
  isSeeded: boolean
  createdAt: ISOInstant
  updatedAt: ISOInstant
}

/** Editable HYROX competition standard used as a reference/comparison point. */
export interface HyroxStandard {
  id: string
  station: Station
  order: number
  distanceM?: number
  reps?: number
  loadKg?: number
  loadPerHandKg?: number
  targetHeightM?: number
  ballKg?: number
  notes: string
  isSeeded: boolean
}
