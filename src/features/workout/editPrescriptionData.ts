import { db } from '@/data/db'
import type { EditScope, Exercise, InstancePrescription, WorkoutInstance } from '@/data/types'

export interface EditableCandidate {
  prescription: InstancePrescription
  exercise: Exercise
}

export interface EditSheetData {
  instance: WorkoutInstance
  candidates: EditableCandidate[]
}

/**
 * Plain-language scope choices, worded so the athlete understands the
 * difference without reading documentation. Each maps 1:1 onto one of
 * `applyPrescriptionEdit`'s three scopes -- see that function's own doc
 * comment (`@/data/repositories/planRepo`) for the exact contract each one
 * applies; this sheet only chooses which the athlete meant.
 */
export const EDIT_SCOPE_OPTIONS: { value: EditScope; label: string }[] = [
  { value: 'thisWorkout', label: 'Just this workout' },
  { value: 'thisAndFuture', label: 'This and future sessions' },
  { value: 'exerciseDefaultOnly', label: 'Change the exercise default only' },
]

export interface EffectivePrescriptionValues {
  sets: number | null
  repMin: number | null
  repMax: number | null
  restSec: number | null
  targetLoad: number | null
  targetRir: number | null
}

/**
 * The fields this sheet edits, with their current EFFECTIVE value -- the
 * prescription's own snapshot falling back to the exercise default, the same
 * fallback `TargetHeader`/`structureLineFor` already use to DISPLAY these
 * numbers. Showing anything else here would prefill a value the athlete
 * never actually sees elsewhere; and since submitting a field unchanged
 * writes exactly what's shown (see `EditPrescriptionSheet`), this is also
 * what keeps an unedited submit a true no-op rather than silently
 * overwriting a template-derived default with something the athlete didn't
 * choose.
 *
 * `targetLoad`/`targetRir` have no exercise-level default to fall back to --
 * `Exercise` carries no such fields (see its own type) -- so they stay
 * `null` whenever the prescription itself doesn't carry one.
 */
export function effectiveValues(prescription: InstancePrescription, exercise: Exercise): EffectivePrescriptionValues {
  return {
    sets: prescription.sets ?? exercise.defaultSets ?? null,
    repMin: prescription.repMin ?? exercise.repMin ?? null,
    repMax: prescription.repMax ?? exercise.repMax ?? null,
    restSec: prescription.restSec ?? exercise.defaultRestSec ?? null,
    targetLoad: prescription.targetLoad ?? null,
    targetRir: prescription.targetRir ?? null,
  }
}

/**
 * Pure read (safe inside `useLiveQuery`): every prescription this instance
 * carries for a `strengthSets` exercise -- the only measurement type the
 * sets/rep-range/target-load/RIR/rest fields this sheet edits mean anything
 * for. A run or station prescription's own block owns its distance/duration/
 * pace fields instead; out of scope here. Returns `undefined` when the
 * instance itself doesn't exist (deleted/bad id).
 */
export async function loadEditSheetData(instanceId: string): Promise<EditSheetData | undefined> {
  const instance = await db.workoutInstances.get(instanceId)
  if (!instance) return undefined

  const prescriptions = await db.instancePrescriptions.where('instanceId').equals(instanceId).sortBy('order')
  const candidates: EditableCandidate[] = []
  for (const prescription of prescriptions) {
    const exercise = await db.exercises.get(prescription.exerciseId)
    if (exercise && exercise.measurementType === 'strengthSets') candidates.push({ prescription, exercise })
  }
  return { instance, candidates }
}
