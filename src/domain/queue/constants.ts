/** Four sessions is the minimum effective week (§15). */
export const MIN_EFFECTIVE_WEEK_SESSIONS = 4
/** Six sessions is the ideal week; five and six are additional productive volume. */
export const IDEAL_WEEK_SESSIONS = 6
/** Rest-day invariant is evaluated over every window of this length. */
export const ROLLING_WINDOW_DAYS = 7
export const MIN_REST_DAYS_PER_ROLLING_WINDOW = 1
/** A race simulation needs this many clear days before hard work resumes. */
export const SIMULATION_CLEAR_DAYS_AFTER = 2
/** The matrix only compares immediately adjacent days. */
export const ADJACENT_DAY_SPAN = 1

/**
 * Maps a template's `sessionSlot` (1-6, Monday-Saturday) to the number of
 * days to add to the Monday that starts its plan week. Sunday (slot 7) is
 * deliberately absent — it is always the plan's free day (§19).
 */
export const SLOT_DAY_OFFSET: Record<number, number> = {
  1: 0,
  2: 1,
  3: 2,
  4: 3,
  5: 4,
  6: 5,
}
