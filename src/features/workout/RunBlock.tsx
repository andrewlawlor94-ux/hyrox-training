import type { ChangeEvent, FC } from 'react'
import { useState } from 'react'
import type { IntervalSplit, RunLog, RunType, Surface } from '@/data/types'
import { Card, NumberField, SegmentedControl } from '@/components'
import { saveRunLog } from '@/data/repositories'
import { paceSecPerKm } from '@/domain/pace/pace'
import { splitPaceSecPerKm } from '@/domain/pace/intervals'
import { formatPace } from '@/domain/units/format'
import { DEFAULT_RUN_TYPE_BY_EXERCISE_ID, RUN_TYPE_OPTIONS, SURFACE_OPTIONS } from './constants'
import { IntervalSplitsEditor } from './IntervalSplitsEditor'
import type { DraftSplit } from './IntervalSplitsEditor'
import { useAutosave } from './useAutosave'
import type { RunExerciseVM } from './useWorkout'

const DEFAULT_SURFACE: Surface = 'road'
const M_PER_KM = 1000

function defaultRunType(item: RunExerciseVM): RunType {
  if (item.prescription.intervalSpec) return 'intervals'
  return DEFAULT_RUN_TYPE_BY_EXERCISE_ID[item.exercise.id] ?? 'easy'
}

function toIntervalSplits(runLogId: string, drafts: DraftSplit[]): IntervalSplit[] {
  return drafts.map((d) => ({
    id: `${runLogId}_sp${String(d.index)}`,
    runLogId,
    index: d.index,
    kind: d.kind,
    ...(d.distanceM !== undefined ? { distanceM: d.distanceM } : {}),
    ...(d.durationSec !== undefined ? { durationSec: d.durationSec } : {}),
    ...(splitPaceSecPerKm(d) !== null ? { paceSecPerKm: splitPaceSecPerKm(d) as number } : {}),
  }))
}

/**
 * Run logging block (§10/§11). Distance and duration alone are enough to
 * save — pace is derived and displayed live (via `paceSecPerKm`/`formatPace`,
 * never NaN/Infinity for half-entered input), and the splits editor stays
 * collapsed unless the prescription is itself an interval template. A
 * `paceSource: 'goalRacePace'` prescription shows the goal-derived target
 * pace resolved by `useWorkout` — re-derived from the active goal, so
 * changing the goal in Settings changes what renders here on the next read.
 */
export const RunBlock: FC<{ item: RunExerciseVM }> = ({ item }) => {
  const { prescription, exercise, log, splits, goalTargetPaceSecPerKm } = item
  const [distanceKm, setDistanceKm] = useState<number | null>(log?.distanceKm ?? (prescription.distanceM ? prescription.distanceM / M_PER_KM : null))
  const [durationSec, setDurationSec] = useState<number | null>(log?.durationSec ?? prescription.durationSec ?? null)
  const [surface, setSurface] = useState<Surface>(log?.surface ?? DEFAULT_SURFACE)
  const [runType, setRunType] = useState<RunType>(log?.runType ?? defaultRunType(item))
  const [notes, setNotes] = useState(log?.notes ?? '')
  const [draftSplits, setDraftSplits] = useState<DraftSplit[]>([])
  const autosave = useAutosave()

  const livePace = paceSecPerKm(distanceKm ?? 0, durationSec ?? 0)
  const runLogId = log?.id ?? `rl_${prescription.id}`

  function scheduleSave(
    patch: { distanceKm?: number | null; durationSec?: number | null; surface?: Surface; runType?: RunType; notes?: string },
    splitsOverride?: DraftSplit[],
  ): void {
    const merged = {
      distanceKm: patch.distanceKm !== undefined ? patch.distanceKm : distanceKm,
      durationSec: patch.durationSec !== undefined ? patch.durationSec : durationSec,
      surface: patch.surface ?? surface,
      runType: patch.runType ?? runType,
      notes: patch.notes ?? notes,
    }
    if (merged.distanceKm === null || merged.durationSec === null) return
    // Captured here, synchronously, rather than read back off `draftSplits`
    // inside the scheduled closure below — a caller updating splits and
    // scheduling a save in the same handler (`handleSplitsChange`) would
    // otherwise see the PRE-update state, since `setDraftSplits` doesn't
    // apply until the next render.
    const splitsToSave = splitsOverride ?? draftSplits
    autosave.schedule(prescription.id, async () => {
      const pace = paceSecPerKm(merged.distanceKm as number, merged.durationSec as number)
      const runLog: RunLog = {
        id: runLogId, instanceId: prescription.instanceId, instancePrescriptionId: prescription.id,
        distanceKm: merged.distanceKm as number, durationSec: merged.durationSec as number,
        surface: merged.surface, runType: merged.runType, notes: merged.notes,
        loggedAt: log?.loggedAt ?? new Date().toISOString(),
        ...(pace !== null ? { paceSecPerKm: pace } : {}),
      }
      await saveRunLog(runLog, toIntervalSplits(runLogId, splitsToSave))
    })
  }

  function handleBlur(): void { void autosave.flushKey(prescription.id) }
  function handleSplitsChange(drafts: DraftSplit[]): void {
    setDraftSplits(drafts)
    if (distanceKm !== null && durationSec !== null) scheduleSave({}, drafts)
  }

  return (
    <Card as="article" className="exercise-card run-block">
      <h3 className="exercise-card__name">{exercise.name}</h3>
      <div className="run-block__pace-row">
        <p className="run-block__pace">{`Pace: ${formatPace(livePace)}`}</p>
        {goalTargetPaceSecPerKm !== null && <p className="run-block__goal-pace">{`Goal pace: ${formatPace(goalTargetPaceSecPerKm)}`}</p>}
      </div>
      <div className="run-block__fields">
        <NumberField id={`run-distance-${prescription.id}`} label="Distance" unit="km" value={distanceKm} onBlur={handleBlur}
          onChange={(v) => { setDistanceKm(v); scheduleSave({ distanceKm: v }) }} />
        <NumberField id={`run-duration-${prescription.id}`} label="Duration" unit="s" value={durationSec} onBlur={handleBlur}
          onChange={(v) => { setDurationSec(v); scheduleSave({ durationSec: v }) }} />
      </div>
      <SegmentedControl label="Surface" value={surface} onChange={(v) => { setSurface(v); scheduleSave({ surface: v }) }} options={SURFACE_OPTIONS} />
      <SegmentedControl label="Run type" value={runType} onChange={(v) => { setRunType(v); scheduleSave({ runType: v }) }} options={RUN_TYPE_OPTIONS} />

      <IntervalSplitsEditor idPrefix={`run-${prescription.id}`} intervalSpec={prescription.intervalSpec} initialSplits={splits} onChange={handleSplitsChange} />

      <div className="onboarding-field">
        <label htmlFor={`run-notes-${prescription.id}`} className="onboarding-field__label">Notes</label>
        <textarea
          id={`run-notes-${prescription.id}`}
          className="onboarding-field__textarea"
          value={notes}
          onChange={(event: ChangeEvent<HTMLTextAreaElement>) => { setNotes(event.target.value); scheduleSave({ notes: event.target.value }) }}
          onBlur={handleBlur}
        />
      </div>
      {prescription.notes && <p className="exercise-card__notes">{`Notes: ${prescription.notes}`}</p>}
    </Card>
  )
}
