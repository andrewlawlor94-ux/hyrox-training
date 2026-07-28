import type { RunType, SledSurface, Station, Surface } from '@/data/types'

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

/** Every `Surface` value, shared by `RunBlock` and `SledFields` so the two
 * pickers never drift apart. */
export const SURFACE_OPTIONS: { value: Surface; label: string }[] = [
  { value: 'track', label: 'Track' },
  { value: 'treadmill', label: 'Treadmill' },
  { value: 'road', label: 'Road' },
  { value: 'other', label: 'Other' },
]

/** Every `SledSurface` value, shared by the two sled stations (`SledFields`)
 * — deliberately a different vocabulary from `SURFACE_OPTIONS`: a sled is
 * pushed/pulled across a floor, never "run" on a track or treadmill. */
export const SLED_SURFACE_OPTIONS: { value: SledSurface; label: string }[] = [
  { value: 'turf', label: 'Turf' },
  { value: 'rubber', label: 'Rubber / gym floor' },
  { value: 'concrete', label: 'Concrete' },
  { value: 'other', label: 'Other' },
]

/** Every `RunType` value, always offered in full regardless of which run
 * exercise is prescribed — the athlete's own choice, not derived silently. */
export const RUN_TYPE_OPTIONS: { value: RunType; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'long', label: 'Long' },
  { value: 'tempo', label: 'Tempo' },
  { value: 'intervals', label: 'Intervals' },
  { value: 'compromised', label: 'Compromised' },
  { value: 'benchmark', label: 'Benchmark' },
  { value: 'race', label: 'Race' },
]

/** Default `RunType` per seeded run exercise, used only as a starting value
 * — the athlete can always change it via the full `RUN_TYPE_OPTIONS` set. */
export const DEFAULT_RUN_TYPE_BY_EXERCISE_ID: Readonly<Record<string, RunType>> = {
  ex_easy_run: 'easy',
  ex_long_run: 'long',
  ex_quality_run: 'tempo',
  ex_compromised_run: 'compromised',
}

/** Month abbreviations for the "Jul 20" short-date format used in the
 * strength target header — deliberately hand-rolled rather than
 * `toLocaleDateString`, which is locale/environment-dependent and would make
 * the header's text non-deterministic across machines. */
export const SHORT_MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const
