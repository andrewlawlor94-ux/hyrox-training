import type { FC } from 'react'
import { useState } from 'react'
import { DurationField, NumberField } from '@/components'
import { saveStationLog } from '@/data/repositories'
import type { Exercise, InstancePrescription, StationLog } from '@/data/types'
import { STATION_BY_EXERCISE_ID } from '@/features/workout/constants'
import { stationFieldSpec } from '@/features/workout/stationFields'
import { useAutosave } from '@/features/workout/useAutosave'

const ALLOW_HISTORY_EDIT = { allowHistoryEdit: true } as const

interface StationValues {
  distanceM: number | null
  reps: number | null
  load: number | null
  timeSec: number | null
}

interface PastStationProps {
  prescription: InstancePrescription
  exercise: Exercise
  log: StationLog | undefined
  onError: (err: unknown) => void
}

/**
 * A HYROX station on a COMPLETED session — correcting it, or entering it for the
 * first time ("i should be able to edit that record and input data even if it
 * wasnt captured the first time").
 *
 * Only the fields the station actually has, from the same `stationFieldSpec` the
 * live logging screen uses — a sled push has no rep count here either. Unlike a
 * run, every `StationLog` measurement is optional, so the row is written as soon
 * as any one of them is entered and a cleared field records "this was not
 * measured" rather than being ignored.
 */
export const PastStation: FC<PastStationProps> = ({ prescription, exercise, log, onError }) => {
  const [values, setValues] = useState<StationValues>({
    distanceM: log?.distanceM ?? null,
    reps: log?.reps ?? null,
    load: log?.load ?? null,
    timeSec: log?.timeSec ?? null,
  })
  const autosave = useAutosave()
  const station = STATION_BY_EXERCISE_ID[exercise.id]
  const fieldSpec = stationFieldSpec(station)
  const logId = log?.id ?? `sl_${prescription.id}`
  const loadUnit = prescription.loadUnit ?? exercise.defaultUnit

  function scheduleSave(patch: Partial<StationValues>): void {
    const merged = { ...values, ...patch }
    setValues(merged)
    autosave.schedule(logId, async () => {
      try {
        const next: StationLog = {
          id: logId,
          instanceId: prescription.instanceId,
          instancePrescriptionId: prescription.id,
          station: station ?? log?.station ?? 'skiErg',
          notes: log?.notes ?? '',
          ...(log?.setStructure !== undefined ? { setStructure: log.setStructure } : {}),
          ...(log?.breaks !== undefined ? { breaks: log.breaks } : {}),
          ...(log?.rpe !== undefined ? { rpe: log.rpe } : {}),
          ...(log?.surface !== undefined ? { surface: log.surface } : {}),
          ...(log?.totalLoadKg !== undefined ? { totalLoadKg: log.totalLoadKg } : {}),
          ...(log?.sledWeightKg !== undefined ? { sledWeightKg: log.sledWeightKg } : {}),
          ...(merged.distanceM !== null ? { distanceM: merged.distanceM } : {}),
          ...(merged.reps !== null ? { reps: merged.reps } : {}),
          ...(merged.load !== null ? { load: merged.load, loadUnit } : {}),
          ...(merged.timeSec !== null ? { timeSec: merged.timeSec } : {}),
        }
        await saveStationLog(next, ALLOW_HISTORY_EDIT)
      } catch (err) {
        onError(err)
      }
    })
  }

  function handleBlur(): void { void autosave.flushKey(logId) }

  return (
    <section className="past-record-editor__exercise">
      <h4 className="past-record-editor__exercise-name">{exercise.name}</h4>
      {log === undefined && (
        <p className="past-record-editor__hint">
          Nothing was recorded for this station. Enter what you did and it will be saved to this session.
        </p>
      )}
      <div className="past-record-editor__row">
        {fieldSpec.fields.includes('distance') && (
          <NumberField
            id={`past-station-distance-${logId}`} label="Distance" unit="m" value={values.distanceM} inputMode="decimal"
            onChange={(v) => { scheduleSave({ distanceM: v }) }} onBlur={handleBlur}
          />
        )}
        {fieldSpec.fields.includes('reps') && (
          <NumberField
            id={`past-station-reps-${logId}`} label="Reps" value={values.reps} inputMode="numeric"
            onChange={(v) => { scheduleSave({ reps: v }) }} onBlur={handleBlur}
          />
        )}
        {fieldSpec.fields.includes('load') && (
          <NumberField
            id={`past-station-load-${logId}`} label="Load" unit={loadUnit} value={values.load} inputMode="decimal"
            onChange={(v) => { scheduleSave({ load: v }) }} onBlur={handleBlur}
          />
        )}
        {fieldSpec.fields.includes('time') && (
          <DurationField
            id={`past-station-time-${logId}`} label="Time" valueSec={values.timeSec}
            onCommit={(v) => { scheduleSave({ timeSec: v }); handleBlur() }}
          />
        )}
      </div>
    </section>
  )
}
