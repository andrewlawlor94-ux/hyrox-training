import type { Priority } from '@/domain/types'

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

/** Calendar days in one plan week — used to step from one week's Monday to
 * the next. Kept distinct from `ROLLING_WINDOW_DAYS` even though the value
 * is the same 7: one names a calendar week, the other a rest-day rolling
 * window, and the two are free to diverge in a future revision. */
export const DAYS_PER_WEEK = 7

/**
 * Automated placement (the queue engine's own catch-up/forward search) only
 * ever proposes Monday-Saturday as a candidate day — Sunday is structurally
 * reserved as the week's free day and is never offered by the search, only
 * by a manual pinned override. This is what keeps a fully-packed week from
 * silently consuming the plan's one guaranteed rest day, and is separate
 * from (stricter than) the rolling rest-day rule in eligibility.ts.
 */
export const AUTOMATED_PLACEMENT_WEEKDAYS_PER_WEEK = 6

/**
 * The priority-tier processing order for placement (§15): "Essential
 * sessions move first. Important sessions move second. Optional sessions are
 * dropped first when insufficient days remain." Every instance of a lower
 * rank is decided only after every instance of every higher rank has already
 * been decided, which is what makes the priority-ladder invariant (an
 * essential is never dropped while a lower-priority same-week peer is
 * scheduled) hold structurally rather than through a reactive correction —
 * see `byPriorityTier` in `placement.ts`.
 */
export const PRIORITY_TIER_RANK: Record<Priority, number> = { essential: 0, important: 1, optional: 2 }
