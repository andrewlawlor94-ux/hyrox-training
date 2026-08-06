import type { FC } from 'react'
import { useState } from 'react'
import { Button, Card } from '@/components'
import { addSet, removeSet, upsertSet } from '@/data/repositories'
import { primeAudio } from '@/features/timer/feedback'
import { useRestTimer } from '@/features/timer/useRestTimer'
import { EditPrescriptionSheet } from './EditPrescriptionSheet'
import { hasUnknownLoad } from './loadPresentation'
import { LoggedStatus } from './LoggedStatus'
import { WarmupRamp } from './WarmupRamp'
import { RunBlock } from './RunBlock'
import { SetRow } from './SetRow'
import { StationBlock } from './StationBlock'
import { TargetHeader } from './TargetHeader'
import { useAutosave } from './useAutosave'
import type { StrengthExerciseVM, WorkoutExerciseVM } from './useWorkout'

/** Logs rather than rethrows: every call site below is a fire-and-forget
 * write triggered from a click handler, with no `await`er left to hand a
 * rejection to. */
function logAndIgnore(err: unknown): void {
  console.error('Workout action failed', err)
}

interface StrengthCardProps {
  item: StrengthExerciseVM
  /** Hides the Edit control once the owning instance is frozen (completed
   * history) -- see `EditPrescriptionSheet`'s own doc comment for why this is
   * never offered rather than offered-then-blocked. */
  frozen: boolean
}

const StrengthCard: FC<StrengthCardProps> = ({ item, frozen }) => {
  const { prescription, exercise, sets, recommendation, targetReps } = item
  const autosave = useAutosave()
  const { start } = useRestTimer()
  const [editOpen, setEditOpen] = useState(false)

  const prefillLoad = recommendation.isOptionalAim && recommendation.previous ? recommendation.previous.load : recommendation.target
  // No prefilled weight at all when the target is unknown (§ fix: "target:
  // 0 lb" at a machine reads as broken, not helpful) — the athlete's own
  // first entry becomes the baseline for future recommendations instead.
  const unknownLoad = hasUnknownLoad(exercise, recommendation)
  const defaultWeight = unknownLoad ? null : prefillLoad.value

  function handleCompleted(): void {
    // Unlock audio HERE, inside the tap. A browser only lets an AudioContext
    // start from a user gesture, and rest-timer expiry is not one — without
    // this the expiry tone is scheduled against a suspended context whose clock
    // never advances, so it is silent with no error. Called unconditionally: it
    // makes no sound itself, and checking the sound setting first would mean
    // enabling sound mid-session never took effect until the next reload.
    primeAudio()
    start({ exerciseId: exercise.id, label: exercise.name, totalSec: exercise.defaultRestSec }).catch(logAndIgnore)
  }

  async function handleUseTarget(): Promise<void> {
    if (unknownLoad) return // Nothing to apply — see TargetHeader, which hides this control in that case too.
    const row = sets.find((s) => !s.isCompleted) ?? sets[sets.length - 1]
    if (!row) return
    await upsertSet({ ...row, weight: recommendation.target.value, unit: recommendation.target.unit })
  }

  async function handleAddSet(): Promise<void> {
    const now = new Date().toISOString()
    const previousRow = sets[sets.length - 1]
    const created = await addSet({ instanceId: prescription.instanceId, instancePrescriptionId: prescription.id, now })
    if (previousRow) {
      await upsertSet({
        ...created,
        ...(previousRow.weight !== undefined ? { weight: previousRow.weight, unit: previousRow.unit ?? prefillLoad.unit } : {}),
        ...(previousRow.reps !== undefined ? { reps: previousRow.reps } : {}),
        ...(previousRow.rir !== undefined ? { rir: previousRow.rir } : {}),
      })
    }
  }

  async function handleRemoveSet(): Promise<void> {
    const lastRow = sets[sets.length - 1]
    if (!lastRow) return
    await removeSet(lastRow.id)
  }

  return (
    <Card as="article" className="exercise-card">
      <TargetHeader
        exercise={exercise}
        prescription={prescription}
        recommendation={recommendation}
        targetReps={targetReps}
        onUseTarget={() => { handleUseTarget().catch(logAndIgnore) }}
        {...(frozen ? {} : { onOpenSettings: () => { setEditOpen(true) } })}
      />
      {/* Whether this exercise is on the record yet, judged by its own
          deciding box — reps for a strength set. See `LoggedStatus`. */}
      <LoggedStatus item={item} />
      {/* Warm-up ramp to today's working load. Guidance only — see WarmupRamp. */}
      {!unknownLoad && <WarmupRamp exercise={exercise} workingLoad={recommendation.target} />}

      <div className="exercise-card__sets">
        {sets.map((set, index) => (
          <SetRow
            key={set.id}
            set={set}
            index={index}
            defaultWeight={defaultWeight}
            defaultUnit={prefillLoad.unit}
            defaultReps={targetReps}
            autosave={autosave}
            onCompleted={handleCompleted}
          />
        ))}
      </div>
      <div className="exercise-card__set-actions">
        <Button variant="quiet" size="sm" onClick={() => { handleAddSet().catch(logAndIgnore) }}>+ Add set</Button>
        {sets.length > 0 && (
          <Button variant="quiet" size="sm" onClick={() => { handleRemoveSet().catch(logAndIgnore) }}>Remove set</Button>
        )}
      </div>
      {prescription.notes && <p className="exercise-card__notes">{`Notes: ${prescription.notes}`}</p>}
      {!frozen && (
        <EditPrescriptionSheet
          open={editOpen}
          instanceId={prescription.instanceId}
          prescriptionId={prescription.id}
          onClose={() => { setEditOpen(false) }}
        />
      )}
    </Card>
  )
}

/** Routes each prescribed exercise to its logging block: strength sets,
 * a run (distance/duration/pace/splits — `RunBlock`), or a HYROX station
 * (`StationBlock`, including the sled/wall-ball specifics). `frozen` only
 * matters to the strength block -- it's the only one offering an Edit
 * control (see `StrengthCard`); the run/station blocks are unaffected. */
export const ExerciseCard: FC<{ item: WorkoutExerciseVM; frozen: boolean }> = ({ item, frozen }) => {
  if (item.kind === 'strength') return <StrengthCard item={item} frozen={frozen} />
  if (item.kind === 'run') return <RunBlock item={item} />
  return <StationBlock item={item} />
}
