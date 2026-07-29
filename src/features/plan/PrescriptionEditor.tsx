import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { NumberField, Sheet } from '@/components'
import { applyPrescriptionEdit } from '@/data/repositories'
import type { EditScope, Exercise, InstancePrescription, Prescription } from '@/data/types'
import { EditScopeSheet } from './EditScopeSheet'
import type { EditableExercise } from './planData'

interface PrescriptionEditorProps {
  open: boolean
  instanceId: string
  editable: EditableExercise | null
  onClose: () => void
}

interface FieldState {
  sets: number | null
  repMin: number | null
  repMax: number | null
  targetLoad: number | null
  targetRir: number | null
  restSec: number | null
  distanceM: number | null
  durationSec: number | null
  targetPaceSecPerKm: number | null
  notes: string
}

function fieldsFrom(ip: InstancePrescription, exercise: Exercise): FieldState {
  return {
    sets: ip.sets ?? exercise.defaultSets ?? null,
    repMin: ip.repMin ?? exercise.repMin ?? null,
    repMax: ip.repMax ?? exercise.repMax ?? null,
    targetLoad: ip.targetLoad ?? null,
    targetRir: ip.targetRir ?? null,
    restSec: ip.restSec,
    distanceM: ip.distanceM ?? exercise.defaultDistanceM ?? null,
    durationSec: ip.durationSec ?? exercise.defaultDurationSec ?? null,
    targetPaceSecPerKm: ip.targetPaceSecPerKm ?? null,
    notes: ip.notes ?? '',
  }
}

function buildPatch(fields: FieldState): Partial<Prescription> {
  return {
    ...(fields.sets !== null ? { sets: fields.sets } : {}),
    ...(fields.repMin !== null ? { repMin: fields.repMin } : {}),
    ...(fields.repMax !== null ? { repMax: fields.repMax } : {}),
    ...(fields.targetLoad !== null ? { targetLoad: fields.targetLoad } : {}),
    ...(fields.targetRir !== null ? { targetRir: fields.targetRir } : {}),
    ...(fields.restSec !== null ? { restSec: fields.restSec } : {}),
    ...(fields.distanceM !== null ? { distanceM: fields.distanceM } : {}),
    ...(fields.durationSec !== null ? { durationSec: fields.durationSec } : {}),
    // Hand-editing the pace here always flips it to 'manual' -- it no longer
    // tracks the race goal once the athlete overrides it directly (matches
    // `Prescription.paceSource`'s own doc comment).
    ...(fields.targetPaceSecPerKm !== null ? { targetPaceSecPerKm: fields.targetPaceSecPerKm, paceSource: 'manual' as const } : {}),
    notes: fields.notes,
  }
}

/**
 * Edits ONE `InstancePrescription`'s fields, for any measurement type (not
 * just `strengthSets` -- `EditPrescriptionSheet` on the workout-logging
 * screen deliberately stays strength-only; this is the broader plan-side
 * editor the brief's "sets, reps, loads, distances, paces, rest times, ...
 * and notes are all editable" line calls for). Save opens `EditScopeSheet`;
 * the actual write always goes through `applyPrescriptionEdit`, so the exact
 * three-scope contract (Task 16) is reused rather than re-implemented.
 */
export const PrescriptionEditor: FC<PrescriptionEditorProps> = ({ open, instanceId, editable, onClose }) => {
  const [fields, setFields] = useState<FieldState | null>(null)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [scope, setScope] = useState<EditScope>('thisWorkout')
  const [error, setError] = useState<string | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  useEffect(() => {
    if (!open) { setFields(null); return }
    if (editable) setFields(fieldsFrom(editable.instancePrescription, editable.exercise))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editable?.instancePrescription.id])

  function update<K extends keyof FieldState>(key: K, value: FieldState[K]): void {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function handleConfirm(): Promise<void> {
    if (!editable || !fields) return
    setIsBusy(true)
    setError(null)
    try {
      await applyPrescriptionEdit({
        instanceId, prescriptionId: editable.instancePrescription.id,
        patch: buildPatch(fields), scope, now: new Date().toISOString(),
      })
      setScopeOpen(false)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this change.')
    } finally {
      setIsBusy(false)
    }
  }

  if (!editable || !fields) {
    return <Sheet open={open} onClose={onClose} title="Edit exercise"><p>Loading…</p></Sheet>
  }

  const isStrength = editable.exercise.measurementType === 'strengthSets'

  return (
    <Sheet open={open} onClose={onClose} title={editable.exercise.name}>
      <div className="prescription-editor">
        {isStrength && (
          <>
            <NumberField id="pe-sets" label="Sets" value={fields.sets} onChange={(v) => { update('sets', v) }} inputMode="numeric" />
            <NumberField id="pe-rep-min" label="Rep min" value={fields.repMin} onChange={(v) => { update('repMin', v) }} inputMode="numeric" />
            <NumberField id="pe-rep-max" label="Rep max" value={fields.repMax} onChange={(v) => { update('repMax', v) }} inputMode="numeric" />
            <NumberField id="pe-load" label="Target load" value={fields.targetLoad} unit={editable.exercise.defaultUnit} onChange={(v) => { update('targetLoad', v) }} inputMode="decimal" />
            <NumberField id="pe-rir" label="Target RIR" value={fields.targetRir} onChange={(v) => { update('targetRir', v) }} inputMode="numeric" />
          </>
        )}
        {!isStrength && (
          <>
            <NumberField id="pe-distance" label="Distance (m)" value={fields.distanceM} onChange={(v) => { update('distanceM', v) }} inputMode="numeric" />
            <NumberField id="pe-duration" label="Duration (sec)" value={fields.durationSec} onChange={(v) => { update('durationSec', v) }} inputMode="numeric" />
            <NumberField id="pe-pace" label="Target pace (sec/km)" value={fields.targetPaceSecPerKm} onChange={(v) => { update('targetPaceSecPerKm', v) }} inputMode="numeric" />
          </>
        )}
        <NumberField id="pe-rest" label="Rest seconds" value={fields.restSec} onChange={(v) => { update('restSec', v) }} inputMode="numeric" />
        <div className="prescription-editor__notes">
          <label htmlFor="pe-notes">Notes</label>
          <textarea id="pe-notes" value={fields.notes} onChange={(e) => { update('notes', e.target.value) }} />
        </div>
        <button type="button" className="btn btn--primary" onClick={() => { setScopeOpen(true) }}>Save</button>
      </div>
      <EditScopeSheet
        open={scopeOpen} scope={scope} onChangeScope={setScope}
        onConfirm={() => { handleConfirm().catch(() => {}) }}
        onCancel={() => { setScopeOpen(false) }}
        isBusy={isBusy} error={error}
      />
    </Sheet>
  )
}
