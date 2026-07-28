/**
 * How close a logged run's distance must be to 5 km to count as the
 * standalone 5 km benchmark (`RunType: 'benchmark'` already narrows this to
 * benchmark-intent runs; this only guards against a mis-logged distance on
 * an otherwise-benchmark-tagged run).
 */
export const BENCHMARK_5K_TOLERANCE_KM = 0.3

/**
 * Reps required for a station log to count toward the "100 wall balls in
 * manageable sets" milestone fact — the number is the milestone's own name
 * (see `@/domain/milestones/constants`'s `MILESTONE_LABELS.hundredWallBall`),
 * not a fresh invention here.
 */
export const WALL_BALL_SESSION_REPS = 100

/**
 * Sessions-per-week threshold for "This week"'s four-session-minimum status.
 * Matches the plan-wide "weeks with 4+ sessions" milestone's own threshold
 * (see `@/domain/milestones/constants`'s `FOUR_WORKOUT_WEEKS_REQUIRED` doc
 * comment) — this is the same "four" applied to a single week rather than a
 * fresh number.
 */
export const WEEKLY_SESSION_MINIMUM = 4

/** Statuses that count as "the athlete did this session" for frequency and
 * completion tallies (a partial effort still counts as having shown up). */
export const ATTENDED_STATUSES = ['completed', 'partiallyCompleted'] as const
