import type { FC } from 'react'
import { useId, useState } from 'react'
import { Button } from '@/components'
import { moveWorkoutManually, previewMoveConflicts } from '@/data/repositories'
import type { ISODate } from '@/data/types'
import { ConflictWarningSheet } from './ConflictWarningSheet'

interface MoveWorkoutControlProps {
  instanceId: string
  today: ISODate
  /** Called after a move actually commits, so the caller (e.g. `WeekDetail`)
   * can close whatever else it has open. */
  onMoved?: () => void
}

/**
 * "Move to a different day": a plain date input plus a Move button. Moving
 * always previews conflicts first (`previewMoveConflicts`) — an empty result
 * commits immediately, a non-empty one opens `ConflictWarningSheet` naming
 * every specific conflict, with Proceed (still commits — §15: manual moves
 * override hard recovery conflicts but must warn) and Pick another day
 * (cancels, nothing written).
 */
export const MoveWorkoutControl: FC<MoveWorkoutControlProps> = ({ instanceId, today, onMoved }) => {
  const inputId = useId()
  const [date, setDate] = useState('')
  const [conflicts, setConflicts] = useState<string[] | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function commitMove(targetDate: ISODate): Promise<void> {
    setIsBusy(true)
    setError(null)
    try {
      await moveWorkoutManually({ instanceId, date: targetDate, now: new Date().toISOString(), today })
      setConflicts(null)
      setDate('')
      onMoved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move this workout.')
    } finally {
      setIsBusy(false)
    }
  }

  async function handleMoveClick(): Promise<void> {
    if (!date) return
    setIsBusy(true)
    setError(null)
    try {
      const found = await previewMoveConflicts({ instanceId, date })
      if (found.length === 0) {
        await commitMove(date)
      } else {
        setConflicts(found)
        setIsBusy(false)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check this date.')
      setIsBusy(false)
    }
  }

  async function handleProceed(): Promise<void> {
    await commitMove(date)
  }

  function handlePickAnotherDay(): void {
    setConflicts(null)
  }

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
        variant="secondary" size="sm" disabled={!date || isBusy}
        onClick={() => { handleMoveClick().catch(() => {}) }}
      >
        Move
      </Button>
      {error && <p role="alert" className="move-workout-control__error">{error}</p>}
      <ConflictWarningSheet
        open={conflicts !== null}
        conflicts={conflicts ?? []}
        onProceed={() => { handleProceed().catch(() => {}) }}
        onPickAnotherDay={handlePickAnotherDay}
      />
    </div>
  )
}

