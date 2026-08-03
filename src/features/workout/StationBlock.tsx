import type { ChangeEvent, FC } from 'react'
import { useState } from 'react'
import type { SledSurface, StationLog } from '@/data/types'
import { Card, DurationField, NumberField } from '@/components'
import { saveStationLog } from '@/data/repositories'
import { formatWithEquivalent } from '@/domain/units/format'
import { STATION_BY_EXERCISE_ID } from './constants'
import { stationReferenceText } from './stationReference'
import { stationFieldSpec } from './stationFields'
import { SledFields } from './SledFields'
import { useAutosave } from './useAutosave'
import type { StationExerciseVM } from './useWorkout'

const DEFAULT_SLED_SURFACE: SledSurface = 'other'

interface StationFields {
  distanceM: number | null
  reps: number | null
  load: number | null
  timeSec: number | null
  breaks: number | null
  rpe: number | null
  setStructure: string
  notes: string
  totalLoadKg: number | null
  sledWeightKg: number | null
  surface: SledSurface
}

function initialFields(item: StationExerciseVM): StationFields {
  const { log, prescription, standard } = item
  return {
    distanceM: log?.distanceM ?? prescription.distanceM ?? standard?.distanceM ?? null,
    reps: log?.reps ?? standard?.reps ?? prescription.repMax ?? null,
    load: log?.load ?? prescription.targetLoad ?? standard?.loadKg ?? standard?.loadPerHandKg ?? standard?.ballKg ?? null,
    timeSec: log?.timeSec ?? null,
    breaks: log?.breaks ?? null,
    rpe: log?.rpe ?? null,
    setStructure: log?.setStructure ?? '',
    notes: log?.notes ?? '',
    totalLoadKg: log?.totalLoadKg ?? null,
    sledWeightKg: log?.sledWeightKg ?? null,
    surface: log?.surface ?? DEFAULT_SLED_SURFACE,
  }
}

/**
 * Full HYROX-station logging block (§10/§11): distance, reps, load,
 * completion time, set/break structure, RPE, free-form notes, the seeded
 * Men's Open reference for this station (read from `db.hyroxStandards`,
 * never a literal — see `stationReferenceText`), the exercise's own
 * technique notes, and — for the two sled stations — `SledFields` plus the
 * standard's own friction caveat. A station with no load entered still
 * saves distance and time: every write below omits any field left `null`
 * rather than coercing it to `0`.
 */
