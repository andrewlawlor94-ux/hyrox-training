import type { FC } from 'react'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { NumberField } from '@/components'
import { db } from '@/data/db'
import { upsertSet } from '@/data/repositories'
import type { StrengthSet } from '@/data/types'

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
 */
export const PastRecordEditor: FC<PastRecordEditorProps> = ({ instanceId }) => {
  const sets = useLiveQuery(() => db.strengthSets.where('instanceId').equals(instanceId).sortBy('setIndex'), [instanceId])
  const [error, setError] = useState<string | null>(null)

  async function handleChange(set: StrengthSet, field: 'weight' | 'reps' | 'rir', value: number | null): Promise<void> {
    setError(null)
    try {
      const next: StrengthSet = { ...set }
      if (value === null) delete next[field]
      else next[field] = value
      await upsertSet(next, { allowHistoryEdit: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this correction.')
    }
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
            onChange={(v) => { handleChange(set, 'weight', v).catch(() => {}) }} inputMode="decimal"
          />
          <NumberField
            id={`past-reps-${set.id}`} label="Reps" value={set.reps ?? null}
            onChange={(v) => { handleChange(set, 'reps', v).catch(() => {}) }} inputMode="numeric"
          />
          <NumberField
            id={`past-rir-${set.id}`} label="RIR" value={set.rir ?? null}
            onChange={(v) => { handleChange(set, 'rir', v).catch(() => {}) }} inputMode="numeric"
          />
        </div>
      ))}
      {error && <p role="alert" className="past-record-editor__error">{error}</p>}
    </div>
  )
}
