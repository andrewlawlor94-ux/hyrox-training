import type { FC } from 'react'
import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { NumberField } from '@/components'
import { db } from '@/data/db'
import { upsertSet } from '@/data/repositories'
import type { StrengthSet } from '@/data/types'
// Same debounced write queue the live-logging screen uses (cross-feature the
// way WorkoutFooter already imports @/features/symptoms/RedFlagScreen).
import { useAutosave } from '@/features/workout/useAutosave'

interface PastRecordEditorProps {
  instanceId: string
}

/**
 * §14's explicit "edit this past record" escape hatch: edits a COMPLETED
 * instance's already-logged `StrengthSet` rows directly via `upsertSet`'s
 * `{ allowHistoryEdit: true }` option -- the one deliberate path allowed to
 * write to frozen history, never the ordinary `applyPrescriptionEdit` write
 * path. Only reachable after the athlete has already seen and dismissed the
 * warning in `WorkoutEditor` (this component assumes that already happened;
 * it does not re-warn per field). Only strength sets are editable here today
 * -- run/station log correction is not yet built (see the Task 27 report).
 *
 * Writes are DEBOUNCED (and flushed on blur), never one per keystroke: this is
 * the only path in the app licensed to overwrite frozen history, and an
 * undebounced handler turned typing `100` into three successive writes to a
 * completed record -- the first two of them (`1`, then `10`) plainly wrong
 * values that a live query elsewhere could read and a crash mid-sequence could
 * leave behind. Keying the queue by set id keeps each row's edits independent.
 */
export const PastRecordEditor: FC<PastRecordEditorProps> = ({ instanceId }) => {
  const sets = useLiveQuery(() => db.strengthSets.where('instanceId').equals(instanceId).sortBy('setIndex'), [instanceId])
  const [error, setError] = useState<string | null>(null)
  const autosave = useAutosave()

  // Holds the not-yet-written field edits per set id, so two fields corrected
  // inside one debounce window both survive -- the queue keeps only the most
  // recent closure per key, so each closure must carry the full merged row
  // rather than its own single field.
  const pending = useRef(new Map<string, StrengthSet>())

  function handleChange(set: StrengthSet, field: 'weight' | 'reps' | 'rir', value: number | null): void {
    setError(null)
    const next: StrengthSet = { ...(pending.current.get(set.id) ?? set) }
    if (value === null) delete next[field]
    else next[field] = value
    pending.current.set(set.id, next)

    autosave.schedule(set.id, async () => {
      try {
        await upsertSet(next, { allowHistoryEdit: true })
        pending.current.delete(set.id)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not save this correction.')
      }
    })
  }

  function handleBlur(setId: string): void {
    void autosave.flushKey(setId)
  }

  if (sets === undefined) return <p>Loading…</p>
  if (sets.length === 0) return <p>No logged sets to correct on this record.</p>

  return (
    <div className="past-record-editor">
      {sets.map((set, index) => (
        <div key={set.id} className="past-record-editor__row">
          <span className="past-record-editor__set-index">Set {index + 1}</span>
          <NumberField
            id={`past-weight-${set.id}`} label="Weight" value={set.weight ?? null}
            onChange={(v) => { handleChange(set, 'weight', v) }} onBlur={() => { handleBlur(set.id) }} inputMode="decimal"
          />
          <NumberField
            id={`past-reps-${set.id}`} label="Reps" value={set.reps ?? null}
            onChange={(v) => { handleChange(set, 'reps', v) }} onBlur={() => { handleBlur(set.id) }} inputMode="numeric"
          />
          <NumberField
            id={`past-rir-${set.id}`} label="RIR" value={set.rir ?? null}
            onChange={(v) => { handleChange(set, 'rir', v) }} onBlur={() => { handleBlur(set.id) }} inputMode="numeric"
          />
        </div>
      ))}
      {error && <p role="alert" className="past-record-editor__error">{error}</p>}
    </div>
  )
}
