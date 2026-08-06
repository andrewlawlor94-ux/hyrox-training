import type { FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { completeSet, saveSetValues, undoSet } from '@/data/repositories'
import type { StrengthSet, Unit } from '@/data/types'
import { Button, Chip, NumberField } from '@/components'
import { countsAsDone } from '@/domain/logging/primaryMeasure'
import type { UseAutosaveResult } from './useAutosave'

interface SetRowProps {
  set: StrengthSet
  index: number
  /** `null` when the recommended target load is unknown (see
   * `loadPresentation.hasUnknownLoad`) — the row starts genuinely empty
   * rather than prefilled at a meaningless `0`, so the athlete's own first
   * entry becomes the baseline for future recommendations. */
  defaultWeight: number | null
  defaultUnit: Unit
  defaultReps: number
  autosave: UseAutosaveResult
  onCompleted: () => void
}

/**
 * One editable, always-expanded set row (§8). Local state seeds itself once
 * from `set` (falling back to the recommended prefill when the row hasn't
 * been logged yet) and stays the row's own source of truth for display from
 * then on — NumberField already keeps its own text buffer while focused, so
 * this only needs to hold the parsed numeric value, not fight React's
 * render cycle for it. Every edit reschedules an autosave write through
 * `autosave`; the merged, up-to-date `weight`/`reps`/`rir` triple is what
 * gets written, never a partial patch.
 *
 * The complete/undo control is disabled only while its own write is in
 * flight — Button's `disabled` maps to the native attribute, which blocks a
 * second dispatch outright — and both `completeSet` and `undoSet` are
 * idempotent by load (load the row first, no-op if already in the target
 * state), so even a write that somehow slips through a race can't
 * double-apply. Completing passes the row's own CURRENTLY-DISPLAYED
 * weight/reps/rir straight to `completeSet` so the one-tap flow (accept the
 * prefill, tap Complete, touch nothing) actually logs what was shown —
 * `completeSet` writes those values and `isCompleted` together, atomically.
 * Undo only flips `isCompleted` back off; it deliberately never touches
 * weight/reps/rir, so a corrected number survives a re-complete.
 *
 * `lastKnown*` refs distinguish an EXTERNAL write (another client, or this
 * exercise's "Use target" acting on a different row's `upsertSet` call) from
 * this row's own write echoing back through the live query. Only an actual
 * change relative to what this row itself last confirmed adopts the new
 * value into local state; an unrelated table write elsewhere that re-runs
 * the whole workout's live query must never reset a field the athlete is
 * mid-typing into, just because that field's OWN write hasn't flushed yet.
 */
export const SetRow: FC<SetRowProps> = ({ set, index, defaultWeight, defaultUnit, defaultReps, autosave, onCompleted }) => {
  const [weight, setWeight] = useState<number | null>(set.weight ?? defaultWeight)
  const [reps, setReps] = useState<number | null>(set.reps ?? defaultReps)
  const [rir, setRir] = useState<number | null>(set.rir ?? null)
  const unit = set.unit ?? defaultUnit
  const [isCompleting, setIsCompleting] = useState(false)

  const lastKnownWeight = useRef(set.weight)
  const lastKnownReps = useRef(set.reps)
  const lastKnownRir = useRef(set.rir)

  useEffect(() => {
    if (set.weight === lastKnownWeight.current) return
    lastKnownWeight.current = set.weight
    setWeight(set.weight ?? defaultWeight)
  }, [set.weight, defaultWeight])

  useEffect(() => {
    if (set.reps === lastKnownReps.current) return
    lastKnownReps.current = set.reps
    setReps(set.reps ?? defaultReps)
  }, [set.reps, defaultReps])

  useEffect(() => {
    if (set.rir === lastKnownRir.current) return
    lastKnownRir.current = set.rir
    setRir(set.rir ?? null)
  }, [set.rir])

  function scheduleSave(patch: { weight?: number | null; reps?: number | null; rir?: number | null }): void {
    const merged = {
      weight: patch.weight !== undefined ? patch.weight : weight,
      reps: patch.reps !== undefined ? patch.reps : reps,
      rir: patch.rir !== undefined ? patch.rir : rir,
    }
    // `saveSetValues`, never a whole-row `upsertSet` spread from this component's
    // `set` prop: that spread carried `isCompleted` from whenever the prop was
    // captured, so a debounced write landing after a completion un-completed the
    // set. Nulls are passed through deliberately — `applyOptionalNumbers` reads
    // `null` as "the athlete cleared this" and deletes the field, which is not
    // the same as omitting it.
    autosave.schedule(set.id, async () => {
      await saveSetValues(set.id, { weight: merged.weight, reps: merged.reps, rir: merged.rir, unit })
    })
  }

  function handleWeightChange(value: number | null): void { setWeight(value); scheduleSave({ weight: value }) }
  function handleRepsChange(value: number | null): void { setReps(value); scheduleSave({ reps: value }) }
  function handleRirChange(value: number | null): void { setRir(value); scheduleSave({ rir: value }) }
  function handleBlur(): void { void autosave.flushKey(set.id) }

  async function handleComplete(): Promise<void> {
    if (set.isCompleted || isCompleting) return
    setIsCompleting(true)
    try {
      // Flushes any still-debounced edit first so a stale pending write
      // (scheduled before this tap, carrying `isCompleted: false` in its
      // closure) can never land AFTER `completeSet` and silently revert the
      // completion -- then `completeSet` itself writes the row's current,
      // on-screen weight/reps/rir together with `isCompleted`.
      await autosave.flushKey(set.id)
      await completeSet(set.id, new Date().toISOString(), { weight, reps, rir, unit })
      onCompleted()
    } catch (err) {
      console.error('Failed to complete set', err)
    } finally {
      setIsCompleting(false)
    }
  }

  async function handleUndo(): Promise<void> {
    if (!set.isCompleted || isCompleting) return
    setIsCompleting(true)
    try {
      await undoSet(set.id)
      // Deliberately no call to `onCompleted()` here -- undo must never
      // start or otherwise touch the rest timer that completing began; the
      // athlete may legitimately be resting while fixing a mistapped set.
    } catch (err) {
      console.error('Failed to undo set', err)
    } finally {
      setIsCompleting(false)
    }
  }

  const rowNumber = index + 1
  const rowClassName = set.isCompleted ? 'set-row set-row--completed' : 'set-row'
  // Reps are this movement's deciding box (`primaryMeasureFor('strengthSets')`),
  // and the athlete's own rule for it: "with weights if I don't enter reps I
  // didn't do it". Completing with the box empty wrote a set that claimed to
  // have happened while recording no work — so the control is unavailable until
  // there is a rep count, with the reason on the button rather than a failure
  // after the tap.
  const hasReps = countsAsDone(reps)

  return (
    <div className={rowClassName}>
      <span className="set-row__index" aria-hidden="true">{set.isCompleted ? '✓' : rowNumber}</span>
      {/* No in-field `unit` suffix, deliberately. It reserved 32px of right
          padding inside a 53px column, leaving about 9px of usable text area —
          a three-digit weight like "205" was physically cut off, which is what
          the athlete reported. The unit is not lost: `TargetHeader` states it
          directly above every set row ("Today's target: 175 lb x 5"). The label
          stays unit-free so it does not change with the athlete's unit setting. */}
      <NumberField
        id={`set-weight-${set.id}`}
        label={`Weight, set ${String(rowNumber)}`}
        hideLabel
        value={weight}
        onChange={handleWeightChange}
        onBlur={handleBlur}
        inputMode="decimal"
      />
      <NumberField
        id={`set-reps-${set.id}`}
        label={`Reps, set ${String(rowNumber)}`}
        hideLabel
        value={reps}
        onChange={handleRepsChange}
        onBlur={handleBlur}
        inputMode="numeric"
      />
      <NumberField
        id={`set-rir-${set.id}`}
        label={`RIR, set ${String(rowNumber)}`}
        hideLabel
        value={rir}
        onChange={handleRirChange}
        onBlur={handleBlur}
        inputMode="numeric"
        placeholder="RIR"
      />
      <div className="set-row__action-cell">
        {set.isCompleted && <Chip tone="green">Logged</Chip>}
        <Button
          variant={set.isCompleted ? 'secondary' : 'primary'}
          size="sm"
          className={set.isCompleted ? 'set-row__action--done' : undefined}
          aria-label={set.isCompleted
            ? `Undo set ${String(rowNumber)}`
            : hasReps ? `Complete set ${String(rowNumber)}` : `Enter reps to complete set ${String(rowNumber)}`}
          disabled={isCompleting || (!set.isCompleted && !hasReps)}
          onClick={() => { void (set.isCompleted ? handleUndo() : handleComplete()) }}
        >
          {set.isCompleted ? 'Undo' : 'Complete'}
        </Button>
      </div>
    </div>
  )
}
