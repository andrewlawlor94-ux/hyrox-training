import type { LoadStyle, Priority, Unit } from '@/data/types'
import { positiveRestSec } from './stationCircuits'
import type { SeedPrescription, SeedTemplate } from './types'

/** Set/rep-count volume for the two strength sessions, by week. Expressed
 * once as a tiered lookup rather than duplicated across twelve-plus weeks of
 * literals (§19): weeks 1-12 run full volume, weeks 13-21 drop to
 * maintenance dosing (one set off the two main barbell lifts, back squat and
 * bench press), and weeks 22-24 reduce further (accessories drop a set too).
 * Load is never encoded here -- see `week1LoadFields` below. */
export interface StrengthVolume {
  squatSets: number
  rdlSets: number
  splitSquatSets: number
  pallofSets: number
  benchSets: number
  pulldownSets: number
  walkingLungeSets: number
  sledPushReps: number
  sledPullReps: number
  farmerCarryReps: number
  burpeeReps: number
  ergReps: number
}

const FULL_VOLUME: StrengthVolume = {
  squatSets: 4, rdlSets: 3, splitSquatSets: 3, pallofSets: 3,
  benchSets: 3, pulldownSets: 3, walkingLungeSets: 3,
  sledPushReps: 6, sledPullReps: 4, farmerCarryReps: 4, burpeeReps: 4, ergReps: 4,
}

const MAINTENANCE_VOLUME: StrengthVolume = {
  ...FULL_VOLUME, squatSets: 3, benchSets: 2,
}

const REDUCED_VOLUME: StrengthVolume = {
  ...MAINTENANCE_VOLUME,
  squatSets: 2, rdlSets: 2, splitSquatSets: 2, pallofSets: 2, pulldownSets: 2, walkingLungeSets: 2,
  sledPushReps: 4, sledPullReps: 3, farmerCarryReps: 3, burpeeReps: 3, ergReps: 3,
}

/** Weeks 13+ reduce to maintenance dosing; weeks 22-24 reduce further (§19). */
export function strengthVolumeFor(weekNumber: number): StrengthVolume {
  if (weekNumber >= 22) return REDUCED_VOLUME
  if (weekNumber >= 13) return MAINTENANCE_VOLUME
  return FULL_VOLUME
}

function estMinutesFor(weekNumber: number): number {
  if (weekNumber >= 22) return 35
  if (weekNumber >= 13) return 40
  return 50
}

/** Only week 1 seeds a literal starting load -- every later week omits
 * `targetLoad` so the strength recommendation engine's own history-driven
 * progression governs (Task 7's "initial fallback" mode covers week 1;
 * every later week is squarely in "increase"/"repeat" territory). */
function week1LoadFields(weekNumber: number, targetLoad: number, loadUnit: Unit, loadStyle: LoadStyle): Pick<SeedPrescription, 'targetLoad' | 'loadUnit' | 'loadStyle'> | Record<string, never> {
  if (weekNumber !== 1) return {}
  return { targetLoad, loadUnit, loadStyle }
}

/** Strength A (slot 1): back squat, RDL, split squat, sled push/pull, Pallof
 * press. Rest values come from the exercise defaults, restated explicitly on
 * each prescription per §19. */
export function buildStrengthA(weekNumber: number, sequenceInWeek: number, priority: Priority): SeedTemplate {
  const vol = strengthVolumeFor(weekNumber)
  const prescriptions: SeedPrescription[] = [
    { exerciseId: 'ex_back_squat', order: 0, sets: vol.squatSets, repMin: 4, repMax: 6, restSec: positiveRestSec('ex_back_squat', 150), ...week1LoadFields(weekNumber, 175, 'lb', 'totalBarbell') },
    { exerciseId: 'ex_romanian_deadlift', order: 1, sets: vol.rdlSets, repMin: 6, repMax: 8, restSec: positiveRestSec('ex_romanian_deadlift', 120), ...week1LoadFields(weekNumber, 135, 'lb', 'totalBarbell') },
    { exerciseId: 'ex_split_squat', order: 2, sets: vol.splitSquatSets, repMin: 8, repMax: 10, restSec: positiveRestSec('ex_split_squat', 90), ...week1LoadFields(weekNumber, 25, 'lb', 'perDumbbell') },
    { exerciseId: 'ex_sled_push', order: 3, sets: vol.sledPushReps, distanceM: 12.5, restSec: positiveRestSec('ex_sled_push', 90) },
    { exerciseId: 'ex_sled_pull', order: 4, sets: vol.sledPullReps, distanceM: 12.5, restSec: positiveRestSec('ex_sled_pull', 90) },
    { exerciseId: 'ex_pallof_press', order: 5, sets: vol.pallofSets, repMin: 10, repMax: 12, restSec: positiveRestSec('ex_pallof_press', 45) },
  ]
  return {
    sessionSlot: 1,
    sequenceInWeek,
    name: 'Strength A + sled',
    kind: 'strength',
    priority,
    recoveryTags: ['lowerBodyStrength', 'highImpactStation'],
    estMinutes: estMinutesFor(weekNumber),
    prescriptions,
  }
}

/** Strength B (slot 5): bench press, pull/lat pulldown, walking lunge,
 * farmer carry, burpee broad jump, controlled SkiErg/row. */
export function buildStrengthB(weekNumber: number, sequenceInWeek: number, priority: Priority): SeedTemplate {
  const vol = strengthVolumeFor(weekNumber)
  const prescriptions: SeedPrescription[] = [
    { exerciseId: 'ex_bench_press', order: 0, sets: vol.benchSets, repMin: 5, repMax: 8, restSec: positiveRestSec('ex_bench_press', 120), ...week1LoadFields(weekNumber, 140, 'lb', 'totalBarbell') },
    { exerciseId: 'ex_lat_pulldown', order: 1, sets: vol.pulldownSets, repMin: 6, repMax: 10, restSec: positiveRestSec('ex_lat_pulldown', 60) },
    { exerciseId: 'ex_walking_lunge', order: 2, sets: vol.walkingLungeSets, distanceM: 18, restSec: positiveRestSec('ex_walking_lunge', 90) },
    {
      exerciseId: 'ex_farmer_carry', order: 3, sets: vol.farmerCarryReps, distanceM: 50, restSec: positiveRestSec('ex_farmer_carry', 90),
      notes: 'Building toward 2x24 kg per hand.',
      ...week1LoadFields(weekNumber, 16, 'kg', 'custom'),
    },
    { exerciseId: 'ex_burpee_broad_jump', order: 4, sets: vol.burpeeReps, distanceM: 12, restSec: positiveRestSec('ex_burpee_broad_jump', 60) },
    { exerciseId: 'ex_ski_erg', order: 5, sets: vol.ergReps, distanceM: 500, restSec: positiveRestSec('ex_ski_erg', 60), notes: 'Controlled effort, not a time trial.' },
  ]
  return {
    sessionSlot: 5,
    sequenceInWeek,
    name: 'Strength B + HYROX stations',
    kind: 'strength',
    priority,
    recoveryTags: ['upperBodyStrength', 'hybrid'],
    estMinutes: estMinutesFor(weekNumber),
    prescriptions,
  }
}
