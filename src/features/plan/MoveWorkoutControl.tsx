import type { FC } from 'react'
import { useId, useState } from 'react'
import { Button } from '@/components'
import type { ISODate } from '@/data/types'
import { ConflictWarningSheet } from './ConflictWarningSheet'
import { useMoveWorkout } from './useMoveWorkout'

interface MoveWorkoutControlProps {
  instanceId: string
  today: ISODate
  /** Called after a move actually commits, so the caller (e.g. `WeekDetail`)
   * can close whatever else it has open. */
  onMoved?: () => void
}

/**
 * "Move to a different day": a plain date input plus a Move button. The
 * preview-then-commit flow, including the conflict warning §15 requires, now
 * lives in `useMoveWorkout` so Home's own move controls share it rather than
 * reimplementing it — an empty conflict result commits immediately, a non-empty
 * one opens `ConflictWarningSheet` naming every specific conflict, with Proceed
 * (still commits: a manual move overrides hard recovery conflicts but must
 * warn) and Pick another day (cancels, nothing written).
 */
export const MoveWorkoutControl: FC<MoveWorkoutControlProps> = ({ instanceId, today, onMoved }) => {
  const inputId = useId()
  const [date, setDate] = useState('')
  const move = useMoveWorkout({
    instanceId,
    today,
    onMoved: () => { setDate(''); onMoved?.() },
  })

  return (
    <div className="move-workout-control">
      <label htmlFor={inputId} className="move-workout-control__label">Move to</label>
      <input
        id={inputId}
        type="date"
        className="move-workout-control__input"
        value={date}
        onChange={(event) => { setDate(event.target.value) }}
      />
      <Button
        variant="secondary" size="sm" disabled={!date || move.isBusy}
        onClick={() => { move.request(date).catch(() => {}) }}
      >
        Move
      </Button>
      {move.error && <p role="alert" className="move-workout-control__error">{move.error}</p>}
      <ConflictWarningSheet
        open={move.conflicts !== null}
        conflicts={move.conflicts ?? []}
        onProceed={() => { move.proceed().catch(() => {}) }}
        onPickAnotherDay={move.cancel}
      />
    </div>
  )
}
