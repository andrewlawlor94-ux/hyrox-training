import type { FC } from 'react'
import { Button, Sheet } from '@/components'

interface ConflictWarningSheetProps {
  open: boolean
  conflicts: string[]
  onProceed: () => void
  onPickAnotherDay: () => void
}

/**
 * Purely presentational: names every specific conflict a proposed manual
 * move would carry (never a generic "there's a conflict"), then offers
 * exactly two ways forward — Proceed (the move happens anyway; §15 says a
 * manual move may override a hard recovery conflict) or Pick another day
 * (cancels, changes nothing). The caller (`MoveWorkoutControl`) owns
 * fetching the conflicts and performing the actual move.
 */
export const ConflictWarningSheet: FC<ConflictWarningSheetProps> = ({ open, conflicts, onProceed, onPickAnotherDay }) => (
  <Sheet open={open} onClose={onPickAnotherDay} title="This date has a conflict">
    <div className="conflict-warning-sheet">
      <ul className="conflict-warning-sheet__list">
        {conflicts.map((conflict) => (
          <li key={conflict} role="alert">{conflict}</li>
        ))}
      </ul>
      <div className="conflict-warning-sheet__actions">
        <Button variant="secondary" onClick={onPickAnotherDay}>Pick another day</Button>
        <Button variant="danger" onClick={onProceed}>Proceed anyway</Button>
      </div>
    </div>
  </Sheet>
)
