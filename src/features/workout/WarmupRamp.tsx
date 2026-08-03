import type { FC } from 'react'
import type { Exercise, Load } from '@/data/types'
import { formatLoad } from '@/domain/units/format'
import { warmupRampFor } from '@/domain/warmup/ramp'

interface WarmupRampProps {
  exercise: Exercise
  /** Today's recommended working load — the ramp is a percentage of this. */
  workingLoad: Load
}

/**
 * Warm-up sets leading up to today's working weight (athlete: "add warm up reps
 * for compound moves. Should be a scientifically backed formula the pre fills
 * based on recomended weight").
 *
 * On the honesty of that: a percentage ramp is standard strength-and-conditioning
 * practice rather than the output of one specific study, and coaches differ on
 * the exact percentages. So this is labelled a convention, not "the" formula —
 * see `warmupRampFor` for what the convention encodes and why reps fall as the
 * load rises.
 *
 * Deliberately NOT loggable rows. Warm-up sets are not training history: feeding
 * them into `strengthSets` would put 40%-of-working loads into the recommendation
 * engine's view of what the athlete lifted, and `exerciseHistory` reads the first
 * completed set as the working weight. They are shown, not recorded.
 *
 * Renders nothing when a ramp would not help — a body-weight movement, or a
 * working weight light enough that lighter sets are pointless.
 */
export const WarmupRamp: FC<WarmupRampProps> = ({ exercise, workingLoad }) => {
  const sets = warmupRampFor(exercise, workingLoad)
  if (sets.length === 0) return null

  return (
    <div className="warmup-ramp">
      <p className="warmup-ramp__label">
        Warm-up to {formatLoad(workingLoad)}
        <span className="warmup-ramp__note">build-up only, not logged</span>
      </p>
      <ul className="warmup-ramp__list">
        {sets.map((set) => (
          <li key={set.index} className="warmup-ramp__set">
            <span className="warmup-ramp__load">{formatLoad(set.load)}</span>
            <span className="warmup-ramp__reps">× {set.reps}</span>
            <span className="warmup-ramp__percent">{set.percentOfWorking}%</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
