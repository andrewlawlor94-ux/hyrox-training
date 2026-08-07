import type { ChangeEvent, FC } from 'react'
import { useState } from 'react'
import type { IntervalSplit, RunLog, RunType, Surface } from '@/data/types'
import { Card, Chip, DurationField, NumberField, SegmentedControl } from '@/components'
import { deleteRunLog, saveRunLog } from '@/data/repositories'
import { paceSecPerKm } from '@/domain/pace/pace'
import { splitPaceSecPerKm } from '@/domain/pace/intervals'
import { formatDistanceM, formatDuration, formatPace } from '@/domain/units/format'
import { DEFAULT_RUN_TYPE_BY_EXERCISE_ID, RUN_TYPE_OPTIONS, SURFACE_OPTIONS } from './constants'
import { IntervalSplitsEditor } from './IntervalSplitsEditor'
import { LoggedStatus } from './LoggedStatus'
import { intervalTotals, isLoggableRun } from './runTotals'
import type { DraftSplit } from './IntervalSplitsEditor'
import { useAutosave } from './useAutosave'
import type { RunExerciseVM } from './useWorkout'

const DEFAULT_SURFACE: Surface = 'road'
const M_PER_KM = 1000

/**
 * The run type the PROGRAM prescribes for this session, derived from the
 * prescription itself (an interval spec means intervals) or from the seeded
 * exercise. This is a plan fact, not a preference.
 */
function prescribedRunType(item: RunExerciseVM): RunType {
  if (item.prescription.intervalSpec) return 'intervals'
  return DEFAULT_RUN_TYPE_BY_EXERCISE_ID[item.exercise.id] ?? 'easy'
}

