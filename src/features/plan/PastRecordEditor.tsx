import type { FC } from 'react'
import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { DurationField, NumberField } from '@/components'
import { db } from '@/data/db'
import { saveRunLog, saveStationLog, upsertSet } from '@/data/repositories'
import type {
  Exercise, InstancePrescription, IntervalSplit, RunLog, StationLog, StrengthSet,
} from '@/data/types'
// Same debounced write queue the live-logging screen uses (cross-feature the
// way WorkoutFooter already imports @/features/symptoms/RedFlagScreen).
import { useAutosave } from '@/features/workout/useAutosave'
import { PastIntervalRun } from './PastIntervalRun'
import { PastPlainRun } from './PastPlainRun'
import { PastStation } from './PastStation'

interface PastRecordEditorProps {
  instanceId: string
}

/** Only the one deliberate "correct a past record" path ever passes this. */
const ALLOW_HISTORY_EDIT = { allowHistoryEdit: true } as const

type EntryKind = 'strength' | 'intervalRun' | 'plainRun' | 'station'

interface RecordEntry {
  prescription: InstancePrescription
  exercise: Exercise
  kind: EntryKind
  sets: StrengthSet[]
  runLog: RunLog | undefined
  splits: IntervalSplit[]
  stationLog: StationLog | undefined
}

/** Same classification the live logging screen uses (`useWorkout`): strength
 * sets, then runs by category, then everything else as a station. Interval runs
 * are split out because their measurements are per-rep. */
function entryKind(exercise: Exercise, prescription: InstancePrescription): EntryKind {
  if (exercise.measurementType === 'strengthSets') return 'strength'
  if (exercise.category !== 'run') return 'station'
  return prescription.intervalSpec !== undefined ? 'intervalRun' : 'plainRun'
}

/**
 * §14's explicit "edit this past record" escape hatch: edits a COMPLETED
 * instance's already-logged rows directly via the repositories'
 * `{ allowHistoryEdit: true }` option -- the one deliberate path allowed to
 * write to frozen history, never the ordinary `applyPrescriptionEdit` write
 * path. Only reachable after the athlete has already seen and dismissed the
 * warning in `WorkoutEditor` (this component assumes that already happened;
 * it does not re-warn per field).
 *
 * Driven by what the session PRESCRIBED, not by what it happened to store. The
 * athlete was explicit about why: "i should be able to edit that record and input
 * data even if it wasnt captured the first time." Listing stored rows meant a
 * session that recorded nothing offered nothing to fix — the least useful moment
 * to refuse, since a session whose data went missing is exactly the one needing
 * re-entry. Every prescribed exercise now shows its fields whether or not a row
 * exists, and the first real value creates one.
 *
 * Writes are DEBOUNCED (and flushed on blur), never one per keystroke: this is
 * the only path in the app licensed to overwrite frozen history, and an
 * undebounced handler turned typing `100` into three successive writes to a
 * completed record -- the first two of them (`1`, then `10`) plainly wrong
 * values that a live query elsewhere could read and a crash mid-sequence could
 * leave behind. Keying the queue by row id keeps each row's edits independent.
 */
