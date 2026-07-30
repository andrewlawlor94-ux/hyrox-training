import type { FC } from 'react'
import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { NumberField } from '@/components'
import { db } from '@/data/db'
import { saveRunLog, saveStationLog, upsertSet } from '@/data/repositories'
import type { RunLog, StationLog, StrengthSet } from '@/data/types'
// Same debounced write queue the live-logging screen uses (cross-feature the
// way WorkoutFooter already imports @/features/symptoms/RedFlagScreen).
import { useAutosave } from '@/features/workout/useAutosave'

interface PastRecordEditorProps {
  instanceId: string
}

/** Only the one deliberate "correct a past record" path ever passes this. */
const ALLOW_HISTORY_EDIT = { allowHistoryEdit: true } as const

/**
 * §14's explicit "edit this past record" escape hatch: edits a COMPLETED
 * instance's already-logged rows directly via the repositories'
 * `{ allowHistoryEdit: true }` option -- the one deliberate path allowed to
 * write to frozen history, never the ordinary `applyPrescriptionEdit` write
 * path. Only reachable after the athlete has already seen and dismissed the
 * warning in `WorkoutEditor` (this component assumes that already happened;
 * it does not re-warn per field).
 *
 * Covers all three log kinds. Strength only was a real gap, not a scoping
 * choice: a mistyped run distance or sled load on a completed session was
 * uncorrectable, while the equivalent mistyped weight was one tap away.
 *
 * Writes are DEBOUNCED (and flushed on blur), never one per keystroke: this is
 * the only path in the app licensed to overwrite frozen history, and an
 * undebounced handler turned typing `100` into three successive writes to a
 * completed record -- the first two of them (`1`, then `10`) plainly wrong
 * values that a live query elsewhere could read and a crash mid-sequence could
 * leave behind. Keying the queue by row id keeps each row's edits independent.
 *
 * Run logs are the one place a field is NOT clearable: `RunLog` requires
 * `distanceKm` and `durationSec` as numbers, so there is no valid partial row
 * to write. Clearing one leaves the stored value in place rather than writing a
 * zero (which this project has already been burned by treating as data) or
 * deleting the run outright, which is not what "correct a typo" means.
 */
