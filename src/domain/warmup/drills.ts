import type { ExerciseCategory } from '@/domain/types'

export interface WarmupDrill {
  /** Stable key, so the same drill required by two movements appears once. */
  id: string
  name: string
  /** Prescribed dose, e.g. '8 per side' or '10 reps'. */
  dose: string
  /** Why this drill is here, phrased as what it prepares. Shown to the athlete —
   * a warm-up list with no reasons is a list to skip. */
  why: string
}

const DEAD_BUG: WarmupDrill = {
  id: 'dead_bug',
  name: 'Dead bug',
  dose: '8 per side, slow',
  why: 'Braces the trunk before it has to hold a loaded spine position',
}
const GLUTE_BRIDGE: WarmupDrill = {
  id: 'glute_bridge',
  name: 'Glute bridge',
  dose: '10 reps, 2s hold',
  why: 'Wakes the glutes so the hips drive rather than the lower back',
}
const BIRD_DOG: WarmupDrill = {
  id: 'bird_dog',
  name: 'Bird dog',
  dose: '8 per side',
  why: 'Anti-rotation control for hinging under load',
}
const CAT_CAMEL: WarmupDrill = {
  id: 'cat_camel',
  name: 'Cat-camel',
  dose: '10 slow reps',
  why: 'Moves the spine through its range before you load it',
}
const HIP_90_90: WarmupDrill = {
  id: 'hip_90_90',
  name: '90/90 hip rotations',
  dose: '6 per side',
  why: 'Opens the hips so depth comes from the hip, not the lumbar spine',
}
const BODYWEIGHT_SQUAT: WarmupDrill = {
  id: 'bodyweight_squat',
  name: 'Bodyweight squat',
  dose: '10 reps, pausing at the bottom',
  // Deliberately not "checks depth before adding load": this drill is also
  // prescribed for sleds, wall balls and the rower, where there is no bar and
  // no depth standard, and a reason that only fits barbell squatting reads as
  // nonsense on those sessions.
  why: 'Grooves the squat pattern and wakes the legs up before they have to drive',
}
const HINGE_DOWEL: WarmupDrill = {
  id: 'hinge_dowel',
  name: 'Dowel hip hinge',
  dose: '10 reps',
  why: 'Rehearses the hinge with a neutral spine before the bar is on it',
}
const WALKING_LUNGE_BW: WarmupDrill = {
  id: 'walking_lunge_bw',
  name: 'Bodyweight walking lunge',
  dose: '8 per side',
  why: 'Warms single-leg balance and the trailing hip flexor',
}
const BAND_PULL_APART: WarmupDrill = {
  id: 'band_pull_apart',
  name: 'Band pull-apart',
  dose: '15 reps',
  why: 'Switches on the upper back that has to stay tight under a press or pull',
}
const SCAP_PUSH_UP: WarmupDrill = {
  id: 'scap_push_up',
  name: 'Scapular push-up',
  dose: '10 reps',
  why: 'Gets the shoulder blades moving on the ribcage before pressing',
}
const WALL_SLIDE: WarmupDrill = {
  id: 'wall_slide',
  name: 'Wall slide',
  dose: '10 reps',
  why: 'Overhead range without load, before anything goes overhead',
}
const DEAD_HANG: WarmupDrill = {
  id: 'dead_hang',
  name: 'Dead hang',
  dose: '20-30 seconds',
  why: 'Decompresses and preps grip for pulling and carrying',
}
const ANKLE_BOUNCES: WarmupDrill = {
  id: 'ankle_bounces',
  name: 'Ankle bounces',
  dose: '20 reps, stiff ankles',
  // Also prescribed for burpee broad jumps and calf work, neither of which is
  // running or sled driving — so the reason says what it prepares, not which
  // session asked for it.
  why: 'Preloads the calf and Achilles before they take repeated impact',
}
const LEG_SWINGS: WarmupDrill = {
  id: 'leg_swings',
  name: 'Leg swings',
  dose: '10 per leg, each direction',
  why: 'Takes the hip through its running range',
}
const A_SKIPS: WarmupDrill = {
  id: 'a_skips',
  name: 'A-skips',
  dose: '2 x 20 m',
  why: 'Rehearses the running action at low speed',
}
const CALF_RAISE_WARM: WarmupDrill = {
  id: 'calf_raise_warm',
  name: 'Slow calf raise',
  dose: '10 reps',
  why: 'Preps the lower leg — the tissue most often behind shin pain',
}
const THORACIC_REACH: WarmupDrill = {
  id: 'thoracic_reach',
  name: 'Overhead reach',
  dose: '8 per side',
  // Seen in the browser reading "so the ball can be caught and thrown overhead"
  // on a SkiErg session, which prescribes no ball at all. Phrased by what the
  // drill DOES, so it holds for every session that asks for it.
  why: 'Upper-back extension, so the arms reach overhead without the lower back arching',
}
const ERG_RAMP: WarmupDrill = {
  id: 'erg_ramp',
  name: 'Easy minutes on the machine',
  dose: '2-3 minutes, building',
  why: 'Raises heart rate and rehearses the stroke before the effort',
}
const ARM_CIRCLES: WarmupDrill = {
  id: 'arm_circles',
  name: 'Arm circles',
  dose: '10 each direction',
  why: 'Frees the shoulders before several thousand metres of pulling',
}
const SKI_STROKE_BUILD: WarmupDrill = {
  id: 'ski_stroke_build',
  name: 'Build-up strokes',
  dose: '10 arms only, 10 arms and trunk, 10 full',
  why: 'Adds one part of the SkiErg stroke at a time, so the first hard pull is not the first full one',
}
const ROW_STROKE_BUILD: WarmupDrill = {
  id: 'row_stroke_build',
  name: 'Legs-only strokes',
  dose: '10 legs only, 10 legs and body, 10 full',
  why: 'The standard rowing build-up — it puts the drive back in the right order before you pull hard',
}
const STRIDES: WarmupDrill = {
  id: 'strides',
  name: 'Strides',
  dose: '4 x 20 seconds, building to target pace',
  why: 'Opens the stride and primes race pace, so the first interval is not a cold start',
}
const FARMER_MARCH: WarmupDrill = {
  id: 'farmer_march',
  name: 'Light farmer march',
  dose: '20 m per side',
  why: 'Loads the grip and trunk gradually before the working carry',
}
const POGO_HOPS: WarmupDrill = {
  id: 'pogo_hops',
  name: 'Pogo hops',
  dose: '20 reps',
  why: 'Adds a little elasticity before jumping under fatigue',
}