export const PastRecordEditor: FC<PastRecordEditorProps> = ({ instanceId }) => {
  const entries = useLiveQuery(async (): Promise<RecordEntry[]> => {
    const prescriptions = await db.instancePrescriptions.where('instanceId').equals(instanceId).sortBy('order')
    const [runs, stations, allSets] = await Promise.all([
      db.runLogs.where('instanceId').equals(instanceId).toArray(),
      db.stationLogs.where('instanceId').equals(instanceId).toArray(),
      db.strengthSets.where('instanceId').equals(instanceId).sortBy('setIndex'),
    ])
    const out: RecordEntry[] = []
    for (const prescription of prescriptions) {
      const exercise = await db.exercises.get(prescription.exerciseId)
      if (!exercise) continue
      const runLog = runs.find((r) => r.instancePrescriptionId === prescription.id)
      out.push({
        prescription,
        exercise,
        kind: entryKind(exercise, prescription),
        sets: allSets.filter((s) => s.instancePrescriptionId === prescription.id),
        runLog,
        splits: runLog ? await db.intervalSplits.where('runLogId').equals(runLog.id).sortBy('index') : [],
        stationLog: stations.find((s) => s.instancePrescriptionId === prescription.id),
      })
    }
    return out
  }, [instanceId])

  /**
   * Logs belonging to no prescription — older rows, or anything imported from a
   * backup that predates the link. They cannot be grouped under an exercise, so
   * they keep the flat row-per-log treatment rather than disappearing from the
   * editor entirely.
   */
  const orphans = useLiveQuery(async () => {
    const prescriptionIds = new Set((await db.instancePrescriptions.where('instanceId').equals(instanceId).toArray()).map((p) => p.id))
    const belongs = (id: string | undefined): boolean => id !== undefined && prescriptionIds.has(id)
    const [runs, stations] = await Promise.all([
      db.runLogs.where('instanceId').equals(instanceId).toArray(),
      db.stationLogs.where('instanceId').equals(instanceId).toArray(),
    ])
    return {
      runs: runs.filter((r) => !belongs(r.instancePrescriptionId)),
      stations: stations.filter((s) => !belongs(s.instancePrescriptionId)),
    }
  }, [instanceId])

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
    // A required field cannot be blanked — ignore rather than write a zero or
    // delete the athlete's run.
    if (value === null) return
    setError(null)
    const next: RunLog = { ...(pendingRuns.current.get(log.id) ?? log), [field]: value }
    // `paceSecPerKm` is derived from the other two, so a stored value would now
    // disagree with them. Drop it and let every reader re-derive.
    delete next.paceSecPerKm
    pendingRuns.current.set(log.id, next)

    autosave.schedule(log.id, async () => {
      try {
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

  if (entries === undefined || orphans === undefined) return <p>Loading…</p>
  if (entries.length === 0 && orphans.runs.length === 0 && orphans.stations.length === 0) {
    return <p>This session prescribed nothing, so there is no record to correct.</p>
  }

  return (
    <div className="past-record-editor">
      {entries.map((entry) => {
        if (entry.kind === 'intervalRun') {
          return (
            <PastIntervalRun
              key={entry.prescription.id}
              prescription={entry.prescription}
              exerciseName={entry.exercise.name}
              log={entry.runLog}
              splits={entry.splits}
              onError={reportFailure}
            />
          )
        }
        if (entry.kind === 'plainRun') {
          return (
            <PastPlainRun
              key={entry.prescription.id}
              prescription={entry.prescription}
              exerciseName={entry.exercise.name}
              log={entry.runLog}
              onError={reportFailure}
            />
          )
        }
        if (entry.kind === 'station') {
          return (
            <PastStation
              key={entry.prescription.id}
              prescription={entry.prescription}
              exercise={entry.exercise}
              log={entry.stationLog}
              onError={reportFailure}
            />
          )
        }
        return (
          <section key={entry.prescription.id} className="past-record-editor__exercise">
            <h4 className="past-record-editor__exercise-name">{entry.exercise.name}</h4>
            {entry.sets.length === 0 && (
              // Set rows are materialised when the session is opened, so this is
              // rare rather than impossible — say so instead of showing an
              // exercise with no fields at all and no explanation.
              <p className="past-record-editor__hint">No sets were recorded for this exercise.</p>
            )}
            {entry.sets.map((set, index) => (
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
          </section>
        )
      })}

      {orphans.runs.map((log) => (
        <div key={log.id} className="past-record-editor__row">
          <span className="past-record-editor__set-index">{log.runType} run</span>
          <NumberField
            id={`past-run-distance-${log.id}`} label="Distance" value={log.distanceKm} unit="km"
            onChange={(v) => { handleRunChange(log, 'distanceKm', v) }} onBlur={() => { handleBlur(log.id) }} inputMode="decimal"
          />
          <DurationField
            id={`past-run-duration-${log.id}`} label="Duration" valueSec={log.durationSec}
            onCommit={(v) => { handleRunChange(log, 'durationSec', v); handleBlur(log.id) }}
          />
        </div>
      ))}

      {orphans.stations.map((log) => (
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
