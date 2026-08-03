import type { Station } from '@/data/types'

/** The measurable fields a station log can carry. `load` is excluded for the
 * sleds because their weight is captured by `SledFields` (sled weight + added
 * plates + surface), which is a richer thing than a single load number. */
export type StationField = 'distance' | 'reps' | 'load' | 'time' | 'breaks' | 'rpe'

/**
 * Which fields each HYROX station actually has, and what "breaks" means for it.
 *
 * Every station used to render all six fields, which made a sled push ask for
 * "Reps" — a number that does not exist for a 50 m push. The athlete asked
 * directly: "What are reps and breaks? Should they be there? If so explain
 * better how to fill this section out." The honest answer for reps on a sled is
 * no, so it is no longer shown; the answer for breaks is yes, and it now says
 * what it means.
 *
 * Station definitions follow the Men's Open standards seeded in
 * `hyroxStandards.ts`: the sleds, carries and jumps are measured over a
 * DISTANCE, the ergs over a distance too, and only wall balls are counted in
 * reps.
 */
export interface StationFieldSpec {
  fields: readonly StationField[]
  /** Plain-language hint for `breaks`, phrased for this station's actual
   * movement. Shown under the field rather than left to be guessed. */
  breaksHint: string
}

const DISTANCE_STATION_BREAKS = 'How many times you stopped and put it down mid-effort. Leave blank if you never stopped.'
const ERG_STATION_BREAKS = 'How many times you came off the machine mid-effort. Leave blank if you never stopped.'

export const STATION_FIELDS: Readonly<Record<Station, StationFieldSpec>> = {
  // 1,000 m on the machine, timed. No reps, and the load is fixed by the erg.
  skiErg: { fields: ['distance', 'time', 'breaks', 'rpe'], breaksHint: ERG_STATION_BREAKS },
  row: { fields: ['distance', 'time', 'breaks', 'rpe'], breaksHint: ERG_STATION_BREAKS },

  // 50 m of sled, in lengths. Weight comes from the sled fields below the
  // measurements, so no single `load` here.
  sledPush: {
    fields: ['distance', 'time', 'breaks', 'rpe'],
    breaksHint: 'How many times you stopped pushing mid-length. Leave blank if you pushed straight through.',
  },
  sledPull: {
    fields: ['distance', 'time', 'breaks', 'rpe'],
    breaksHint: 'How many times you stopped pulling mid-length. Leave blank if you pulled straight through.',
  },

  // 80 m of burpee broad jumps: distance-measured, but reps are worth logging
  // since athletes count them.
  burpeeBroadJump: {
    fields: ['distance', 'reps', 'time', 'breaks', 'rpe'],
    breaksHint: 'How many times you paused between jumps. Leave blank if you kept moving.',
  },

  // Carried for a distance, with a real per-hand/total load.
  farmerCarry: { fields: ['distance', 'load', 'time', 'breaks', 'rpe'], breaksHint: DISTANCE_STATION_BREAKS },
  sandbagLunge: { fields: ['distance', 'load', 'time', 'breaks', 'rpe'], breaksHint: DISTANCE_STATION_BREAKS },

  // The one station counted in reps, not metres.
  wallBalls: {
    fields: ['reps', 'load', 'time', 'breaks', 'rpe'],
    breaksHint: 'How many times you stopped and reset before finishing the reps. Leave blank if you went unbroken.',
  },
}

/** Fields for a station with no `Station` mapping (a non-HYROX accessory logged
 * through this block). Everything is offered, since nothing is known about it. */
export const DEFAULT_STATION_FIELDS: StationFieldSpec = {
  fields: ['distance', 'reps', 'load', 'time', 'breaks', 'rpe'],
  breaksHint: 'How many times you stopped mid-effort. Leave blank if you never stopped.',
}

export function stationFieldSpec(station: Station | undefined): StationFieldSpec {
  return station === undefined ? DEFAULT_STATION_FIELDS : STATION_FIELDS[station]
}
