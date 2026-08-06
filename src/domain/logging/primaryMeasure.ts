import type { MeasurementType } from '@/domain/types'

/** The one measurement that decides whether a movement was actually done. */
export type PrimaryMeasure = 'reps' | 'time' | 'distance'

export interface PrimaryMeasureSpec {
  measure: PrimaryMeasure
  /** What the deciding box is called on screen, e.g. 'Reps'. */
  label: string
  /** Said to the athlete, so the rule is never a hidden one. */
  why: string
}

const REPS: PrimaryMeasureSpec = {
  measure: 'reps',
  label: 'Reps',
  why: 'A set with no reps is a set you did not do — the weight alone says nothing happened.',
}
const TIME: PrimaryMeasureSpec = {
  measure: 'time',
  label: 'Time',
  why: 'Without a time there is nothing to compare against next week.',
}
const DISTANCE: PrimaryMeasureSpec = {
  measure: 'distance',
  label: 'Distance',
  why: 'Without a distance there is nothing to compare against next week.',
}

/**
 * Which single measurement decides "did I do this", per kind of movement.
 *
 * The athlete asked for exactly this, and asked for the reasoning to be checked
 * rather than assumed: "if I don't enter reps I didn't do it, but with other
 * hyrox exercises or running there are some fields that don't make sense and I
 * leave blank. So every exercise should have its own main box that is looked at
 * for if I completed or not."
 *
 * They are right, and the previous behaviour was worse than inconsistent — it
 * differed per block for no stated reason. A run needed BOTH distance and
 * duration or it saved nothing; a station saved as soon as any field at all was
 * touched, so a sled push with only an RPE entered counted as done; a strength
 * set counted as done the moment Complete was tapped, reps or no reps.
 *
 * One box per movement, chosen by how the movement is measured:
 *
 * - `strengthSets` -> reps. Their own example, and it holds for body-weight work
 *   where there is no load to enter at all.
 * - `reps` (wall balls) -> reps. The station is scored in reps.
 * - `duration` -> time. A 40-minute easy run is a time.
 * - `timedStation` (the sleds) -> time. 50 m is fixed by the standard; the time
 *   is the result.
 * - `distance`, `pace`, `carry`, `mixedStation` -> distance. These are measured
 *   over a set distance, and on a treadmill or a broken-up carry the athlete may
 *   genuinely not have a clean time.
 *
 * Deliberately never `load` or `rpe`. Load is fixed by the HYROX standard for
 * every race station, so it is prefilled and carries no evidence that anything
 * was done; RPE is an opinion about work, not the work.
 */
const SPEC_BY_MEASUREMENT: Readonly<Record<MeasurementType, PrimaryMeasureSpec>> = {
  strengthSets: REPS,
  reps: REPS,
  duration: TIME,
  timedStation: TIME,
  distance: DISTANCE,
  pace: DISTANCE,
  carry: DISTANCE,
  mixedStation: DISTANCE,
}

/** The deciding box for a movement. Falls back to distance for a measurement
 * type this table has never heard of — a row from an older database must not
 * make the caller throw. */
export function primaryMeasureFor(measurementType: MeasurementType): PrimaryMeasureSpec {
  return SPEC_BY_MEASUREMENT[measurementType] ?? DISTANCE
}

/**
 * Whether a value in the deciding box counts as "I did this".
 *
 * Positive and finite, not merely present: `0` reps is not a set, and a `0`
 * distance is not a run. This is the same assertion-blind-to-validity trap the
 * run block was already fixed for — `!== null` alone accepted a zero.
 */
export function countsAsDone(value: number | null | undefined): boolean {
  return value !== null && value !== undefined && Number.isFinite(value) && value > 0
}