function runTypeLabel(type: RunType): string {
  return RUN_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? type
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
 *
 * Duration is entered as mm:ss via `DurationField`, and the run type is stated
 * as what the program prescribes rather than offered as a free choice — see
 * those two blocks below for the reasoning.
 */
export const RunBlock: FC<{ item: RunExerciseVM }> = ({ item }) => {
  const { prescription, exercise, log, splits, goalTargetPaceSecPerKm } = item
  const [distanceKm, setDistanceKm] = useState<number | null>(log?.distanceKm ?? (prescription.distanceM ? prescription.distanceM / M_PER_KM : null))
  const [durationSec, setDurationSec] = useState<number | null>(log?.durationSec ?? prescription.durationSec ?? null)
  const [surface, setSurface] = useState<Surface>(log?.surface ?? DEFAULT_SURFACE)
  const prescribed = prescribedRunType(item)
  const [runType, setRunType] = useState<RunType>(log?.runType ?? prescribed)
  // Closed unless what was actually run differs from what was prescribed, so
  // the normal case reads as an instruction and only a genuine deviation shows
  // the picker already open.
  const [showTypeOverride, setShowTypeOverride] = useState(runType !== prescribed)
  const [notes, setNotes] = useState(log?.notes ?? '')
  const [draftSplits, setDraftSplits] = useState<DraftSplit[]>([])
  const autosave = useAutosave()

  /** An interval session is measured by its splits, not by one pair of overall
   * boxes — see `intervalTotals`. Either the program prescribed intervals, or a
   * previously-saved log already has splits. */
  const isIntervalSession = prescription.intervalSpec !== undefined || splits.length > 0
  const liveTotals = isIntervalSession
    ? intervalTotals(draftSplits)
    : { distanceKm, durationSec, workPaceSecPerKm: null }
  // The headline pace for an interval session is its WORK pace. Session time
  // over work distance charges the recoveries against the reps and reads far
  // slower than anything that was actually run.
  const livePace = liveTotals.workPaceSecPerKm ?? paceSecPerKm(liveTotals.distanceKm ?? 0, liveTotals.durationSec ?? 0)
  const runLogId = log?.id ?? `rl_${prescription.id}`

  function scheduleSave(
    patch: { distanceKm?: number | null; durationSec?: number | null; surface?: Surface; runType?: RunType; notes?: string },
    splitsOverride?: DraftSplit[],
  ): void {
    // Captured here, synchronously, rather than read back off `draftSplits`
    // inside the scheduled closure below — a caller updating splits and
    // scheduling a save in the same handler (`handleSplitsChange`) would
    // otherwise see the PRE-update state, since `setDraftSplits` doesn't
    // apply until the next render.
    const splitsToSave = splitsOverride ?? draftSplits
    const totals = isIntervalSession
      ? intervalTotals(splitsToSave)
      : {
        distanceKm: patch.distanceKm !== undefined ? patch.distanceKm : distanceKm,
        durationSec: patch.durationSec !== undefined ? patch.durationSec : durationSec,
        // A steady run has no reps to average, so its pace is simply its own
        // distance over its own time — computed below like it always was.
        workPaceSecPerKm: null,
      }
    const merged = {
      ...totals,
      surface: patch.surface ?? surface,
      runType: patch.runType ?? runType,
      notes: patch.notes ?? notes,
    }
    autosave.schedule(prescription.id, async () => {
      if (!isLoggableRun(merged.distanceKm, merged.durationSec)) {
        // Nothing valid to log. If a row already exists — the athlete
        // cleared a required field after an earlier save — remove it
        // entirely rather than leaving the stale value (and its stale
        // derived pace) behind (I3). If nothing was ever saved, this is a
        // harmless no-op delete of a row that never existed.
        await deleteRunLog(runLogId, prescription.instanceId)
        return
      }
      // For an interval session the stored pace is the WORK-only mean, never
      // session time over work distance — see `RunTotals.workPaceSecPerKm`.
      const pace = merged.workPaceSecPerKm ?? paceSecPerKm(merged.distanceKm as number, merged.durationSec as number)
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
    // `IntervalSplitsEditor` calls `onChange` once on mount regardless of
    // whether the athlete has touched anything — only bother scheduling
    // when there is either a genuinely loggable run right now, or a
    // previously-saved log that might need clearing (I3). Otherwise this
    // would fire a pointless "delete a row that never existed" on every
    // mount. For an interval session the splits themselves decide that, which
    // is what makes editing a rep actually save the session.
    const totals = isIntervalSession ? intervalTotals(drafts) : { distanceKm, durationSec }
    if (isLoggableRun(totals.distanceKm, totals.durationSec) || log) scheduleSave({}, drafts)
  }

  return (
    <Card as="article" className="exercise-card run-block">
      <h3 className="exercise-card__name">{exercise.name}</h3>
      <LoggedStatus item={item} />
      <div className="run-block__pace-row">
        <p className="run-block__pace">{`Pace: ${formatPace(livePace)}`}</p>
        {goalTargetPaceSecPerKm !== null && <p className="run-block__goal-pace">{`Goal pace: ${formatPace(goalTargetPaceSecPerKm)}`}</p>}
      </div>

      {/* An interval session's distance and duration are the sums of its splits,
          so they are STATED here rather than asked for again below — see
          `intervalTotals` for the defect that came of asking twice. */}
      {isIntervalSession ? (
        <p className="run-block__totals">
          {'Session total: '}
          <strong>
            {liveTotals.distanceKm === null ? '—' : formatDistanceM(liveTotals.distanceKm * M_PER_KM)}
            {' · '}
            {liveTotals.durationSec === null ? '—' : formatDuration(liveTotals.durationSec)}
          </strong>
          {' — added up from the splits below'}
        </p>
      ) : (
        <div className="run-block__fields">
          <NumberField id={`run-distance-${prescription.id}`} label="Distance" unit="km" value={distanceKm} onBlur={handleBlur}
            onChange={(v) => { setDistanceKm(v); scheduleSave({ distanceKm: v }) }} />
          {/* Minutes and seconds, not a raw seconds count. `DurationField` commits
              on blur, so `handleBlur`'s flush is redundant for it — the commit
              below schedules and flushes in one go. */}
          <DurationField
            id={`run-duration-${prescription.id}`}
            label="Duration"
            valueSec={durationSec}
            onCommit={(v) => {
              setDurationSec(v)
              scheduleSave({ durationSec: v })
              void autosave.flushKey(prescription.id)
            }}
          />
        </div>
      )}
      <SegmentedControl label="Surface" value={surface} onChange={(v) => { setSurface(v); scheduleSave({ surface: v }) }} options={SURFACE_OPTIONS} />

      {/* The run type is PRESCRIBED, not chosen (athlete: "it should tell me what
          type to do as it is a program"). Stated as an instruction, with the
          picker behind a disclosure for the case where what was actually run
          differed — dropping the override entirely would force the log to claim
          an easy run when the athlete ran a tempo, which corrupts Progress's
          pace-by-run-type comparison. */}
      <div className="run-block__type">
        <p className="run-block__type-prescribed">
          <span className="run-block__type-label">Run type</span>
          <Chip tone="accent">{runTypeLabel(prescribed)}</Chip>
          {runType !== prescribed && <Chip tone="caution">{`Logged as ${runTypeLabel(runType)}`}</Chip>}
        </p>
        {!showTypeOverride && (
          <button
            type="button"
            className="run-block__type-toggle"
            onClick={() => { setShowTypeOverride(true) }}
          >
            Ran a different type?
          </button>
        )}
        {showTypeOverride && (
          <SegmentedControl
            label="Log this run as"
            value={runType}
            onChange={(v) => { setRunType(v); scheduleSave({ runType: v }) }}
            options={RUN_TYPE_OPTIONS}
          />
        )}
      </div>

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
