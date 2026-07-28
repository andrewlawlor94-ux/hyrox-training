import type { FC } from 'react'
import { Button } from '@/components'

interface CompletionActionsProps {
  disabled: boolean
  onComplete: () => void
  onPartial: () => void
  onCompletedEarlier: () => void
  onDefer: () => void
  onSkip: () => void
}

/**
 * All five completion states (§8), each one tap. `disabled` is set the
 * instant any action starts (by the caller, `WorkoutFooter`) so every
 * button's native `disabled` attribute blocks a second dispatch outright —
 * the same double-submit defence `SetRow.handleComplete` already uses,
 * applied here because completing twice must produce exactly one event.
 */
export const CompletionActions: FC<CompletionActionsProps> = ({
  disabled, onComplete, onPartial, onCompletedEarlier, onDefer, onSkip,
}) => (
  <div className="completion-actions">
    <Button disabled={disabled} onClick={onComplete}>Completed</Button>
    <Button variant="secondary" disabled={disabled} onClick={onPartial}>Partially completed</Button>
    <Button variant="secondary" disabled={disabled} onClick={onCompletedEarlier}>Completed earlier</Button>
    <Button variant="quiet" disabled={disabled} onClick={onDefer}>Deferred</Button>
    <Button variant="quiet" disabled={disabled} onClick={onSkip}>Skipped</Button>
  </div>
)
