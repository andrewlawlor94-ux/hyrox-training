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
 * Weekly running-volume target, in km. Not given a numeric value by the
 * design brief (which only says "phase-scaled weekly volume" without a
 * figure). The race itself is 8 km of running, and weekly volume needs to
 * sit meaningfully above race distance for the athlete to be durable rather
 * than merely capable of the distance once. The seeded plan's own peak
 * weeks (13-21) prescribe roughly an easy run ~8 km, a quality session
 * ~9 km including warm-up/cool-down, and a long run up to 12 km — a planned
 * peak of 30-36 km/week. 28 km is therefore "consistently at adequate
 * volume", not "at peak": the right bar for a milestone (as opposed to a
 * one-off best week), and deliberately conservative given the athlete's
 * shin history makes running volume this plan's main injury risk. Editable
 * in Settings if the assumption proves wrong.
 */
export const WEEKLY_RUN_DISTANCE_TARGET_KM = 28

// --- Count-based milestones. ---

/** Six compromised 1 km efforts is the brief's stated confidence threshold. */
export const COMPROMISED_KM_REQUIRED_COUNT = 6

/**
 * Number of weeks (counted, not required to be consecutive) with four or
 * more sessions. This is deliberately a count: `MilestoneFacts` carries
 * `weeksWithFourPlusSessions` as a running total, not a list of which weeks
 * qualified, so there is no way to check adjacency from these facts alone.
 * A true consecutive-streak version would need a different fact shape
 * (e.g. per-week qualifying flags) and is out of scope here — the label and
 * evidence for this milestone must say "N weeks with 4+ sessions", never
 * "N consecutive weeks" or "consistent", so the UI never claims a
 * consistency it hasn't actually measured.
 */
export const FOUR_WORKOUT_WEEKS_REQUIRED = 4

/**
 * Sessions of race-load sled work required for "confidence". Not numbered by
 * the design brief. The milestone is explicitly *confidence*, not mere
 * capability: the plan deliberately prescribes race-load exposure without
 * exhausting failure attempts, so a single session only proves the load can
 * be moved once. Three separate sessions at race load is what makes it
 * unremarkable on race day — fewer would let a single good day count as
 * confidence.
 */
export const RACE_LOAD_SLED_SESSIONS_REQUIRED = 3

/**
 * Sessions of 100 wall balls (broken into manageable sets) required. Not
 * numbered by the design brief. Same shape of reasoning as
 * RACE_LOAD_SLED_SESSIONS_REQUIRED: the milestone is completing 100 in
 * manageable sets, and three sessions distinguishes a repeatable capacity
 * from one lucky effort. Wall balls are the station most likely to degrade
 * under fatigue for a taller, heavier athlete, so a single completion is
 * weak evidence.
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
  // Deliberately not "Consistent four-workout weeks" — the underlying fact
  // is a count of qualifying weeks, not a measured consecutive streak (see
  // FOUR_WORKOUT_WEEKS_REQUIRED). Claiming consistency the app hasn't
  // measured would be exactly the guilt/misleading framing the brief bans.
  fourWorkoutWeeks: 'Weeks with 4+ sessions',
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
 * Plan week by which each milestone should be met. Anchored to the seeded
 * 24-week plan's own benchmark weeks — it already places a 5 km benchmark
 * and the half simulation in week 12, the 75% simulation in week 18, and
 * the full rehearsal in week 21 (D4) — so every other milestone hangs off
 * one of those three fixed points rather than an arbitrary date. That way
 * `atRisk` (see evaluate.ts's target-week check) fires when a milestone is
 * genuinely late relative to the plan's own structure, not on a guess:
 *
 * - `fourWorkoutWeeks` (6): consistency is a base-phase outcome — if it
 *   isn't there by the end of Base, nothing later works.
 * - `standalone5k` (12) / `halfSimulation` (12): the plan's own benchmark
 *   week.
 * - `comfortable10k` (12): a durability precondition for the build phase.
 * - `weeklyRunningDistance` (14): volume should be at target early in
 *   race-specific work.
 * - `raceLoadSled` (16) / `hundredWallBall` (16): race-specific-phase
 *   exposure, before the 75% simulation.
 * - `longestContinuousRun` (18) / `seventyFiveSimulation` (18): 12 km
 *   should be reached by the 75% simulation.
 * - `compromisedKmSet` (20): the last fitness marker before taper.
 * - `fullRehearsal` (21): the plan's own rehearsal week.
 * - `symptomsManageable` (24): evaluated continuously — its own status
 *   logic (atRisk iff currently flagged) already dominates, so this target
 *   week only matters as the last point at which "still flagged" becomes
 *   a plan-ending risk, not as a deadline that turns a healthy athlete
 *   `atRisk` merely because week 24 hasn't arrived yet.
 */
export const MILESTONE_TARGET_WEEKS: Record<MilestoneKey, number> = {
  fourWorkoutWeeks: 6,
  weeklyRunningDistance: 14,
  longestContinuousRun: 18,
  comfortable10k: 12,
  standalone5k: 12,
  compromisedKmSet: 20,
  raceLoadSled: 16,
  hundredWallBall: 16,
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

/**
 * The shipped default race goal: 1:35:00 target, 1:30:00 stretch (D16).
 *
 * These exist as constants specifically so nothing has to invent a stand-in
 * goal. A placeholder of `targetSeconds: 0` is not "no goal" — it is a goal of
 * zero seconds, which silently propagates through `goalTargets` into nonsense
 * pace milestones, and leaked into an assertion as a real `0`. Any code that
 * needs a goal before the athlete has chosen one uses these instead.
 */
export const DEFAULT_TARGET_SECONDS = 5700
export const DEFAULT_STRETCH_SECONDS = 5400
