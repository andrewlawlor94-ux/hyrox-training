import type { Station } from '@/data/types'

/** Autosave debounce window: a field commits this long after the last
 * keystroke if nothing else (blur, visibilitychange, unmount) flushes it
 * sooner. */
export const AUTOSAVE_DEBOUNCE_MS = 250

/** Maps a seeded HYROX-standard station exercise to the `Station` enum value
 * its `StationLog` rows key on. Mirrors the inverse of
 * `STATION_TO_EXERCISE_ID` in `src/data/seed/plan24Week/stationCircuits.ts` —
 * duplicated rather than imported because that module lives under
 * `src/data/seed`, which is seed-authoring code, not a runtime dependency the
 * UI layer should reach into. An exercise id with no entry here (a
 * user-created "station-shaped" exercise, for instance) still renders the
 * same fields; only persistence into `StationLog` is skipped for it. */
export const STATION_BY_EXERCISE_ID: Readonly<Record<string, Station>> = {
  ex_ski_erg: 'skiErg',
  ex_sled_push: 'sledPush',
  ex_sled_pull: 'sledPull',
  ex_burpee_broad_jump: 'burpeeBroadJump',
  ex_row: 'row',
  ex_farmer_carry: 'farmerCarry',
  ex_sandbag_lunge: 'sandbagLunge',
  ex_wall_ball: 'wallBalls',
}

/** Month abbreviations for the "Jul 20" short-date format used in the
 * strength target header — deliberately hand-rolled rather than
 * `toLocaleDateString`, which is locale/environment-dependent and would make
 * the header's text non-deterministic across machines. */
export const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const
