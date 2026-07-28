import type { FC } from 'react'
import { useState } from 'react'
import { Button, Card, NumberField } from '@/components'
import { addSet, removeSet, saveStationLog, upsertSet } from '@/data/repositories'
import type { StationLog } from '@/data/types'
import { useRestTimer } from '@/features/timer/useRestTimer'
import { STATION_BY_EXERCISE_ID } from './constants'
import { hasUnknownLoad } from './loadPresentation'
import { SetRow } from './SetRow'
import { TargetHeader } from './TargetHeader'
import { useAutosave } from './useAutosave'
import type { StationExerciseVM, StrengthExerciseVM, WorkoutExerciseVM } from './useWorkout'

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

interface StationCardProps {
  item: StationExerciseVM
}

/** Generic distance/load/time/RPE fields for the eight HYROX-standard
 * stations and any other non-strength-set exercise. Full-fidelity run
 * logging with splits (RunLog/IntervalSplit) is a separate, later feature —
 * this is the honest minimum for "a station exercise renders station fields
 * rather than weight/reps" (§8's station bullet), not a stand-in for it. */
const StationCard: FC<StationCardProps> = ({ item }) => {
  const { prescription, exercise } = item
  const autosave = useAutosave()
  const [distanceM, setDistanceM] = useState<number | null>(item.log?.distanceM ?? prescription.distanceM ?? null)
  const [load, setLoad] = useState<number | null>(item.log?.load ?? prescription.targetLoad ?? null)
  const [timeSec, setTimeSec] = useState<number | null>(item.log?.timeSec ?? null)
  const [rpe, setRpe] = useState<number | null>(item.log?.rpe ?? null)

  const station = STATION_BY_EXERCISE_ID[exercise.id]

  function scheduleSave(patch: Partial<{ distanceM: number | null; load: number | null; timeSec: number | null; rpe: number | null }>): void {
    if (!station) return
    const merged = {
      distanceM: patch.distanceM !== undefined ? patch.distanceM : distanceM,
      load: patch.load !== undefined ? patch.load : load,
      timeSec: patch.timeSec !== undefined ? patch.timeSec : timeSec,
      rpe: patch.rpe !== undefined ? patch.rpe : rpe,
    }
    autosave.schedule(prescription.id, async () => {
      const log: StationLog = {
        id: item.log?.id ?? `sl_${prescription.id}`,
        instanceId: prescription.instanceId,
        instancePrescriptionId: prescription.id,
        station,
        notes: item.log?.notes ?? '',
        ...(merged.distanceM !== null ? { distanceM: merged.distanceM } : {}),
        ...(merged.load !== null ? { load: merged.load, loadUnit: prescription.loadUnit ?? exercise.defaultUnit } : {}),
        ...(merged.timeSec !== null ? { timeSec: merged.timeSec } : {}),
        ...(merged.rpe !== null ? { rpe: merged.rpe } : {}),
      }
      await saveStationLog(log)
    })
  }

  function handleBlur(): void { void autosave.flushKey(prescription.id) }

  return (
    <Card as="article" className="exercise-card">
      <h3 className="exercise-card__name">{exercise.name}</h3>
      <div className="exercise-card__station-fields">
        <NumberField id={`station-distance-${prescription.id}`} label="Distance" value={distanceM} unit="m" onBlur={handleBlur}
          onChange={(v) => { setDistanceM(v); scheduleSave({ distanceM: v }) }} />
        <NumberField id={`station-load-${prescription.id}`} label="Load" value={load} unit={exercise.defaultUnit} onBlur={handleBlur}
          onChange={(v) => { setLoad(v); scheduleSave({ load: v }) }} />
        <NumberField id={`station-time-${prescription.id}`} label="Time" value={timeSec} unit="s" onBlur={handleBlur}
          onChange={(v) => { setTimeSec(v); scheduleSave({ timeSec: v }) }} />
        <NumberField id={`station-rpe-${prescription.id}`} label="RPE" value={rpe} onBlur={handleBlur}
          onChange={(v) => { setRpe(v); scheduleSave({ rpe: v }) }} />
      </div>
      {prescription.notes && <p className="exercise-card__notes">{`Notes: ${prescription.notes}`}</p>}
    </Card>
  )
}

export const ExerciseCard: FC<{ item: WorkoutExerciseVM }> = ({ item }) => (
  item.kind === 'strength' ? <StrengthCard item={item} /> : <StationCard item={item} />
)
