import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { currentBackupCounts } from '@/data/backup/currentCounts'
import { importBackup } from '@/data/backup/importBackup'
import { isDrasticDataLoss, sumCounts } from '@/domain/backup/confirmation'
import { validateBackup } from '@/domain/backup/validate'

/** `File.prototype.text()` isn't implemented under jsdom (verified while
 * building `BackupSettings`'s tests), so this reads via `FileReader` instead
 * — the same API real browsers support too. */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => { resolve(typeof reader.result === 'string' ? reader.result : '') }
    reader.onerror = () => { reject(reader.error ?? new Error('Could not read the selected file.')) }
    reader.readAsText(file)
  })
}

/** A validated-but-not-yet-written import, awaiting the C1 confirmation step.
 * `raw` is kept (rather than the already-parsed `BackupFile`) so the actual
 * write still goes through `importBackup`'s own full validation — this is
 * display-only staging, not a second source of truth. */
export interface PendingImport {
  raw: string
  currentTotal: number
  fileTotal: number
  /** True when the file's total is zero, or drastically below what's
   * already on this device — see `isDrasticDataLoss` (C3). The confirmation
   * UI is expected to demand a typed phrase, not just a tap, when this is
   * true. */
  hardConfirmRequired: boolean
}

export interface UseImportBackupResult {
  /** Success count summary or the specific `ValidationFailure` message —
   * whichever the last attempt produced. `null` before any attempt. */
  message: string | null
  /** Set once a selected file passes `validateBackup`, cleared once the
   * athlete confirms or cancels. Nothing is written while this is set. */
  pending: PendingImport | null
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => void
  /** Same staging step `handleFileChange` uses, but from an already-in-hand
   * JSON string rather than a `<input type=file>` selection — what the
   * pre-import safety snapshot's "Restore snapshot" control (C3) calls. */
  beginImportFromRaw: (raw: string) => void
  /** Performs the actual `importBackup` write for the currently staged
   * `pending` import. No-op if nothing is pending. */
  confirmImport: () => void
  /** Discards the staged import without writing anything. */
  cancelImport: () => void
}

/**
 * The one place a backup's raw JSON gets turned into a staged, then (once
 * confirmed) committed, `importBackup` call — shared by Settings' "Import
 * backup" control, the pre-import safety snapshot's "Restore snapshot"
 * control, and onboarding's pre-onboarding restore escape hatch, so there is
 * exactly one import code path in the app.
 *
 * Before C1, a selected file was imported immediately with no confirmation —
 * one tap plus one file selection irreversibly discarded everything on the
 * device. Now a valid file is only staged into `pending` (current-vs-file
 * counts, computed from `validation.file.counts` and a live `count()` per
 * table, entirely before any write); `importBackup` itself only runs once
 * the caller's UI calls `confirmImport`. A rejected file still reports its
 * `ValidationFailure` message immediately — there is nothing destructive to
 * confirm there.
 *
 * `onSuccess` fires only when `importBackup` returns `ok: true`, after the
 * success message is set — Settings has no use for it (import there just
 * reports counts in place), onboarding uses it to check whether the restored
 * settings are already fully configured and, if so, leave onboarding.
 */
export function useImportBackup(onSuccess?: () => void): UseImportBackupResult {
  const [message, setMessage] = useState<string | null>(null)
  const [pending, setPending] = useState<PendingImport | null>(null)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setMessage(null)
    setPending(null)
    void stageFile(file)
  }

  async function stageFile(file: File): Promise<void> {
    try {
      const raw = await readFileAsText(file)
      beginImportFromRaw(raw)
    } catch (err) {
      console.error('Reading the selected backup file failed unexpectedly', err)
      setMessage('Import failed unexpectedly. Your existing data was not changed.')
    }
  }

  function beginImportFromRaw(raw: string): void {
    setMessage(null)
    const validation = validateBackup(raw)
    if (!validation.ok) {
      setMessage(validation.failure.message)
      setPending(null)
      return
    }
    void stagePending(raw, validation.file.counts)
  }

  async function stagePending(raw: string, fileCounts: Record<string, number>): Promise<void> {
    const currentCounts = await currentBackupCounts()
    const currentTotal = sumCounts(currentCounts)
    const fileTotal = sumCounts(fileCounts)
    setPending({ raw, currentTotal, fileTotal, hardConfirmRequired: isDrasticDataLoss(currentTotal, fileTotal) })
  }

  function cancelImport(): void {
    setPending(null)
  }

  function confirmImport(): void {
    const staged = pending
    if (!staged) return
    setPending(null)
    void runImport(staged.raw)
  }

  async function runImport(raw: string): Promise<void> {
    try {
      const result = await importBackup(raw, new Date().toISOString())
      if (result.ok) {
        const total = Object.values(result.counts).reduce((sum, count) => sum + count, 0)
        setMessage(`Imported successfully — ${String(total)} record(s) restored.`)
        onSuccess?.()
      } else {
        setMessage(result.failure.message)
      }
    } catch (err) {
      console.error('Backup import failed unexpectedly', err)
      setMessage('Import failed unexpectedly. Your existing data was not changed.')
    }
  }

  return { message, pending, handleFileChange, beginImportFromRaw, confirmImport, cancelImport }
}