/**
 * Drills each movement category calls for, in the order they should be done —
 * trunk and joint prep first, pattern rehearsal last.
 *
 * Built from movement demand rather than a generic list: the athlete's example
 * was that "lifting deadlift or squats should have some core warm up like dead
 * bugs", which is exactly the squat/hinge entries below. Nothing here is
 * equipment the plan does not already assume (a band, a bench, a dowel or
 * broomstick), and nothing prescribes static stretching before lifting.
 */
const DRILLS_BY_CATEGORY: Readonly<Record<ExerciseCategory, readonly WarmupDrill[]>> = {
  squat: [DEAD_BUG, GLUTE_BRIDGE, HIP_90_90, BODYWEIGHT_SQUAT],
  hinge: [DEAD_BUG, BIRD_DOG, CAT_CAMEL, GLUTE_BRIDGE, HINGE_DOWEL],
  lunge: [GLUTE_BRIDGE, HIP_90_90, WALKING_LUNGE_BW],
  press: [BAND_PULL_APART, SCAP_PUSH_UP, WALL_SLIDE],
  pull: [BAND_PULL_APART, DEAD_HANG],
  core: [CAT_CAMEL, DEAD_BUG],
  carry: [DEAD_HANG, FARMER_MARCH],
  sled: [ANKLE_BOUNCES, GLUTE_BRIDGE, BODYWEIGHT_SQUAT],
  // Baseline for any machine with a handle. The two the plan actually
  // prescribes — SkiErg and rower — have their own lists in
  // `DRILLS_BY_EXERCISE_ID`, because their demands genuinely differ and one
  // shared list serves neither well. This is what an erg the athlete adds
  // themselves falls back to.
  erg: [ARM_CIRCLES, BAND_PULL_APART, ERG_RAMP],
  plyo: [ANKLE_BOUNCES, POGO_HOPS],
  run: [LEG_SWINGS, ANKLE_BOUNCES, CALF_RAISE_WARM, A_SKIPS],
  wallBall: [THORACIC_REACH, BODYWEIGHT_SQUAT],
  calf: [ANKLE_BOUNCES, CALF_RAISE_WARM],
  // Accessory work is too varied to prescribe for, and it never opens a session
  // on its own — an empty list here means it contributes nothing rather than
  // padding the warm-up with drills that may be irrelevant.
  accessory: [],
}

