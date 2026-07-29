import type { FC } from 'react'
import { Button, SegmentedControl, Sheet } from '@/components'
import type { EditScope } from '@/data/types'
import { EDIT_SCOPE_OPTIONS } from '@/features/workout/editPrescriptionData'

interface EditScopeSheetProps {
  open: boolean
  scope: EditScope
  onChangeScope: (scope: EditScope) => void
  onConfirm: () => void
  onCancel: () => void
  isBusy?: boolean
  error?: string | null
}

/**
 * Presentational scope chooser shown after `PrescriptionEditor`'s Save is
 * tapped: exactly the three scopes `applyPrescriptionEdit` implements (Task
 * 16) -- "This workout only" / "This and all future instances" / "Update
 * the exercise default without changing scheduled workouts" -- reusing the
 * SAME option list `EditPrescriptionSheet` (Home/workout screen) already
 * uses, so the wording never drifts between the two surfaces that offer it.
 */
export const EditScopeSheet: FC<EditScopeSheetProps> = ({ open, scope, onChangeScope, onConfirm, onCancel, isBusy, error }) => (
  <Sheet open={open} onClose={onCancel} title="Apply this change to">
    <div className="edit-scope-sheet">
      <SegmentedControl label="Apply to" options={EDIT_SCOPE_OPTIONS} value={scope} onChange={onChangeScope} />
      {error && <p role="alert" className="edit-scope-sheet__error">{error}</p>}
      <div className="edit-scope-sheet__actions">
        <Button variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button disabled={isBusy} onClick={onConfirm}>Confirm</Button>
      </div>
    </div>
  </Sheet>
)
