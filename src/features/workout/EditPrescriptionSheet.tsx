import type { FC, ReactElement } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, DurationField, NumberField, SegmentedControl, Sheet } from '@/components'
import { applyPrescriptionEdit } from '@/data/repositories'
import type { EditScope, Prescription } from '@/data/types'
import { EDIT_SCOPE_OPTIONS, effectiveValues, loadEditSheetData } from './editPrescriptionData'
import type { EditableCandidate, EffectivePrescriptionValues } from './editPrescriptionData'

interface EditPrescriptionSheetProps {
  open: boolean
  instanceId: string
  /**
   * Skips the exercise picker and edits this one prescription directly --
   * the workout screen's per-exercise Edit button already knows which
   * exercise it belongs to. Home's Edit action omits it, since Home only
   * knows the session, not which of its exercises the athlete wants.
   */
  prescriptionId?: string
  onClose: () => void
}

function candidateLabel(candidate: EditableCandidate): string {
  const values = effectiveValues(candidate.prescription, candidate.exercise)
  const scheme = values.repMin !== null
    ? `${String(values.sets ?? 0)} x ${values.repMax !== null && values.repMax !== values.repMin ? `${String(values.repMin)}-${String(values.repMax)}` : String(values.repMin)}`
    : `${String(values.sets ?? 0)} sets`
  return `${candidate.exercise.name}: ${scheme}`
}

function buildPatch(fields: EffectivePrescriptionValues): Partial<Prescription> {
  return {
    ...(fields.sets !== null ? { sets: fields.sets } : {}),
    ...(fields.repMin !== null ? { repMin: fields.repMin } : {}),
    ...(fields.repMax !== null ? { repMax: fields.repMax } : {}),
    ...(fields.restSec !== null ? { restSec: fields.restSec } : {}),
    ...(fields.targetLoad !== null ? { targetLoad: fields.targetLoad } : {}),
    ...(fields.targetRir !== null ? { targetRir: fields.targetRir } : {}),
  }
}

/** Apply is only offered once the fields the underlying prescription always
 * carries are filled in -- `targetLoad`/`targetRir` stay genuinely optional
 * (see `effectiveValues`'s own doc comment), so their absence never blocks
 * the button. */
function isComplete(fields: EffectivePrescriptionValues): boolean {
  return fields.sets !== null && fields.repMin !== null && fields.repMax !== null && fields.restSec !== null
}

/**
 * Edits one strength exercise's prescription -- sets, rep range, target
 * load, target RIR, and rest seconds -- for a given `WorkoutInstance`,
 * routed through `applyPrescriptionEdit` under one of its three scopes.
 * Never offered (see both call sites) once the instance is `frozen`; if one
 * somehow slips through anyway (a race between opening this sheet and the
 * instance freezing), `applyPrescriptionEdit` itself throws for the
 * `thisWorkout` scope and that failure is surfaced via `error` below rather
 * than swallowed.
 */
