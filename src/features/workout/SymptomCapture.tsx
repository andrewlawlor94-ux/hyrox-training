import type { FC } from 'react'
import { ScaleSelector } from '@/components'

export interface SymptomValues {
  sessionRpe: number
  shinPain: number
  sciaticPain: number
}

interface SymptomCaptureProps {
  idPrefix: string
  values: SymptomValues
  onChange: (patch: Partial<SymptomValues>) => void
}

/** Three horizontally arranged 0-10 one-tap scales (§16): session RPE, shin
 * pain, sciatic/back symptoms. Each defaults to 0 — a real, meaningful
 * answer ("no pain today"), not a placeholder the athlete has to clear. */
export const SymptomCapture: FC<SymptomCaptureProps> = ({ idPrefix, values, onChange }) => (
  <div className="symptom-capture">
    <div className="symptom-capture__row">
      <ScaleSelector id={`${idPrefix}-rpe`} label="Session RPE" value={values.sessionRpe} onChange={(v) => { onChange({ sessionRpe: v }) }} />
      <ScaleSelector id={`${idPrefix}-shin`} label="Shin pain" value={values.shinPain} onChange={(v) => { onChange({ shinPain: v }) }} />
      <ScaleSelector id={`${idPrefix}-sciatic`} label="Sciatic/back" value={values.sciaticPain} onChange={(v) => { onChange({ sciaticPain: v }) }} />
    </div>
  </div>
)
