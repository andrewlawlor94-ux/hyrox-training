import type { FC } from 'react'
import { useState } from 'react'
import { Button, Chip } from '@/components'
import { removeExerciseFromInstance, substituteExerciseInInstance, swapExerciseOrder } from '@/data/repositories'
import type { EditableExercise } from './planData'
import { ExercisePicker } from './ExercisePicker'
import { PrescriptionEditor } from './PrescriptionEditor'
import { SubstituteSearchSheet } from './SubstituteSearchSheet'

interface ExerciseListEditorProps {
  instanceId: string
  exercises: EditableExercise[]
}

/**
 * Exercises within one session: move-up/move-down (real buttons, keyboard
 * reachable, no drag), Edit (opens `PrescriptionEditor`), Substitute (swaps
 * the exercise, discarding any logged sets for the old one), Remove, and
 * "Add exercise" (opens `ExercisePicker`). All writes are guarded against a
 * frozen instance by the underlying repository functions.
 */
export const ExerciseListEditor: FC<ExerciseListEditorProps> = ({ instanceId, exercises }) => {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [substitutingId, setSubstitutingId] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const editing = exercises.find((e) => e.instancePrescription.id === editingId) ?? null

  async function move(index: number, direction: -1 | 1): Promise<void> {
    const other = exercises[index + direction]
    const current = exercises[index]
    if (!other || !current) return
    setError(null)
    try {
      await swapExerciseOrder(current.instancePrescription.id, other.instancePrescription.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reorder these exercises.')
    }
  }

  async function handleRemove(instancePrescriptionId: string): Promise<void> {
    setError(null)
    try {
      await removeExerciseFromInstance(instancePrescriptionId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove this exercise.')
    }
  }

  async function handleSubstitute(instancePrescriptionId: string, newExerciseId: string): Promise<void> {
    setError(null)
    try {
      await substituteExerciseInInstance({ instancePrescriptionId, newExerciseId })
      setSubstitutingId(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not substitute this exercise.')
    }
  }

  return (
    <div className="exercise-list-editor">
      <h3>Exercises</h3>
      {error && <p role="alert" className="exercise-list-editor__error">{error}</p>}
      {exercises.length === 0 && <p>No exercises yet.</p>}
      <ul className="exercise-list-editor__list">
        {exercises.map((entry, index) => (
          <li key={entry.instancePrescription.id} className="exercise-list-editor__row">
            <div className="exercise-list-editor__row-info">
              <span className="exercise-list-editor__row-name">{entry.exercise.name}</span>
              <Chip tone="neutral">{entry.exercise.category}</Chip>
            </div>
            <div className="exercise-list-editor__row-actions">
              <button
                type="button" aria-label={`Move ${entry.exercise.name} up`}
                disabled={index === 0} onClick={() => { move(index, -1).catch(() => {}) }}
              >
                &uarr;
              </button>
              <button
                type="button" aria-label={`Move ${entry.exercise.name} down`}
                disabled={index === exercises.length - 1} onClick={() => { move(index, 1).catch(() => {}) }}
              >
                &darr;
              </button>
              <Button size="sm" variant="secondary" onClick={() => { setEditingId(entry.instancePrescription.id) }}>Edit</Button>
              <Button size="sm" variant="secondary" onClick={() => { setSubstitutingId(entry.instancePrescription.id) }}>Substitute</Button>
              <Button size="sm" variant="danger" onClick={() => { handleRemove(entry.instancePrescription.id).catch(() => {}) }}>Remove</Button>
            </div>
          </li>
        ))}
      </ul>

      <Button variant="secondary" onClick={() => { setIsAdding(true) }}>Add exercise</Button>

      <PrescriptionEditor
        open={editingId !== null}
        instanceId={instanceId}
        editable={editing}
        onClose={() => { setEditingId(null) }}
      />

      <SubstituteSearchSheet
        open={substitutingId !== null}
        onPick={(exerciseId) => { if (substitutingId) handleSubstitute(substitutingId, exerciseId).catch(() => {}) }}
        onClose={() => { setSubstitutingId(null) }}
      />

      <ExercisePicker open={isAdding} instanceId={instanceId} onClose={() => { setIsAdding(false) }} />
    </div>
  )
}
