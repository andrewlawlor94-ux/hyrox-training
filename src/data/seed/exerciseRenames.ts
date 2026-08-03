/**
 * Seeded exercises whose display NAME has changed since they shipped, applied on
 * every boot by `reconcileSeededNames`.
 *
 * Renaming in `SEED_EXERCISES` alone is not enough: `seedIfEmpty` deliberately
 * never touches a table that already has rows, so an athlete who onboarded before
 * the rename would keep the old name forever. The exercise ID never changes, so
 * every logged set, prescription and template keeps pointing at the same row —
 * history and workout position are untouched, which is exactly what was asked
 * for ("Just change name but keep records and where they are in workouts").
 *
 * `from` matters: the rename only applies to a row still carrying the previously
 * SHIPPED name. If the athlete has renamed it themselves, theirs wins and this
 * leaves it alone — a seeded row is still editable in the library, and silently
 * overwriting their edit would be worse than an out-of-date name.
 *
 * Idempotent by construction: after the first pass the name no longer matches
 * `from`, so later boots do nothing.
 */
export interface SeedExerciseRename {
  id: string
  from: string
  to: string
}

export const SEED_EXERCISE_RENAMES: readonly SeedExerciseRename[] = [
  { id: 'ex_split_squat', from: 'Split squat', to: 'Bulgarian split squat' },
]
