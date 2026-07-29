import type { ChangeEvent, FC } from 'react'
import { useState } from 'react'
import { Button, NumberField } from '@/components'
import type { ExerciseCategory, LoadStyle, MeasurementType, Unit } from '@/data/types'
import { CATEGORY_OPTIONS, LOAD_STYLE_OPTIONS, MEASUREMENT_TYPE_OPTIONS, UNIT_OPTIONS } from './constants'
import { isFormComplete } from './formValues'
import type { ExerciseFormValues } from './formValues'

interface ExerciseFormProps {
  initial: ExerciseFormValues
  submitLabel: string
  onSave: (values: ExerciseFormValues) => Promise<void>
  onCancel: () => void
}

/**
 * Every `Exercise` definition field from §13: name, category, measurement
 * type, load style, default unit, default rest, progression increment,
 * default sets, default rep range, default distance or duration, technique
 * notes, and active/archived. Shared between create and edit -- the caller
 * supplies `initial` (either `EMPTY_EXERCISE_FORM_VALUES` or
 * `exerciseToFormValues(existing)`) and a `onSave` that routes to
 * `createExercise` or `updateExercise`.
 *
 * `progressionIncrement` renders whatever `initial` carries, including 0 --
 * `NumberField`'s `value`/`onChange` never coalesce 0 to a fallback (see
 * `ExerciseFormValues`'s doc comment), so re-saving a station's form without
 * touching that field keeps its fixed-load 0 exactly as it was, never
 * silently promoting it to a non-zero increment.
 */
export const ExerciseForm: FC<ExerciseFormProps> = ({ initial, submitLabel, onSave, onCancel }) => {
  const [values, setValues] = useState<ExerciseFormValues>(initial)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set<K extends keyof ExerciseFormValues>(key: K, value: ExerciseFormValues[K]): void {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSave(): Promise<void> {
    setIsSaving(true)
    setError(null)
    try {
      await onSave(values)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this exercise.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="exercise-form">
      <div className="library-field">
        <label htmlFor="exercise-form-name" className="library-field__label">Name</label>
        <input
          id="exercise-form-name"
          type="text"
          className="library-field__input"
          value={values.name}
          onChange={(event: ChangeEvent<HTMLInputElement>) => { set('name', event.target.value) }}
        />
      </div>

      <div className="library-field">
        <label htmlFor="exercise-form-category" className="library-field__label">Category</label>
        <select
          id="exercise-form-category"
          className="library-field__select"
          value={values.category}
          onChange={(event) => { set('category', event.target.value as ExerciseCategory) }}
        >
          {CATEGORY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>

      <div className="library-field">
        <label htmlFor="exercise-form-measurement" className="library-field__label">Measurement type</label>
        <select
          id="exercise-form-measurement"
          className="library-field__select"
          value={values.measurementType}
          onChange={(event) => { set('measurementType', event.target.value as MeasurementType) }}
        >
          {MEASUREMENT_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>

      <div className="library-field">
        <label htmlFor="exercise-form-load-style" className="library-field__label">Load style</label>
        <select
          id="exercise-form-load-style"
          className="library-field__select"
          value={values.loadStyle}
          onChange={(event) => { set('loadStyle', event.target.value as LoadStyle) }}
        >
          {LOAD_STYLE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>

      <div className="library-field">
        <label htmlFor="exercise-form-unit" className="library-field__label">Default unit</label>
        <select
          id="exercise-form-unit"
          className="library-field__select"
          value={values.defaultUnit}
          onChange={(event) => { set('defaultUnit', event.target.value as Unit) }}
        >
          {UNIT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
        </select>
      </div>

      <div className="exercise-form__grid">
        <NumberField
          id="exercise-form-rest" label="Default rest" unit="sec" inputMode="numeric"
          value={values.defaultRestSec} onChange={(v) => { set('defaultRestSec', v) }}
        />
        <NumberField
          id="exercise-form-increment" label="Progression increment" unit={values.defaultUnit} inputMode="decimal"
          value={values.progressionIncrement} onChange={(v) => { set('progressionIncrement', v) }}
        />
      </div>

      <h3 className="exercise-form__section-heading">Strength defaults (optional)</h3>
      <div className="exercise-form__grid">
        <NumberField id="exercise-form-sets" label="Sets" inputMode="numeric" value={values.defaultSets} onChange={(v) => { set('defaultSets', v) }} />
        <NumberField id="exercise-form-rep-min" label="Rep min" inputMode="numeric" value={values.repMin} onChange={(v) => { set('repMin', v) }} />
        <NumberField id="exercise-form-rep-max" label="Rep max" inputMode="numeric" value={values.repMax} onChange={(v) => { set('repMax', v) }} />
      </div>

      <h3 className="exercise-form__section-heading">Distance or duration defaults (optional)</h3>
      <div className="exercise-form__grid">
        <NumberField id="exercise-form-distance" label="Default distance" unit="m" inputMode="decimal" value={values.defaultDistanceM} onChange={(v) => { set('defaultDistanceM', v) }} />
        <NumberField id="exercise-form-duration" label="Default duration" unit="sec" inputMode="numeric" value={values.defaultDurationSec} onChange={(v) => { set('defaultDurationSec', v) }} />
      </div>

      <div className="library-field">
        <label htmlFor="exercise-form-notes" className="library-field__label">Technique notes</label>
        <textarea
          id="exercise-form-notes"
          className="library-field__textarea"
          value={values.techniqueNotes}
          onChange={(event) => { set('techniqueNotes', event.target.value) }}
        />
      </div>

      <label className="exercise-form__archived-toggle">
        <input
          type="checkbox"
          checked={values.isArchived}
          onChange={(event) => { set('isArchived', event.target.checked) }}
        />
        Archived
      </label>

      {error && <p className="library-field__error" role="alert">{error}</p>}

      <div className="exercise-form__actions">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button disabled={!isFormComplete(values) || isSaving} onClick={() => { handleSave().catch(() => {}) }}>
          {submitLabel}
        </Button>
      </div>
    </div>
  )
}