export const PastRecordEditor: FC<PastRecordEditorProps> = ({ instanceId }) => {
  const sets = useLiveQuery(() => db.strengthSets.where('instanceId').equals(instanceId).sortBy('setIndex'), [instanceId])
  const runLogs = useLiveQuery(() => db.runLogs.where('instanceId').equals(instanceId).toArray(), [instanceId])
  const stationLogs = useLiveQuery(() => db.stationLogs.where('instanceId').equals(instanceId).toArray(), [instanceId])
  const [error, setError] = useState<string | null>(null)
  const autosave = useAutosave()

  // Holds the not-yet-written field edits per row id, so two fields corrected
  // inside one debounce window both survive -- the queue keeps only the most
  // recent closure per key, so each closure must carry the full merged row
  // rather than its own single field.
  const pendingSets = useRef(new Map<string, StrengthSet>())
  const pendingRuns = useRef(new Map<string, RunLog>())
  const pendingStations = useRef(new Map<string, StationLog>())

  function reportFailure(err: unknown): void {
    setError(err instanceof Error ? err.message : 'Could not save this correction.')
  }

  function handleSetChange(set: StrengthSet, field: 'weight' | 'reps' | 'rir', value: number | null): void {
    setError(null)
    const next: StrengthSet = { ...(pendingSets.current.get(set.id) ?? set) }
    if (value === null) delete next[field]
    else next[field] = value
    pendingSets.current.set(set.id, next)

    autosave.schedule(set.id, async () => {
      try {
        await upsertSet(next, ALLOW_HISTORY_EDIT)
        pendingSets.current.delete(set.id)
      } catch (err) {
        reportFailure(err)
      }
    })
  }

  function handleRunChange(log: RunLog, field: 'distanceKm' | 'durationSec', value: number | null): void {
    // A required field cannot be blanked (see the doc comment) — ignore rather
    // than write a zero or delete the athlete's run.
    if (value === null) return
    setError(null)
    const next: RunLog = { ...(pendingRuns.current.get(log.id) ?? log), [field]: value }
    // `paceSecPerKm` is derived from the other two, so a stored value would now
    // disagree with them. Drop it and let every reader re-derive.
    delete next.paceSecPerKm
    pendingRuns.current.set(log.id, next)

    autosave.schedule(log.id, async () => {
      try {
        // Splits are untouched by a distance/duration correction, so pass none
        // rather than rewriting rows this editor never showed.
        await saveRunLog(next, [], ALLOW_HISTORY_EDIT)
        pendingRuns.current.delete(log.id)
      } catch (err) {
        reportFailure(err)
      }
    })
  }

  function handleStationChange(log: StationLog, field: 'distanceM' | 'reps' | 'load', value: number | null): void {
    setError(null)
    const next: StationLog = { ...(pendingStations.current.get(log.id) ?? log) }
    // Every StationLog measurement is optional, so clearing one is meaningful
    // here in a way it is not for a run: it records "this was not measured".
    if (value === null) delete next[field]
    else next[field] = value
    pendingStations.current.set(log.id, next)

    autosave.schedule(log.id, async () => {
      try {
        await saveStationLog(next, ALLOW_HISTORY_EDIT)
        pendingStations.current.delete(log.id)
      } catch (err) {
        reportFailure(err)
      }
    })
  }

  function handleBlur(rowId: string): void {
    void autosave.flushKey(rowId)
  }

  if (sets === undefined || runLogs === undefined || stationLogs === undefined) return <p>Loading…</p>
  if (sets.length === 0 && runLogs.length === 0 && stationLogs.length === 0) {
    return <p>No logged sets, runs, or stations to correct on this record.</p>
  }

  return (
    <div className="past-record-editor">
      {sets.map((set, index) => (
        <div key={set.id} className="past-record-editor__row">
          <span className="past-record-editor__set-index">Set {index + 1}</span>
          <NumberField
            id={`past-weight-${set.id}`} label="Weight" value={set.weight ?? null}
            onChange={(v) => { handleSetChange(set, 'weight', v) }} onBlur={() => { handleBlur(set.id) }} inputMode="decimal"
          />
          <NumberField
            id={`past-reps-${set.id}`} label="Reps" value={set.reps ?? null}
            onChange={(v) => { handleSetChange(set, 'reps', v) }} onBlur={() => { handleBlur(set.id) }} inputMode="numeric"
          />
          <NumberField
            id={`past-rir-${set.id}`} label="RIR" value={set.rir ?? null}
            onChange={(v) => { handleSetChange(set, 'rir', v) }} onBlur={() => { handleBlur(set.id) }} inputMode="numeric"
          />
        </div>
      ))}

      {runLogs.map((log) => (
        <div key={log.id} className="past-record-editor__row">
          <span className="past-record-editor__set-index">{log.runType} run</span>
          <NumberField
            id={`past-run-distance-${log.id}`} label="Distance" value={log.distanceKm} unit="km"
            onChange={(v) => { handleRunChange(log, 'distanceKm', v) }} onBlur={() => { handleBlur(log.id) }} inputMode="decimal"
          />
          <NumberField
            id={`past-run-duration-${log.id}`} label="Duration" value={log.durationSec} unit="s"
            onChange={(v) => { handleRunChange(log, 'durationSec', v) }} onBlur={() => { handleBlur(log.id) }} inputMode="numeric"
          />
        </div>
      ))}

      {stationLogs.map((log) => (
        <div key={log.id} className="past-record-editor__row">
          <span className="past-record-editor__set-index">{log.station}</span>
          <NumberField
            id={`past-station-distance-${log.id}`} label="Distance" value={log.distanceM ?? null} unit="m"
            onChange={(v) => { handleStationChange(log, 'distanceM', v) }} onBlur={() => { handleBlur(log.id) }} inputMode="decimal"
          />
          <NumberField
            id={`past-station-reps-${log.id}`} label="Reps" value={log.reps ?? null}
            onChange={(v) => { handleStationChange(log, 'reps', v) }} onBlur={() => { handleBlur(log.id) }} inputMode="numeric"
          />
          {/* `unit` spread conditionally rather than passed as `undefined`:
              exactOptionalPropertyTypes distinguishes "absent" from
              "explicitly undefined", and a station log may carry no loadUnit. */}
          <NumberField
            id={`past-station-load-${log.id}`} label="Load" value={log.load ?? null}
            {...(log.loadUnit !== undefined ? { unit: log.loadUnit } : {})}
            onChange={(v) => { handleStationChange(log, 'load', v) }} onBlur={() => { handleBlur(log.id) }} inputMode="decimal"
          />
        </div>
      ))}

      {error && <p role="alert" className="past-record-editor__error">{error}</p>}
    </div>
  )
}