export const EditPrescriptionSheet: FC<EditPrescriptionSheetProps> = ({ open, instanceId, prescriptionId, onClose }) => {
  const data = useLiveQuery(() => loadEditSheetData(instanceId), [instanceId])
  const candidates = useMemo(() => data?.candidates ?? [], [data])

  const [selectedId, setSelectedId] = useState<string | undefined>(prescriptionId)
  const [fields, setFields] = useState<EffectivePrescriptionValues | null>(null)
  const [scope, setScope] = useState<EditScope>('thisWorkout')
  const [error, setError] = useState<string | null>(null)
  const [isApplying, setIsApplying] = useState(false)
  const syncedSelectionRef = useRef<string | undefined>(undefined)

  // Reset to a fresh selection and a clean scope/error every time the sheet
  // opens -- an Apply failure (or a scope pick) from a previous open must
  // never bleed into the next one.
  useEffect(() => {
    if (!open) return
    setSelectedId(prescriptionId)
    setScope('thisWorkout')
    setError(null)
    syncedSelectionRef.current = undefined
  }, [open, prescriptionId])

  // Auto-pick the only candidate when there's exactly one and the caller
  // didn't already name one -- an athlete editing a session with a single
  // strength lift should never have to pick it out of a list of one.
  useEffect(() => {
    if (!open || prescriptionId || selectedId || candidates.length !== 1) return
    setSelectedId(candidates[0]?.prescription.id)
  }, [open, prescriptionId, selectedId, candidates])

  const selected = candidates.find((c) => c.prescription.id === selectedId)

  useEffect(() => {
    if (!selected || syncedSelectionRef.current === selected.prescription.id) return
    syncedSelectionRef.current = selected.prescription.id
    setFields(effectiveValues(selected.prescription, selected.exercise))
  }, [selected])

  function updateField(key: keyof EffectivePrescriptionValues, value: number | null): void {
    setFields((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  async function handleApply(): Promise<void> {
    if (!selected || !fields) return
    setIsApplying(true)
    setError(null)
    try {
      await applyPrescriptionEdit({
        instanceId, prescriptionId: selected.prescription.id, patch: buildPatch(fields), scope, now: new Date().toISOString(),
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this change.')
    } finally {
      setIsApplying(false)
    }
  }

  function renderBody(): ReactElement {
    if (data === undefined) return <p>Loading…</p>
    if (data.instance.frozen) {
      return <p role="alert">This session is already completed and can&apos;t be edited.</p>
    }
    if (candidates.length === 0) {
      return <p>Nothing in this session can be edited here.</p>
    }
    if (!selected) {
      return (
        <div className="edit-prescription-sheet__picker">
          {candidates.map((candidate) => (
            <Button
              key={candidate.prescription.id}
              variant="secondary"
              className="edit-prescription-sheet__picker-option"
              onClick={() => { setSelectedId(candidate.prescription.id) }}
            >
              {candidateLabel(candidate)}
            </Button>
          ))}
        </div>
      )
    }
    if (!fields) return <p>Loading…</p>

    return (
      <div className="edit-prescription-sheet">
        {candidates.length > 1 && !prescriptionId && (
          <button
            type="button"
            className="edit-prescription-sheet__back"
            onClick={() => { setSelectedId(undefined) }}
          >
            Choose a different exercise
          </button>
        )}
        <h3 className="edit-prescription-sheet__exercise-name">{selected.exercise.name}</h3>
        <div className="edit-prescription-sheet__fields">
          <NumberField id="edit-rx-sets" label="Sets" value={fields.sets} onChange={(v) => { updateField('sets', v) }} inputMode="numeric" />
          <NumberField id="edit-rx-rep-min" label="Rep min" value={fields.repMin} onChange={(v) => { updateField('repMin', v) }} inputMode="numeric" />
          <NumberField id="edit-rx-rep-max" label="Rep max" value={fields.repMax} onChange={(v) => { updateField('repMax', v) }} inputMode="numeric" />
          <NumberField
            id="edit-rx-load" label="Target load" value={fields.targetLoad} unit={selected.exercise.defaultUnit}
            onChange={(v) => { updateField('targetLoad', v) }} inputMode="decimal"
          />
          <NumberField id="edit-rx-rir" label="Target RIR" value={fields.targetRir} onChange={(v) => { updateField('targetRir', v) }} inputMode="numeric" />
          <DurationField id="edit-rx-rest" label="Rest" valueSec={fields.restSec} onCommit={(v) => { updateField('restSec', v) }} />
        </div>
        <SegmentedControl label="Apply to" options={EDIT_SCOPE_OPTIONS} value={scope} onChange={setScope} />
        {error && <p className="edit-prescription-sheet__error" role="alert">{error}</p>}
        <Button disabled={!isComplete(fields) || isApplying} onClick={() => { handleApply().catch(() => {}) }}>Apply</Button>
      </div>
    )
  }

  return (
    <Sheet open={open} onClose={onClose} title="Edit prescription">
      {renderBody()}
    </Sheet>
  )
}
