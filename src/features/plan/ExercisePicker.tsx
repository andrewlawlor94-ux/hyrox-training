import type { ChangeEvent, FC } from 'react'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, SegmentedControl, Sheet } from '@/components'
import { addExerciseToInstance, addExerciseToTemplate, listExercises } from '@/data/repositories'

type AddScope = 'currentOnly' | 'currentAndFuture'

const SCOPE_OPTIONS: { value: AddScope; label: string }[] = [
  { value: 'currentOnly', label: 'Just this workout' },
  { value: 'currentAndFuture', label: 'This and future occurrences' },
]

interface ExercisePickerProps {
  open: boolean
  instanceId: string
  onClose: () => void
}

/**
 * Search-and-select an exercise to add to a session (§13's two deferred
 * items): "Just this workout" calls `addExerciseToInstance` (instance-level
 * only, no template touched); "This and future occurrences" calls
 * `addExerciseToTemplate` (adds to this session's own template AND
 * propagates to matching future non-frozen sessions -- see that function's
 * doc comment for the exact matching rule).
 */
export const ExercisePicker: FC<ExercisePickerProps> = ({ open, instanceId, onClose }) => {
  const [search, setSearch] = useState('')
  const [scope, setScope] = useState<AddScope>('currentOnly')
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const exercises = useLiveQuery(
    () => listExercises({ ...(search.trim() ? { search: search.trim() } : {}) }),
    [search],
  )

  async function handlePick(exerciseId: string): Promise<void> {
    setIsBusy(true)
    setError(null)
    try {
      if (scope === 'currentOnly') await addExerciseToInstance({ instanceId, exerciseId })
      else await addExerciseToTemplate({ instanceId, exerciseId })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add this exercise.')
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add exercise">
      <div className="exercise-picker">
        <SegmentedControl label="Apply to" options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
        <label htmlFor="exercise-picker-search">Search</label>
        <input
          id="exercise-picker-search" type="text" value={search}
          onChange={(event: ChangeEvent<HTMLInputElement>) => { setSearch(event.target.value) }}
        />
        {error && <p role="alert" className="exercise-picker__error">{error}</p>}
        <ul className="exercise-picker__list">
          {(exercises ?? []).map((exercise) => (
            <li key={exercise.id}>
              <Button variant="secondary" disabled={isBusy} onClick={() => { handlePick(exercise.id).catch(() => {}) }}>
                {exercise.name}
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  )
}
