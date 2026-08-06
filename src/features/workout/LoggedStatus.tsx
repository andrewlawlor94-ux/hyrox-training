import type { FC } from 'react'
import { Chip } from '@/components'
import { exerciseLogState } from './loggedState'
import type { WorkoutExerciseVM } from './useWorkout'

/**
 * Says, per movement, whether it is on the record yet — and if not, names the
 * one box that would put it there.
 *
 * The athlete's rule, and their request that it be made explicit: "every
 * exercise should have its own main box that is looked at for if I completed or
 * not". Before this, the rule existed but differed silently per block — a sled
 * push counted as done once an RPE was typed, a strength set counted the moment
 * Complete was tapped whether or not it had reps, and a run needed two fields.
 * Nothing on screen said which.
 *
 * Deliberately not a warning tone when empty: a blank movement is a movement not
 * done yet, which for most of a session is simply the truth, and colouring it as
 * a failure would nag through every set.
 */
export const LoggedStatus: FC<{ item: WorkoutExerciseVM }> = ({ item }) => {
  const { done, spec } = exerciseLogState(item)

  if (done) return <Chip tone="green">Logged</Chip>

  return (
    <div className="logged-status">
      <Chip tone="neutral">Not logged</Chip>
      {/* "Needs reps." rather than "Reps is what records this one." — the label
          is a plural noun for one measure and a singular for another, and the
          sentence has to read correctly for both. */}
      <p className="logged-status__hint">{`Needs ${spec.label.toLowerCase()}. ${spec.why}`}</p>
    </div>
  )
}
