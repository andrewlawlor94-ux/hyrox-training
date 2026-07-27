/** Mean RIR at or above this means there was room to add load. */
export const MIN_RIR_FOR_INCREASE = 1
/** Standard barbell jump. */
export const DEFAULT_INCREMENT_LB = 5
/** Per-hand dumbbell jump. */
export const DEFAULT_DUMBBELL_INCREMENT_LB = 5
/** Typical machine stack plate. */
export const DEFAULT_MACHINE_INCREMENT_LB = 10
/** Station loads follow competition standards, so they never auto-increase (§9). */
export const STATION_INCREMENT = 0

/** Days in an ISO calendar week — used by previousWeekRange's Monday-start
 * week-boundary arithmetic in strengthTarget.ts. */
export const DAYS_PER_WEEK = 7
/** ISO date fields (YYYY-MM-DD) always render month and day as two digits. */
export const ISO_DATE_FIELD_WIDTH = 2
