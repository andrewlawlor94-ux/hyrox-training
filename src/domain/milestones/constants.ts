/**
 * Eight stations (~32-36 min) plus roxzone transitions (~7-8 min). Validated
 * by the fact that a 1:30 goal then derives exactly the brief's 6:00/km
 * compromised target (see goalTargets.test.ts). Editable in Settings.
 */
export const STATION_AND_ROXZONE_BUDGET_SEC = 2520

/**
 * How much slower a race kilometre runs than a fresh 5 km kilometre. The
 * brief's sub-1:30 pairing ("under 6:00/km" with "approximately 27-28 min")
 * implies ~30 s/km, which is optimistic for a first race, so 45 is used —
 * the stricter direction for a goal-setting tool. Editable in Settings.
 */
export const COMPROMISED_PENALTY_SEC_PER_KM = 45

/** Race running distance: eight 1 km legs between/around the eight stations. */
export const RACE_RUN_KM = 8

/** The standalone benchmark distance the compromised-km target is compared against. */
export const BENCHMARK_5K_KM = 5

/**
 * Floor for the derived fresh-5k per-km pace, purely a numerical guard for
 * an absurd goal time (e.g. a 1000s / ~17min goal). It is not a meaningful
 * running pace — it exists only so `goalTargets` can never divide its way to
 * a negative or zero standalone-5k target. See the "clamps to a positive run
 * budget" test.
 */
export const MIN_STANDALONE_5K_PACE_SEC_PER_KM = 1

/** Used to format seconds as mm:ss evidence strings. */
export const SECONDS_PER_MINUTE = 60

// --- Durability milestones: absolute, never scale with the goal time (D15). ---

/** Longest single continuous run, in km. Durability requirement, not pace. */
export const LONGEST_RUN_TARGET_KM = 12

/** "Comfortable 10k" milestone distance, in km. */
export const COMFORTABLE_10K_KM = 10

/**
 * Peak weekly running-volume target, in km. Not given a numeric value by the
 * design brief (which only says "phase-scaled weekly volume" without a
 * figure) — chosen here as roughly double the 12 km longest-continuous-run
 * milestone, consistent with the common injury-prevention guideline that a
 * single long run should not exceed about half of weekly volume. Relevant
 * given the athlete's shin/sciatic history. Editable in Settings if the
 * assumption proves wrong.
 */
export const WEEKLY_RUN_KM_TARGET = 24

// --- Count-based milestones. ---

/** Six compromised 1 km efforts is the brief's stated confidence threshold. */
export const COMPROMISED_KM_REQUIRED_COUNT = 6

/** Weeks with four or more sessions required for the consistency milestone. */
export const FOUR_WORKOUT_WEEKS_REQUIRED = 4

/**
 * Sessions of race-load sled work required for "confidence". Not numbered by
 * the design brief; chosen as half of the six-effort compromised-km
 * threshold since sled confidence is a coarser, session-level milestone
 * rather than a fine pacing target.
 */
export const RACE_LOAD_SLED_SESSIONS_REQUIRED = 3

/**
 * Sessions of 100 wall balls (broken into manageable sets) required. Same
 * rationale and value as RACE_LOAD_SLED_SESSIONS_REQUIRED.
 */
export const HUNDRED_WALL_BALL_SESSIONS_REQUIRED = 3

/** The twelve milestone keys, in the fixed display/evaluation order from §18. */
export type MilestoneKey =
  | 'fourWorkoutWeeks'
  | 'weeklyRunningDistance'
  | 'longestContinuousRun'
  | 'comfortable10k'
  | 'standalone5k'
  | 'compromisedKmSet'
  | 'raceLoadSled'
  | 'hundredWallBall'
  | 'halfSimulation'
  | 'seventyFiveSimulation'
  | 'fullRehearsal'
  | 'symptomsManageable'

/** Stable evaluation/display order — mirrors §18's listing exactly. */
export const MILESTONE_ORDER: readonly MilestoneKey[] = [
  'fourWorkoutWeeks',
  'weeklyRunningDistance',
  'longestContinuousRun',
  'comfortable10k',
  'standalone5k',
  'compromisedKmSet',
  'raceLoadSled',
  'hundredWallBall',
  'halfSimulation',
  'seventyFiveSimulation',
  'fullRehearsal',
  'symptomsManageable',
]

export const MILESTONE_LABELS: Record<MilestoneKey, string> = {
  fourWorkoutWeeks: 'Consistent four-workout weeks',
  weeklyRunningDistance: 'Weekly running distance',
  longestContinuousRun: 'Longest continuous run',
  comfortable10k: 'Comfortable 10 km',
  standalone5k: 'Standalone 5 km benchmark',
  compromisedKmSet: 'Six compromised 1 km efforts',
  raceLoadSled: 'Race-load sled confidence',
  hundredWallBall: '100 wall balls in manageable sets',
  halfSimulation: 'Half simulation',
  seventyFiveSimulation: '75% simulation',
  fullRehearsal: 'Controlled full-format rehearsal',
  symptomsManageable: 'Symptoms manageable',
}

/**
 * Plan week by which each milestone should be met, based on the plan's fixed
 * 24-week periodization (base weeks 1-8, build 9-16, peak 17-20, taper/race
 * 21-24 — §19). `halfSimulation` (12), `seventyFiveSimulation` (18), and
 * `fullRehearsal` (21) come directly from the design brief (D4); the other
 * nine are not numbered by the brief and are placed here at a plausible
 * point in that same periodization so every milestone can be checked against
 * "target week has passed" (see evaluate.ts). A milestone not yet achieved
 * after its target week is reported `atRisk` rather than merely `inProgress`.
 */
export const MILESTONE_TARGET_WEEKS: Record<MilestoneKey, number> = {
  fourWorkoutWeeks: 6,
  weeklyRunningDistance: 14,
  longestContinuousRun: 16,
  comfortable10k: 10,
  standalone5k: 8,
  compromisedKmSet: 16,
  raceLoadSled: 12,
  hundredWallBall: 12,
  halfSimulation: 12,
  seventyFiveSimulation: 18,
  fullRehearsal: 21,
  symptomsManageable: 24,
}

// --- Trajectory (§4.6). ---

/**
 * `met - expectedByNow` at or below this value (but above the
 * needs-attention threshold) is `slightlyBehind`. One milestone short of
 * pace.
 */
export const TRAJECTORY_SLIGHTLY_BEHIND_DELTA = -1

/** `met - expectedByNow` at or below this value is `needsAttention`. */
export const TRAJECTORY_NEEDS_ATTENTION_DELTA = -2

/**
 * `estimateRaceRange`'s band width as a fraction of the point projection —
 * a deliberately wide ±4% so the UI never reads as a false-precision point
 * prediction (D14).
 */
export const RACE_ESTIMATE_BAND_FRACTION = 0.04
