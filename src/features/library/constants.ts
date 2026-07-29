import type { ExerciseCategory, LoadStyle, MeasurementType, Unit } from '@/data/types'

/** Every `ExerciseCategory`, in the same order as the union in
 * `data/types/enums.ts`, paired with a short display label. `wallBall` is
 * the only value that needs a label distinct from a capitalized id. */
export const CATEGORY_OPTIONS: { value: ExerciseCategory; label: string }[] = [
  { value: 'squat', label: 'Squat' },
  { value: 'hinge', label: 'Hinge' },
  { value: 'lunge', label: 'Lunge' },
  { value: 'press', label: 'Press' },
  { value: 'pull', label: 'Pull' },
  { value: 'core', label: 'Core' },
  { value: 'carry', label: 'Carry' },
  { value: 'sled', label: 'Sled' },
  { value: 'erg', label: 'Erg' },
  { value: 'plyo', label: 'Plyo' },
  { value: 'run', label: 'Run' },
  { value: 'wallBall', label: 'Wall ball' },
  { value: 'calf', label: 'Calf' },
  { value: 'accessory', label: 'Accessory' },
]

/** Every `MeasurementType`, same order as `data/types/enums.ts`. */
export const MEASUREMENT_TYPE_OPTIONS: { value: MeasurementType; label: string }[] = [
  { value: 'strengthSets', label: 'Strength sets' },
  { value: 'reps', label: 'Reps' },
  { value: 'duration', label: 'Duration' },
  { value: 'distance', label: 'Distance' },
  { value: 'pace', label: 'Pace' },
  { value: 'timedStation', label: 'Timed station' },
  { value: 'carry', label: 'Carry' },
  { value: 'mixedStation', label: 'Mixed station' },
]

/** Every `LoadStyle`, same order as `data/types/enums.ts`. */
export const LOAD_STYLE_OPTIONS: { value: LoadStyle; label: string }[] = [
  { value: 'totalBarbell', label: 'Total barbell' },
  { value: 'perDumbbell', label: 'Per dumbbell' },
  { value: 'machineStack', label: 'Machine stack' },
  { value: 'bodyWeight', label: 'Body weight' },
  { value: 'bodyWeightPlusLoad', label: 'Body weight + load' },
  { value: 'custom', label: 'Custom' },
]

/** Every `Unit`. Shared by the default-unit field and (indirectly, via
 * `EMPTY_EXERCISE_DRAFT.defaultUnit`) the increment unit, which the form
 * never exposes separately -- see `ExerciseForm`'s own doc comment. */
export const UNIT_OPTIONS: { value: Unit; label: string }[] = [
  { value: 'lb', label: 'lb' },
  { value: 'kg', label: 'kg' },
  { value: 'custom', label: 'Custom' },
]

/** Starting values for a brand-new exercise: a plain strength movement with
 * a moderate rest and a typical linear-progression increment. Every value
 * here is exactly what "Create" would save if the athlete touched nothing
 * -- these are not placeholders that silently diverge from what gets
 * persisted (the prefilled-but-unpersisted defect class this project has
 * already hit once, in workout set rows). */
export const DEFAULT_REST_SEC = 90
export const DEFAULT_PROGRESSION_INCREMENT = 5
export const DEFAULT_SETS = 3
export const DEFAULT_REP_MIN = 8
export const DEFAULT_REP_MAX = 12

function toLabelMap<T extends string>(options: { value: T; label: string }[]): Record<T, string> {
  return Object.fromEntries(options.map((opt) => [opt.value, opt.label])) as Record<T, string>
}

/** Display-label lookups for `ExerciseDetail` and `LibraryScreen`'s compact
 * rows, derived from the option lists above so the two never drift apart. */
export const CATEGORY_LABEL: Record<ExerciseCategory, string> = toLabelMap(CATEGORY_OPTIONS)
export const MEASUREMENT_TYPE_LABEL: Record<MeasurementType, string> = toLabelMap(MEASUREMENT_TYPE_OPTIONS)
export const LOAD_STYLE_LABEL: Record<LoadStyle, string> = toLabelMap(LOAD_STYLE_OPTIONS)
