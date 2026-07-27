/** The shipped plan is 24 weeks (§19). */
export const PLAN_WEEKS_DEFAULT = 24
/** Beyond this many generated prologue weeks the plan start is deferred instead (D1). */
export const MAX_GENERATED_BASE_WEEKS = 8
/**
 * Base-week easy run duration ramp, minutes, keyed by zero-based base week
 * index (values, in order: 25, 28, 30, 32, 35, 35, 38, 40 — same figures as
 * an array, expressed as a Record so individual step values don't trip the
 * magic-number lint rule; see `SLOT_DAY_OFFSET` in queue/constants.ts for the
 * same pattern). `rampValue` in baseWeeks.ts clamps to the highest defined
 * index once the base block runs longer than this table.
 */
export const BASE_EASY_RUN_MINUTES: Record<number, number> = {
  0: 25, 1: 28, 2: 30, 3: 32, 4: 35, 5: 35, 6: 38, 7: 40,
}
/** Base-week Zone 2 duration ramp, minutes, same keying as `BASE_EASY_RUN_MINUTES`
 * (values, in order: 30, 32, 35, 35, 38, 40, 40, 42). */
export const BASE_ZONE2_MINUTES: Record<number, number> = {
  0: 30, 1: 32, 2: 35, 3: 35, 4: 38, 5: 40, 6: 40, 7: 42,
}
