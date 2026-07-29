import { useState } from 'react'
import type { ChangeEvent } from 'react'
import { importBackup } from '@/data/backup/importBackup'

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

export interface UseImportBackupResult {
  /** Success count summary or the specific `ValidationFailure` message —
   * whichever the last attempt produced. `null` before any attempt. */
  message: string | null
  handleFileChange: (event: ChangeEvent<HTMLInputElement>) => void
}

/**
 * The one place a `<input type=file>` change event gets turned into an
 * `importBackup` call — shared by Settings' "Import backup" control and
 * onboarding's pre-onboarding restore escape hatch, so there is exactly one
 * import code path in the app. `importBackup` itself (not this hook) is what
 * guarantees a rejected file performs zero writes; this hook only reads the
 * file, calls it, and turns the result into display text.
 *
 * `onSuccess` fires only when `importBackup` returns `ok: true`, after the
 * success message is set — Settings has no use for it (import there just
 * reports counts in place), onboarding uses it to check whether the restored
 * settings are already fully configured and, if so, leave onboarding.
 */
export function useImportBackup(onSuccess?: () => void): UseImportBackupResult {
  const [message, setMessage] = useState<string | null>(null)

  function handleFileChange(event: ChangeEvent<HTMLInputElement>): void {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setMessage(null)
    void importSelectedFile(file)
  }

  async function importSelectedFile(file: File): Promise<void> {
    try {
      const raw = await readFileAsText(file)
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

  return { message, handleFileChange }
}
