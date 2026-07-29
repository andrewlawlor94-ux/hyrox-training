import type { ChangeEvent, FC } from 'react'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Sheet } from '@/components'
import { listExercises } from '@/data/repositories'

interface SubstituteSearchSheetProps {
  open: boolean
  onPick: (exerciseId: string) => void
  onClose: () => void
}

/** A minimal exercise search used only to pick a REPLACEMENT exercise for
 * `ExerciseListEditor`'s "Substitute" action -- deliberately separate from
 * `ExercisePicker` (which adds a new prescription and offers a scope
 * choice); substituting always replaces in place, instance-scope only, with
 * no scope choice to make. */
export const SubstituteSearchSheet: FC<SubstituteSearchSheetProps> = ({ open, onPick, onClose }) => {
  const [search, setSearch] = useState('')
  const exercises = useLiveQuery(
    () => listExercises({ ...(search.trim() ? { search: search.trim() } : {}) }),
    [search],
  )

  return (
    <Sheet open={open} onClose={onClose} title="Substitute exercise">
      <div className="substitute-search-sheet">
        <label htmlFor="substitute-search">Search</label>
        <input
          id="substitute-search" type="text" value={search}
          onChange={(event: ChangeEvent<HTMLInputElement>) => { setSearch(event.target.value) }}
        />
        <ul className="substitute-search-sheet__list">
          {(exercises ?? []).map((exercise) => (
            <li key={exercise.id}>
              <Button variant="secondary" onClick={() => { onPick(exercise.id) }}>{exercise.name}</Button>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  )
}
