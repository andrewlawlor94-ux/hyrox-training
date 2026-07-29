import type { Exercise, ExerciseCategory, LoadStyle, MeasurementType, Unit } from '@/data/types'
import { DEFAULT_PROGRESSION_INCREMENT, DEFAULT_REP_MAX, DEFAULT_REP_MIN, DEFAULT_REST_SEC, DEFAULT_SETS } from './constants'

/**
 * Every field `ExerciseForm` renders. Numeric fields are `number | null` (the
 * `NumberField` contract) rather than `number | undefined` -- `null` means
 * "the input is empty right now", which is a real, displayable state distinct
 * from "0", so a station's `progressionIncrement: 0` is never confused with
 * an unset field and never gets silently replaced by a fallback (`0 ?? x`
 * keeps 0; `0 || x` would not).
 *
 * `incrementUnit` is deliberately absent: every seeded exercise sets it equal
 * to `defaultUnit`, and exposing a second unit picker the form's own field
 * list doesn't call for would only add text-heavy surface. `toExerciseInput`
 * derives it from `defaultUnit`.
 */
export interface ExerciseFormValues {
  name: string
  category: ExerciseCategory
  measurementType: MeasurementType
  loadStyle: LoadStyle
  defaultUnit: Unit
  defaultRestSec: number | null
  progressionIncrement: number | null
  defaultSets: number | null
  repMin: number | null
  repMax: number | null
  defaultDistanceM: number | null
  defaultDurationSec: number | null
  techniqueNotes: string
  isArchived: boolean
}

/** A brand-new exercise's starting values -- a plain strength movement, not
 * a station -- so `progressionIncrement` starts at a typical non-zero
 * increment rather than 0 (0 is reserved for "this load never
 * auto-progresses", which the athlete opts into deliberately, not a blank
 * form's accidental default). */
export const EMPTY_EXERCISE_FORM_VALUES: ExerciseFormValues = {
  name: '',
  category: 'accessory',
  measurementType: 'strengthSets',
  loadStyle: 'totalBarbell',
  defaultUnit: 'lb',
  defaultRestSec: DEFAULT_REST_SEC,
  progressionIncrement: DEFAULT_PROGRESSION_INCREMENT,
  defaultSets: DEFAULT_SETS,
  repMin: DEFAULT_REP_MIN,
  repMax: DEFAULT_REP_MAX,
  defaultDistanceM: null,
  defaultDurationSec: null,
  techniqueNotes: '',
  isArchived: false,
}

/** Reads an existing `Exercise` into form state. Every optional numeric field
 * that is genuinely absent on the record becomes `null` (empty), never a
 * fallback number -- an edit form that invented "0" for an absent
 * `defaultDistanceM` would silently persist a value the athlete never
 * entered the moment they hit Save without touching that field. */
export function exerciseToFormValues(exercise: Exercise): ExerciseFormValues {
  return {
    name: exercise.name,
    category: exercise.category,
    measurementType: exercise.measurementType,
    loadStyle: exercise.loadStyle,
    defaultUnit: exercise.defaultUnit,
    defaultRestSec: exercise.defaultRestSec,
    progressionIncrement: exercise.progressionIncrement,
    defaultSets: exercise.defaultSets ?? null,
    repMin: exercise.repMin ?? null,
    repMax: exercise.repMax ?? null,
    defaultDistanceM: exercise.defaultDistanceM ?? null,
    defaultDurationSec: exercise.defaultDurationSec ?? null,
    techniqueNotes: exercise.techniqueNotes,
    isArchived: exercise.isArchived,
  }
}

/** A definition is only ever saved once every field the `Exercise` type
 * requires (as opposed to the optional strength/distance defaults) actually
 * has a value -- the Save button stays disabled until then, so nothing here
 * ever needs to invent a number the athlete didn't enter. */
export function isFormComplete(values: ExerciseFormValues): boolean {
  return values.name.trim().length > 0 && values.defaultRestSec !== null && values.progressionIncrement !== null
}

/**
 * Builds the repository input from complete form values. `incrementUnit`
 * always mirrors `defaultUnit`, matching every seeded exercise. Optional
 * numeric fields are included only when set -- `exactOptionalPropertyTypes`
 * forbids assigning `undefined` to them explicitly, and omitting the key
 * is the correct "not set" representation for a brand-new `Exercise` row.
 */
export function toExerciseInput(values: ExerciseFormValues): Omit<Exercise, 'id' | 'createdAt' | 'updatedAt' | 'isSeeded'> {
  if (values.defaultRestSec === null || values.progressionIncrement === null) {
    throw new Error('Form is not complete: defaultRestSec and progressionIncrement are required')
  }
  return {
    name: values.name.trim(),
    category: values.category,
    measurementType: values.measurementType,
    loadStyle: values.loadStyle,
    defaultUnit: values.defaultUnit,
    defaultRestSec: values.defaultRestSec,
    progressionIncrement: values.progressionIncrement,
    incrementUnit: values.defaultUnit,
    ...(values.defaultSets !== null ? { defaultSets: values.defaultSets } : {}),
    ...(values.repMin !== null ? { repMin: values.repMin } : {}),
    ...(values.repMax !== null ? { repMax: values.repMax } : {}),
    ...(values.defaultDistanceM !== null ? { defaultDistanceM: values.defaultDistanceM } : {}),
    ...(values.defaultDurationSec !== null ? { defaultDurationSec: values.defaultDurationSec } : {}),
    techniqueNotes: values.techniqueNotes,
    isArchived: values.isArchived,
  }
}
