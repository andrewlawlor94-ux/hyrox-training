import type { Exercise } from '@/data/types'
import { LOWER_BODY_EXERCISES } from './exercises/lowerBody'
import { UPPER_BODY_EXERCISES } from './exercises/upperBody'
import { CORE_EXERCISES } from './exercises/core'
import { STATION_EXERCISES } from './exercises/stations'
import { CALF_EXERCISES } from './exercises/calf'
import { RUNNING_EXERCISES } from './exercises/running'

/**
 * The full seeded exercise library, split across `./exercises/*` by category
 * group (lower body, upper body, core, stations, calf/tibialis, running) to
 * keep each source file well under the ~250-line guideline. This barrel is
 * the single import surface the rest of the app (and `seedRunner`) uses.
 */
export const SEED_EXERCISES = [
  ...LOWER_BODY_EXERCISES,
  ...UPPER_BODY_EXERCISES,
  ...CORE_EXERCISES,
  ...STATION_EXERCISES,
  ...CALF_EXERCISES,
  ...RUNNING_EXERCISES,
] as const satisfies readonly Exercise[]
