import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Chip } from '@/components'
import { archiveExercise, duplicateExercise, restoreExercise, updateExercise } from '@/data/repositories'
import type { Exercise } from '@/data/types'
import { CATEGORY_LABEL, LOAD_STYLE_LABEL, MEASUREMENT_TYPE_LABEL } from './constants'
import { ExerciseForm } from './ExerciseForm'
import { ExerciseHistoryList } from './ExerciseHistoryList'
import { exerciseToFormValues, toExerciseInput } from './formValues'
import type { ExerciseFormValues } from './formValues'
import { countScheduledPrescriptions } from './libraryData'

interface ExerciseDetailProps {
  exercise: Exercise
  /** Switches which exercise this sheet shows without closing/reopening it
   * -- used after Duplicate, so the athlete lands on the new copy. */
  onSelect: (id: string) => void
  onClose: () => void
}

function logAndIgnore(err: unknown): void {
  console.error('Library action failed', err)
}

/**
 * One exercise's full definition, its edit form (toggled in place), and its
 * logged history. Editing a seeded exercise is explicitly allowed -- the
 * athlete owns their library -- and is never blocked here; `isSeeded` stays
 * true (it records where the row came from, not whether it's still
 * "original"), while `updatedAt` naturally moves away from `createdAt` the
 * moment a save lands, which is what the "Edited" chip below reflects. That
 * reuses fields the schema already has rather than adding a new
 * `Exercise.isUserModified` column for this one indicator.
 *
 * Archiving is never blocked by an exercise still being prescribed by a
 * scheduled (not yet completed) workout: `db.exercises.get` is looked up
 * directly by id everywhere a workout renders its exercises (see
 * `useWorkout`), never filtered through `listExercises`' archived-exclusion,
 * so an archived exercise still resolves correctly for every instance that
 * already references it -- archiving only removes it from pickers for NEW
 * work (search, future template/workout creation). The count below is shown
 * so the athlete can make an informed call, not to gate the button.
 */
export const ExerciseDetail: FC<ExerciseDetailProps> = ({ exercise, onSelect, onClose }) => {
  const [isEditing, setIsEditing] = useState(false)
  // `useLiveQuery` (not a manual effect + state) so Dexie owns the
  // subscribe/unsubscribe lifecycle -- a plain `.then(setState)` promise has
  // no way to cancel itself if this sheet closes (or the exercise changes)
  // before it resolves.
  const scheduledCount = useLiveQuery(() => countScheduledPrescriptions(exercise.id), [exercise.id])

  useEffect(() => {
    setIsEditing(false)
  }, [exercise.id])

  async function handleSave(values: ExerciseFormValues): Promise<void> {
    await updateExercise(exercise.id, toExerciseInput(values), new Date().toISOString())
    setIsEditing(false)
  }

  async function handleDuplicate(): Promise<void> {
    const copy = await duplicateExercise(exercise.id, new Date().toISOString())
    onSelect(copy.id)
  }

  async function handleArchiveToggle(): Promise<void> {
    if (exercise.isArchived) {
      await restoreExercise(exercise.id, new Date().toISOString())
    } else {
      await archiveExercise(exercise.id, new Date().toISOString())
    }
  }

  if (isEditing) {
    return (
      <ExerciseForm
        initial={exerciseToFormValues(exercise)}
        submitLabel="Save changes"
        onSave={handleSave}
        onCancel={() => { setIsEditing(false) }}
      />
    )
  }

  // "Edited" only means anything for a seeded row -- it's the marker that
  // lets a future "restore the original library" flow know this one no
  // longer matches its shipped defaults. A user-created exercise is never
  // "the original" to begin with, so the same `updatedAt !== createdAt`
  // check would just add noise there (every archive/restore/duplicate also
  // bumps `updatedAt`).
  const wasEdited = exercise.isSeeded && exercise.updatedAt !== exercise.createdAt

  return (
    <div className="exercise-detail">
      <div className="exercise-detail__badges">
        {exercise.isSeeded && <Chip tone="neutral">Seeded</Chip>}
        {wasEdited && <Chip tone="accent">Edited</Chip>}
        {exercise.isArchived && <Chip tone="caution">Archived</Chip>}
      </div>

      <dl className="exercise-detail__fields">
        <dt>Category</dt><dd>{CATEGORY_LABEL[exercise.category]}</dd>
        <dt>Measurement</dt><dd>{MEASUREMENT_TYPE_LABEL[exercise.measurementType]}</dd>
        <dt>Load style</dt><dd>{LOAD_STYLE_LABEL[exercise.loadStyle]}</dd>
        <dt>Default unit</dt><dd>{exercise.defaultUnit}</dd>
        <dt>Default rest</dt><dd>{`${String(exercise.defaultRestSec)} sec`}</dd>
        <dt>Progression increment</dt><dd>{`${String(exercise.progressionIncrement)} ${exercise.incrementUnit}`}</dd>
        {exercise.defaultSets !== undefined && (<><dt>Sets</dt><dd>{exercise.defaultSets}</dd></>)}
        {exercise.repMin !== undefined && (<><dt>Rep range</dt><dd>{`${String(exercise.repMin)}-${String(exercise.repMax)}`}</dd></>)}
        {exercise.defaultDistanceM !== undefined && (<><dt>Default distance</dt><dd>{`${String(exercise.defaultDistanceM)} m`}</dd></>)}
        {exercise.defaultDurationSec !== undefined && (<><dt>Default duration</dt><dd>{`${String(exercise.defaultDurationSec)} sec`}</dd></>)}
      </dl>

      {exercise.techniqueNotes && <p className="exercise-detail__notes">{exercise.techniqueNotes}</p>}

      {scheduledCount !== undefined && scheduledCount > 0 && (
        <p className="library-field__note">
          {`Still prescribed in ${String(scheduledCount)} scheduled workout${scheduledCount === 1 ? '' : 's'}. Archiving keeps those intact -- it only hides this exercise from pickers for new work.`}
        </p>
      )}

      <div className="exercise-detail__actions">
        <Button variant="secondary" onClick={() => { setIsEditing(true) }}>Edit</Button>
        <Button variant="secondary" onClick={() => { handleDuplicate().catch(logAndIgnore) }}>Duplicate</Button>
        <Button variant={exercise.isArchived ? 'primary' : 'danger'} onClick={() => { handleArchiveToggle().catch(logAndIgnore) }}>
          {exercise.isArchived ? 'Restore' : 'Archive'}
        </Button>
      </div>

      <h3 className="exercise-detail__history-heading">History</h3>
      <ExerciseHistoryList exerciseId={exercise.id} />

      <Button variant="quiet" onClick={onClose}>Close</Button>
    </div>
  )
}