export const StationBlock: FC<{ item: StationExerciseVM }> = ({ item }) => {
  const { prescription, exercise, standard } = item
  const [fields, setFields] = useState<StationFields>(() => initialFields(item))
  const autosave = useAutosave()

  const station = STATION_BY_EXERCISE_ID[exercise.id]
  const isSled = station === 'sledPush' || station === 'sledPull'
  const fieldSpec = stationFieldSpec(station)
  const loadUnit = prescription.loadUnit ?? exercise.defaultUnit
  const referenceText = stationReferenceText(standard)

  function scheduleSave(patch: Partial<StationFields>): void {
    const merged = { ...fields, ...patch }
    setFields(merged)
    autosave.schedule(prescription.id, async () => {
      const log: StationLog = {
        id: item.log?.id ?? `sl_${prescription.id}`,
        instanceId: prescription.instanceId,
        instancePrescriptionId: prescription.id,
        station: station ?? item.log?.station ?? 'skiErg',
        notes: merged.notes,
        ...(merged.distanceM !== null ? { distanceM: merged.distanceM } : {}),
        ...(merged.load !== null ? { load: merged.load, loadUnit } : {}),
        ...(merged.reps !== null ? { reps: merged.reps } : {}),
        ...(merged.timeSec !== null ? { timeSec: merged.timeSec } : {}),
        ...(merged.breaks !== null ? { breaks: merged.breaks } : {}),
        ...(merged.setStructure !== '' ? { setStructure: merged.setStructure } : {}),
        ...(merged.rpe !== null ? { rpe: merged.rpe } : {}),
        ...(isSled ? { surface: merged.surface } : {}),
        ...(isSled && merged.totalLoadKg !== null ? { totalLoadKg: merged.totalLoadKg } : {}),
        ...(isSled && merged.sledWeightKg !== null ? { sledWeightKg: merged.sledWeightKg } : {}),
      }
      await saveStationLog(log)
    })
  }

  function handleBlur(): void { void autosave.flushKey(prescription.id) }
  function handleTextChange(key: 'setStructure' | 'notes') {
    return (event: ChangeEvent<HTMLTextAreaElement>) => { scheduleSave({ [key]: event.target.value }) }
  }

  return (
    <Card as="article" className="exercise-card station-block">
      <h3 className="exercise-card__name">{exercise.name}</h3>
      {referenceText && <p className="station-block__reference">{`Reference: ${referenceText}`}</p>}

      {/* Only the fields this station actually has — see `stationFields.ts`. A
          sled push has no rep count, and asking for one made the whole block
          read as guesswork. */}
      <div className="exercise-card__station-fields">
        {fieldSpec.fields.includes('distance') && (
          <NumberField id={`station-distance-${prescription.id}`} label="Distance" value={fields.distanceM} unit="m" onBlur={handleBlur}
            onChange={(v) => { scheduleSave({ distanceM: v }) }} />
        )}
        {fieldSpec.fields.includes('reps') && (
          <NumberField id={`station-reps-${prescription.id}`} label="Reps" value={fields.reps} onBlur={handleBlur}
            onChange={(v) => { scheduleSave({ reps: v }) }} />
        )}
        {fieldSpec.fields.includes('load') && (
          <NumberField id={`station-load-${prescription.id}`} label="Load" value={fields.load} unit={loadUnit} onBlur={handleBlur}
            onChange={(v) => { scheduleSave({ load: v }) }} />
        )}
        {/* Minutes and seconds, not a raw seconds count — a 4-minute sled push is
            "4:10", not "250". Commits on blur, so the save is scheduled and
            flushed together. */}
        {fieldSpec.fields.includes('time') && (
          <DurationField
            id={`station-time-${prescription.id}`}
            label="Time"
            valueSec={fields.timeSec}
            onCommit={(v) => {
              scheduleSave({ timeSec: v })
              void autosave.flushKey(prescription.id)
            }}
          />
        )}
        {fieldSpec.fields.includes('rpe') && (
          <NumberField id={`station-rpe-${prescription.id}`} label="RPE" value={fields.rpe} onBlur={handleBlur}
            onChange={(v) => { scheduleSave({ rpe: v }) }} />
        )}
      </div>

      {/* Breaks sits outside the field grid so its explanation can sit under it
          at full width. "Breaks" alone meant nothing to the athlete, and the
          wording is per-station because stopping a sled and stopping a set of
          wall balls are different things. */}
      {fieldSpec.fields.includes('breaks') && (
        <div className="station-block__breaks">
          <NumberField id={`station-breaks-${prescription.id}`} label="Breaks" value={fields.breaks} onBlur={handleBlur}
            onChange={(v) => { scheduleSave({ breaks: v }) }} />
          <p className="station-block__field-hint">{fieldSpec.breaksHint}</p>
        </div>
      )}
      {fields.load !== null && loadUnit === 'kg' && (
        <p className="station-block__equivalent">{formatWithEquivalent({ value: fields.load, unit: 'kg' })}</p>
      )}

      {isSled && (
        <SledFields
          idPrefix={`station-${prescription.id}`}
          totalLoadKg={fields.totalLoadKg}
          sledWeightKg={fields.sledWeightKg}
          surface={fields.surface}
          onChangeTotalLoad={(v) => { scheduleSave({ totalLoadKg: v }) }}
          onChangeSledWeight={(v) => { scheduleSave({ sledWeightKg: v }) }}
          onChangeSurface={(v) => { scheduleSave({ surface: v }) }}
          onBlur={handleBlur}
          frictionNote={standard?.notes}
        />
      )}
      {!isSled && station === 'wallBalls' && standard?.notes && (
        <p className="station-block__note">{standard.notes}</p>
      )}

      <div className="onboarding-field">
        <label htmlFor={`station-set-structure-${prescription.id}`} className="onboarding-field__label">Set/break structure</label>
        <textarea
          id={`station-set-structure-${prescription.id}`}
          className="onboarding-field__textarea"
          placeholder="e.g. 3 sets of 34, 20s break"
          value={fields.setStructure}
          onChange={handleTextChange('setStructure')}
          onBlur={handleBlur}
        />
      </div>
      <div className="onboarding-field">
        <label htmlFor={`station-notes-${prescription.id}`} className="onboarding-field__label">Notes</label>
        <textarea
          id={`station-notes-${prescription.id}`}
          className="onboarding-field__textarea"
          value={fields.notes}
          onChange={handleTextChange('notes')}
          onBlur={handleBlur}
        />
      </div>

      {exercise.techniqueNotes && <p className="exercise-card__notes">{`Technique: ${exercise.techniqueNotes}`}</p>}
      {prescription.notes && <p className="exercise-card__notes">{`Notes: ${prescription.notes}`}</p>}
    </Card>
  )
}
