import type { HyroxStandard, PaceSource, Station } from '@/data/types'
import { SEED_EXERCISES } from '@/data/seed/exercises'
import { SEED_HYROX_STANDARDS } from '@/data/seed/hyroxStandards'
import type { SeedPrescription } from './types'

// `SEED_HYROX_STANDARDS` is declared `as const satisfies readonly
// HyroxStandard[]`, so each element's inferred type only carries the fields
// that particular literal happens to set. Widening to `HyroxStandard[]` here
// lets every station's optional fields (loadKg, reps, etc.) be read uniformly.
const HYROX_STANDARDS: readonly HyroxStandard[] = SEED_HYROX_STANDARDS

/** Mandatory per D-brief: every wall-ball prescription must carry this note,
 * regardless of which template it lands in (station circuit or strength). */
export const WALL_BALL_OVERHEAD_NOTE = 'Confirm overhead clearance before starting.'

const STATION_TO_EXERCISE_ID: Record<Station, string> = {
  skiErg: 'ex_ski_erg',
  sledPush: 'ex_sled_push',
  sledPull: 'ex_sled_pull',
  burpeeBroadJump: 'ex_burpee_broad_jump',
  row: 'ex_row',
  farmerCarry: 'ex_farmer_carry',
  sandbagLunge: 'ex_sandbag_lunge',
  wallBalls: 'ex_wall_ball',
}

/** Race order, matching `SEED_HYROX_STANDARDS`. Circuits slice a prefix of
 * this list (fewer rounds = fewer distinct stations touched that week). */
export const STATION_ORDER: readonly Station[] = [
  'skiErg', 'sledPush', 'sledPull', 'burpeeBroadJump', 'row', 'farmerCarry', 'sandbagLunge', 'wallBalls',
]

function exerciseDefaultRestSec(exerciseId: string): number {
  const exercise = SEED_EXERCISES.find((e) => e.id === exerciseId)
  if (!exercise) throw new Error(`Unknown exercise id: ${exerciseId}`)
  return exercise.defaultRestSec
}

/** Every prescription must carry a positive `restSec` (structural invariant).
 * Several exercises (all four running exercises) default to 0 because their
 * "rest" is expressed via `intervalSpec.recoverySec` instead -- for those,
 * fall back to a sensible transition/recovery buffer. */
export function positiveRestSec(exerciseId: string, fallbackSec: number): number {
  const restSec = exerciseDefaultRestSec(exerciseId)
  return restSec > 0 ? restSec : fallbackSec
}

/** Scales a HYROX-standard volume (distance or reps) to a percentage of full
 * race volume, rounding to the nearest whole unit. */
export function scaleToPct(baseValue: number, stationVolumePct: number): number {
  return Math.round((baseValue * stationVolumePct) / 100)
}

/**
 * Builds one station prescription at a given percentage of full HYROX
 * station volume. Load never scales with volume -- HYROX training reduces
 * distance/reps at race load, not the load itself -- so `targetLoad` always
 * reflects the full competition standard from `SEED_HYROX_STANDARDS`.
 */
export function buildStationPrescription(station: Station, stationVolumePct: number, order: number): SeedPrescription {
  const standard = HYROX_STANDARDS.find((s) => s.station === station)
  if (!standard) throw new Error(`No HYROX standard for station: ${station}`)
  const exerciseId = STATION_TO_EXERCISE_ID[station]
  const restSec = positiveRestSec(exerciseId, 60)
  const load = standard.loadKg ?? standard.loadPerHandKg ?? standard.ballKg
  const loadFields = load !== undefined ? { targetLoad: load, loadUnit: 'kg' as const, loadStyle: 'custom' as const } : {}
  const noteFields = station === 'wallBalls' ? { notes: WALL_BALL_OVERHEAD_NOTE } : {}

  if (standard.reps !== undefined) {
    const scaledReps = scaleToPct(standard.reps, stationVolumePct)
    return { exerciseId, order, sets: 1, repMin: scaledReps, repMax: scaledReps, restSec, ...loadFields, ...noteFields }
  }
  const scaledDistanceM = scaleToPct(standard.distanceM ?? 0, stationVolumePct)
  return { exerciseId, order, sets: 1, distanceM: scaledDistanceM, restSec, ...loadFields, ...noteFields }
}

/** Builds a rotating subset of the 8 HYROX stations (in race order) at a
 * given percentage of full volume -- one prescription per station, starting
 * at `order`. `stationCount === 8` builds the full-format circuit. */
export function buildStationCircuit(stationCount: number, stationVolumePct: number, order: number): SeedPrescription[] {
  return STATION_ORDER.slice(0, stationCount).map((station, i) => buildStationPrescription(station, stationVolumePct, order + i))
}

interface CompromisedRunOptions {
  paceSource?: PaceSource
  notes?: string
}

/** Builds the running portion of a hybrid/simulation session: `reps` legs of
 * `workDistanceM` off tired legs, per `ex_compromised_run` (pace drifts by
 * design -- see that exercise's technique notes). */
export function buildCompromisedRunPrescription(
  reps: number,
  workDistanceM: number,
  recoverySec: number,
  order: number,
  opts: CompromisedRunOptions = {},
): SeedPrescription {
  const restSec = positiveRestSec('ex_compromised_run', 60)
  const paceFields = opts.paceSource ? { paceSource: opts.paceSource } : {}
  const noteFields = opts.notes !== undefined ? { notes: opts.notes } : {}
  return {
    exerciseId: 'ex_compromised_run',
    order,
    restSec,
    intervalSpec: { reps, workDistanceM, recoverySec },
    ...paceFields,
    ...noteFields,
  }
}

/**
 * Lower-leg durability work appended to every easy-run template (§8, §19):
 * straight-knee calf raise, bent-knee calf raise, tibialis raise. This is the
 * shin-durability foundation the whole plan's running progression depends
 * on, so it must be present on every easy run, not just some.
 *
 * AFTER the run, deliberately — the spec is explicit ("Lower-leg durability
 * after every easy run"). These are strengthening sets, not a warm-up: doing
 * calf and tibialis raises first would pre-fatigue the exact muscles the run
 * then loads, which is the opposite of what shin-durability work is for.
 *
 * Each one carries that as a `notes` string because the ordering was read as a
 * mis-placed warm-up by the athlete using it — the screen listed the exercises
 * in order with nothing saying why they came last. The order was right and the
 * explanation was missing, so the note is the fix, not a reorder.
 */
const AFTER_RUN_NOTE = 'Do this after the run, not as a warm-up — these strengthen the lower leg, and doing them first would pre-fatigue it.'

export function lowerLegDurabilityPrescriptions(orderStart: number): SeedPrescription[] {
  return [
    { exerciseId: 'ex_calf_raise_straight_knee', order: orderStart, sets: 3, repMin: 12, repMax: 15, restSec: positiveRestSec('ex_calf_raise_straight_knee', 45), notes: AFTER_RUN_NOTE },
    { exerciseId: 'ex_calf_raise_bent_knee', order: orderStart + 1, sets: 3, repMin: 12, repMax: 15, restSec: positiveRestSec('ex_calf_raise_bent_knee', 45), notes: AFTER_RUN_NOTE },
    { exerciseId: 'ex_tibialis_raise', order: orderStart + 2, sets: 3, repMin: 15, repMax: 20, restSec: positiveRestSec('ex_tibialis_raise', 45), notes: AFTER_RUN_NOTE },
  ]
}
