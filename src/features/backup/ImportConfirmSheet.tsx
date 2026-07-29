import type { FC } from 'react'
import { useState } from 'react'
import { Button, Sheet } from '@/components'
import type { PendingImport } from './useImportBackup'

/** Deliberately not a single keystroke, same reasoning as Settings' own
 * reset confirmation — this one only appears when `pending.hardConfirmRequired`
 * is true (C3: the file is empty, or drastically smaller than what's already
 * on this device), so it only gates the shape of import most likely to be a
 * mistake rather than every import. */
const HARD_CONFIRM_PHRASE = 'REPLACE'

interface ImportConfirmSheetProps {
  pending: PendingImport | null
  onConfirm: () => void
  onCancel: () => void
}

/**
 * The one confirmation step between "a file validated" and "every table
 * gets cleared and replaced" (C1). States plainly that import REPLACES this
 * device's data rather than merging it, and shows current-vs-file record
 * counts (available pre-write from `validation.file.counts` plus a live
 * count) so the athlete can tell at a glance whether the file looks right.
 *
 * When `pending.hardConfirmRequired` is set, a typed-phrase gate — the same
 * shape as "Reset application data" — replaces the plain tap-confirm,
 * because a zero-record or drastically-smaller file is far more often the
 * wrong file than a deliberate restore (see `isDrasticDataLoss`).
 */
export const ImportConfirmSheet: FC<ImportConfirmSheetProps> = ({ pending, onConfirm, onCancel }) => {
  const [confirmText, setConfirmText] = useState('')

  if (!pending) return null
  const { currentTotal, fileTotal, hardConfirmRequired } = pending
  const canConfirm = !hardConfirmRequired || confirmText === HARD_CONFIRM_PHRASE

  function handleCancel(): void {
    setConfirmText('')
    onCancel()
  }

  function handleConfirm(): void {
    setConfirmText('')
    onConfirm()
  }

  return (
    <Sheet open title="Replace all data on this device?" onClose={handleCancel}>
      <div className="import-confirm-sheet">
        <p>
          {`This device has ${String(currentTotal)} record(s) logged. This file has ${String(fileTotal)} record(s).`}
        </p>
        <p>
          Importing replaces everything on this device with the file — it does not merge the two. A safety
          snapshot of what&apos;s here now is saved automatically and can be restored from Settings if this was a
          mistake.
        </p>
        {hardConfirmRequired && (
          <>
            <p role="alert">
              {`This file has far fewer records than this device — most likely the wrong file, an old backup, or `
                + `a backup taken right after a reset. Importing it will erase ${String(currentTotal)} record(s) `
                + 'currently here.'}
            </p>
            <div className="onboarding-field">
              <label htmlFor="import-confirm-phrase" className="onboarding-field__label">
                {`Type ${HARD_CONFIRM_PHRASE} to confirm`}
              </label>
              <input
                id="import-confirm-phrase"
                type="text"
                className="onboarding-field__input"
                value={confirmText}
                onChange={(event) => { setConfirmText(event.target.value) }}
              />
            </div>
          </>
        )}
        <div className="import-confirm-sheet__actions">
          <Button variant="secondary" onClick={handleCancel}>Cancel</Button>
          <Button variant="danger" disabled={!canConfirm} onClick={handleConfirm}>Import and replace</Button>
        </div>
      </div>
    </Sheet>
  )
}
