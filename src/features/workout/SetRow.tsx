import type { FC } from 'react'
import { useEffect, useRef, useState } from 'react'
import { completeSet, upsertSet } from '@/data/repositories'
import type { StrengthSet, Unit } from '@/data/types'
import { Button, NumberField } from '@/components'
import type { UseAutosaveResult } from './useAutosave'

interface SetRowProps {
  set: StrengthSet
  index: number
  defaultWeight: number
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
 * The complete control is disabled once completed OR while its own write is
 * in flight — Button's `disabled` maps to the native attribute, which blocks
 * a second dispatch outright — and `completeSet` is idempotent by load
 * (loads the row first, no-ops if already completed), so even a write that
 * somehow slips through a race can't double-complete.
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
    autosave.schedule(set.id, async () => {
      await upsertSet({
        ...set,
        unit,
        ...(merged.weight !== null ? { weight: merged.weight } : {}),
        ...(merged.reps !== null ? { reps: merged.reps } : {}),
        ...(merged.rir !== null ? { rir: merged.rir } : {}),
      })
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
      await autosave.flushKey(set.id)
      await completeSet(set.id, new Date().toISOString())
      onCompleted()
    } catch (err) {
      console.error('Failed to complete set', err)
    } finally {
      setIsCompleting(false)
    }
  }

  const rowNumber = index + 1

  return (
    <div className="set-row">
      <span className="set-row__index">{rowNumber}</span>
      <NumberField
        id={`set-weight-${set.id}`}
        label={`Weight, set ${String(rowNumber)}`}
        hideLabel
        value={weight}
        onChange={handleWeightChange}
        onBlur={handleBlur}
        unit={unit}
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
      <Button
        variant={set.isCompleted ? 'secondary' : 'primary'}
        size="sm"
        aria-label={`Complete set ${String(rowNumber)}`}
        disabled={set.isCompleted || isCompleting}
        onClick={() => { void handleComplete() }}
      >
        {set.isCompleted ? 'Done' : 'Complete'}
      </Button>
    </div>
  )
}
