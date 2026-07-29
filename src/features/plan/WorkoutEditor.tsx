import type { FC } from 'react'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Chip, Sheet } from '@/components'
import { deleteWorkout, duplicateWorkout, syncQueue, updateWorkoutMetadata } from '@/data/repositories'
import type { Priority } from '@/data/types'
import { ExerciseListEditor } from './ExerciseListEditor'
import { MoveWorkoutControl } from './MoveWorkoutControl'
import { PastRecordEditor } from './PastRecordEditor'
import { PRIORITY_OPTIONS } from './planConstants'
import { loadWorkoutEditorData } from './planData'

interface WorkoutEditorProps {
  instanceId: string | null
  today: string
  onClose: () => void
}

/**
 * The full editor for one session, reached from `WeekDetail`'s "Edit"
 * button. A frozen (completed/partially-completed) instance shows a warning
 * and an explicit "Edit this past record" affordance instead of the normal
 * form (§14) — tapping it requires a second confirmation before revealing
 * `PastRecordEditor`, which is the only place allowed to write to frozen
 * history (via `upsertSet`'s `allowHistoryEdit` escape hatch). A workout in
 * the past that is NOT completed (not frozen) still gets the normal editor —
 * this component gates on `frozen`, never on date.
 */
export const WorkoutEditor: FC<WorkoutEditorProps> = ({ instanceId, today, onClose }) => {
  const data = useLiveQuery(() => (instanceId ? loadWorkoutEditorData(instanceId) : undefined), [instanceId])
  const [confirmingPastEdit, setConfirmingPastEdit] = useState(false)
  const [pastEditUnlocked, setPastEditUnlocked] = useState(false)
  const [name, setName] = useState('')
  const [priority, setPriority] = useState<Priority>('important')
  const [notes, setNotes] = useState('')
  const [syncedId, setSyncedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  if (data && data.instance.id !== syncedId) {
    setSyncedId(data.instance.id)
    setName(data.templateName)
    setPriority(data.instance.priority)
    setNotes(data.templateNotes)
    setConfirmingPastEdit(false)
    setPastEditUnlocked(false)
    setConfirmingDelete(false)
  }

  async function handleSaveMetadata(): Promise<void> {
    if (!instanceId) return
    setError(null)
    try {
      await updateWorkoutMetadata({ instanceId, name, priority, notes })
      await syncQueue(today)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save these changes.')
    }
  }

  async function handlePriorityChange(next: Priority): Promise<void> {
    if (!instanceId) return
    setPriority(next)
    setError(null)
    try {
      await updateWorkoutMetadata({ instanceId, priority: next })
      await syncQueue(today)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this change.')
    }
  }

  async function handleDuplicate(): Promise<void> {
    if (!instanceId) return
    setError(null)
    try {
      await duplicateWorkout(instanceId)
      await syncQueue(today)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not duplicate this workout.')
    }
  }

  async function handleDelete(): Promise<void> {
    if (!instanceId) return
    setError(null)
    try {
      await deleteWorkout(instanceId)
      await syncQueue(today)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete this workout.')
      setConfirmingDelete(false)
    }
  }

  if (!instanceId) return null

  return (
    <Sheet open={instanceId !== null} onClose={onClose} title={data?.templateName ?? 'Session'}>
      {data === undefined && <p>Loading…</p>}
      {data && data.instance.frozen && !pastEditUnlocked && (
        <div className="workout-editor__frozen">
          <Chip tone="green">Completed</Chip>
          <p role="alert">This session is completed history and can&apos;t be edited through the normal path.</p>
          {!confirmingPastEdit && (
            <Button variant="danger" onClick={() => { setConfirmingPastEdit(true) }}>Edit this past record</Button>
          )}
          {confirmingPastEdit && (
            <div className="workout-editor__past-confirm">
              <p role="alert">
                Editing a completed record changes what actually happened. This should only be used to correct a
                logging mistake. Are you sure?
              </p>
              <Button variant="secondary" onClick={() => { setConfirmingPastEdit(false) }}>Cancel</Button>
              <Button variant="danger" onClick={() => { setPastEditUnlocked(true) }}>Yes, edit this record</Button>
            </div>
          )}
        </div>
      )}

      {data && data.instance.frozen && pastEditUnlocked && <PastRecordEditor instanceId={data.instance.id} />}

      {data && !data.instance.frozen && (
        <div className="workout-editor">
          <div className="workout-editor__field">
            <label htmlFor="we-name">Name</label>
            <input id="we-name" type="text" value={name} onChange={(e) => { setName(e.target.value) }} onBlur={() => { handleSaveMetadata().catch(() => {}) }} />
          </div>
          <div className="workout-editor__field">
            <label htmlFor="we-priority">Priority</label>
            <select
              id="we-priority" value={priority}
              onChange={(e) => { handlePriorityChange(e.target.value as Priority).catch(() => {}) }}
            >
              {PRIORITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="workout-editor__field">
            <label htmlFor="we-notes">Notes</label>
            <textarea id="we-notes" value={notes} onChange={(e) => { setNotes(e.target.value) }} onBlur={() => { handleSaveMetadata().catch(() => {}) }} />
          </div>

          {error && <p role="alert" className="workout-editor__error">{error}</p>}

          <MoveWorkoutControl instanceId={data.instance.id} today={today} />

          <div className="workout-editor__row-actions">
            <Button variant="secondary" onClick={() => { handleDuplicate().catch(() => {}) }}>Duplicate</Button>
            {!confirmingDelete && (
              <Button variant="danger" onClick={() => { setConfirmingDelete(true) }}>Delete</Button>
            )}
          </div>
          {confirmingDelete && (
            <div className="workout-editor__delete-confirm">
              <p role="alert">Delete this workout? This cannot be undone.</p>
              <Button variant="secondary" onClick={() => { setConfirmingDelete(false) }}>Cancel</Button>
              <Button variant="danger" onClick={() => { handleDelete().catch(() => {}) }}>Yes, delete it</Button>
            </div>
          )}

          <ExerciseListEditor instanceId={data.instance.id} exercises={data.exercises} />
        </div>
      )}
    </Sheet>
  )
}