/**
 * Movements whose own warm-up differs from what their category implies, keyed by
 * exercise id.
 *
 * Category is the right unit almost everywhere, but not for conditioning, and
 * the athlete found it: a Zone 2 session is a single `erg` exercise, so the whole
 * warm-up was one line. Worse, SkiErg and rower share that category while
 * needing near-opposite preparation — the SkiErg is overhead lat and trunk work,
 * the row is a leg drive that finishes with the back. One shared `erg` list
 * serves neither.
 *
 * Only movements that genuinely need it appear here; everything else falls
 * through to its category, and an unknown id simply falls through too, so this
 * table can never make a session's warm-up disappear.
 */
const DRILLS_BY_EXERCISE_ID: Readonly<Record<string, readonly WarmupDrill[]>> = {
  // Overhead, lat-driven, and unforgiving of a cold thoracic spine.
  ex_ski_erg: [ARM_CIRCLES, BAND_PULL_APART, THORACIC_REACH, ERG_RAMP, SKI_STROKE_BUILD],
  // Legs first, then body, then arms — the warm-up mirrors the stroke.
  ex_row: [CAT_CAMEL, BAND_PULL_APART, BODYWEIGHT_SQUAT, ERG_RAMP, ROW_STROKE_BUILD],
  // The one run type where a cold start actually costs you: intervals and tempo
  // begin at pace, so the run's own first mile cannot be the warm-up.
  ex_quality_run: [LEG_SWINGS, ANKLE_BOUNCES, CALF_RAISE_WARM, A_SKIPS, STRIDES],
}

/** The minimum a warm-up needs to know about a prescribed movement. An
 * `Exercise` row satisfies it structurally, so callers pass theirs straight in. */
export interface WarmupSubject {
  id: string
  category: ExerciseCategory
}

/**
 * The warm-up for a whole session: the union of what its movements need, each
 * drill once, in a stable order.
 *
 * Ordered by the movement's position in the session rather than alphabetically,
 * so the drills for the first real exercise come first — an athlete works down
 * the list and then starts training. Deduplicated because a squat-and-hinge day
 * would otherwise ask for dead bugs twice.
 *
 * Each movement contributes its own per-exercise list if it has one, otherwise
 * its category's.
 *
 * Pure: takes the movements, returns drills. No clock, no I/O.
 */
export function warmupDrillsFor(exercises: readonly WarmupSubject[]): WarmupDrill[] {
  const seen = new Set<string>()
  const drills: WarmupDrill[] = []
  for (const exercise of exercises) {
    // `?? []` is not dead code despite `ExerciseCategory` being a closed union:
    // an exercise row read back from an older database (or a hand-imported
    // backup) can carry a category this table has never heard of, and iterating
    // `undefined` would throw during render and take the whole workout screen
    // down with it. Contributing nothing is already a valid outcome here — see
    // `accessory` — so falling back to it costs the athlete a warm-up, not
    // their session.
    const list = DRILLS_BY_EXERCISE_ID[exercise.id] ?? DRILLS_BY_CATEGORY[exercise.category] ?? []
    for (const drill of list) {
      if (seen.has(drill.id)) continue
      seen.add(drill.id)
      drills.push(drill)
    }
  }
  return drills
}
