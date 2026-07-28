import type { FC } from 'react'
import { SegmentedControl } from '@/components'
import type { RedFlagAnswers } from '@/domain/symptoms/redFlags'
import { hasUrgentRedFlag, RED_FLAG_QUESTIONS, urgentRedFlagMessage } from '@/domain/symptoms/redFlags'

type YesNo = 'yes' | 'no'
const YES_NO_OPTIONS: { value: YesNo; label: string }[] = [{ value: 'no', label: 'No' }, { value: 'yes', label: 'Yes' }]

interface RedFlagScreenProps {
  answers: RedFlagAnswers
  onChange: (id: keyof RedFlagAnswers, value: boolean) => void
}

/**
 * The three red-flag screening questions (D11), shown only by the caller
 * (`WorkoutFooter`) when the entered sciatic value is ≥5 or the sciatic
 * stream is already flagged — never for shin alone. Names no condition;
 * routes to urgent care. `urgentRedFlagMessage()` is rendered verbatim, not
 * paraphrased, the moment any answer is "yes" — this never blocks or
 * cancels the workout underneath it.
 */
export const RedFlagScreen: FC<RedFlagScreenProps> = ({ answers, onChange }) => {
  const urgent = hasUrgentRedFlag(answers)
  return (
    <div className="red-flag-screen">
      {RED_FLAG_QUESTIONS.map((q) => (
        <div className="red-flag-screen__question" key={q.id}>
          <SegmentedControl
            label={q.label}
            value={answers[q.id as keyof RedFlagAnswers] ? 'yes' : 'no'}
            onChange={(v: YesNo) => { onChange(q.id as keyof RedFlagAnswers, v === 'yes') }}
            options={YES_NO_OPTIONS}
          />
        </div>
      ))}
      {urgent && <p className="red-flag-screen__urgent" role="alert">{urgentRedFlagMessage()}</p>}
    </div>
  )
}
