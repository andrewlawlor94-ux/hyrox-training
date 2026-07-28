import type { FC } from 'react'
import { Button, Card } from '@/components'
import { addSet, removeSet, upsertSet } from '@/data/repositories'
import { useRestTimer } from '@/features/timer/useRestTimer'
import { hasUnknownLoad } from './loadPresentation'
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
}

const StrengthCard: FC<StrengthCardProps> = ({ item }) => {
  const { prescription, exercise, sets, recommendation, targetReps } = item
  const autosave = useAutosave()
  const { start } = useRestTimer()

  const prefillLoad = recommendation.isOptionalAim && recommendation.previous ? recommendation.previous.load : recommendation.target
  // No prefilled weight at all when the target is unknown (§ fix: "target:
  // 0 lb" at a machine reads as broken, not helpful) — the athlete's own
  // first entry becomes the baseline for future recommendations instead.
  const unknownLoad = hasUnknownLoad(exercise, recommendation)
  const defaultWeight = unknownLoad ? null : prefillLoad.value

  function handleCompleted(): void {
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
      />
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
    </Card>
  )
}

/** Routes each prescribed exercise to its logging block: strength sets,
 * a run (distance/duration/pace/splits — `RunBlock`), or a HYROX station
 * (`StationBlock`, including the sled/wall-ball specifics). */
export const ExerciseCard: FC<{ item: WorkoutExerciseVM }> = ({ item }) => {
  if (item.kind === 'strength') return <StrengthCard item={item} />
  if (item.kind === 'run') return <RunBlock item={item} />
  return <StationBlock item={item} />
}
