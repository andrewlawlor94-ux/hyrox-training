import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { Button } from '@/components'
import { resetDatabase } from '@/data/db'
import { restoreSeedPlanPreservingHistory, updateSettings } from '@/data/repositories'
import type { AppSettings } from '@/data/types'
import { exportBackup } from '@/data/backup/exportBackup'
import { ImportBackupButton } from '@/features/backup/ImportBackupButton'
import { useImportBackup } from '@/features/backup/useImportBackup'
import { useToday } from '@/hooks/useToday'

/** No build-time version injection exists in this project yet (see
 * vite.config.ts) — kept in sync with package.json's "version" by hand. */
const APP_VERSION = '1.0.0'
const EXPORT_FILENAME = 'hyrox-training-backup.json'
/** Deliberately not a single keystroke — the whole point is that resetting
 * cannot happen by an accidental tap. */
const RESET_CONFIRMATION_PHRASE = 'DELETE'

type StorageStatus = 'checking' | 'granted' | 'denied' | 'unsupported'

interface StorageManagerLike {
  persist?: () => Promise<boolean>
}

function storageStatusText(status: StorageStatus): string {
  if (status === 'granted') return 'Granted'
  if (status === 'denied') return 'Not granted'
  if (status === 'unsupported') return 'Not supported on this device'
  return 'Checking…'
}

function triggerDownload(json: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = EXPORT_FILENAME
  link.click()
  URL.revokeObjectURL(url)
}

function logAndIgnore(context: string) {
  return (err: unknown): void => { console.error(context, err) }
}

interface BackupSettingsProps {
  settings: AppSettings
}

/**
 * Task 17: export/import, restore-the-seed-plan, and the one destructive
 * path (full reset), plus the storage-persistence status the athlete needs
 * to judge how much they should trust this device to keep their data.
 *
 * Everything here is local-only offline data — there is no server copy —
 * which is why "export a backup" is treated as a first-class, low-friction
 * action rather than something buried behind a settings sub-page.
 */
export const BackupSettings: FC<BackupSettingsProps> = ({ settings }) => {
  const today = useToday()
  const [storageStatus, setStorageStatus] = useState<StorageStatus>('checking')
  const { message: importMessage, handleFileChange } = useImportBackup()
  const [restoreMessage, setRestoreMessage] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')

  useEffect(() => {
    const storage = (navigator as { storage?: StorageManagerLike }).storage
    if (!storage?.persist) {
      setStorageStatus('unsupported')
      return
    }
    storage.persist()
      .then((granted) => { setStorageStatus(granted ? 'granted' : 'denied') })
      .catch(() => { setStorageStatus('denied') })
  }, [])

  async function handleExport(): Promise<void> {
    const now = new Date().toISOString()
    const { json } = await exportBackup(now, APP_VERSION)
    triggerDownload(json)
    await updateSettings({ lastBackupAt: now })
  }

  async function handleRestorePlan(): Promise<void> {
    setRestoreMessage(null)
    try {
      await restoreSeedPlanPreservingHistory({ today, now: new Date().toISOString() })
      setRestoreMessage('Restored the original 24-week plan. Completed history was preserved.')
    } catch (err) {
      logAndIgnore('Restoring the seed plan failed')(err)
      setRestoreMessage('Could not restore the plan.')
    }
  }

  async function handleReset(): Promise<void> {
    await resetDatabase()
    window.location.reload()
  }

  return (
    <section className="settings-screen__section">
      <h2>Backup &amp; restore</h2>
      <p className="settings-screen__note">
        This app only keeps your training data on this device — clearing site data, reinstalling,
        or a low-storage cleanup (especially on iOS) can erase it for good. Export a backup
        regularly and keep the file somewhere safe.
      </p>
      <p className="settings-screen__status">{`Persistent storage: ${storageStatusText(storageStatus)}`}</p>
      <p className="settings-screen__status">
        {settings.lastBackupAt ? `Last backup: ${new Date(settings.lastBackupAt).toLocaleString()}` : 'No backup yet.'}
      </p>

      <div className="settings-screen__actions">
        <Button onClick={() => { void handleExport() }}>Export backup</Button>
        <ImportBackupButton triggerLabel="Import backup" ariaLabel="Import backup" onFileChange={handleFileChange} />
      </div>
      {importMessage && <p role="status" className="settings-screen__note">{importMessage}</p>}

      <div className="settings-screen__actions">
        <Button variant="secondary" onClick={() => { void handleRestorePlan() }}>
          Restore original 24-week plan
        </Button>
      </div>
      {restoreMessage && <p role="status" className="settings-screen__note">{restoreMessage}</p>}

      <div className="settings-screen__reset">
        <p className="settings-screen__note">
          Resetting erases everything on this device and can&apos;t be undone. Type{' '}
          {RESET_CONFIRMATION_PHRASE} below to enable the button.
        </p>
        <div className="onboarding-field">
          <label htmlFor="settings-reset-confirm" className="onboarding-field__label">
            {`Type ${RESET_CONFIRMATION_PHRASE} to confirm`}
          </label>
          <input
            id="settings-reset-confirm"
            type="text"
            className="onboarding-field__input"
            value={confirmText}
            onChange={(event) => { setConfirmText(event.target.value) }}
          />
        </div>
        <Button
          variant="danger"
          disabled={confirmText !== RESET_CONFIRMATION_PHRASE}
          onClick={() => { void handleReset() }}
        >
          Reset application data
        </Button>
      </div>
    </section>
  )
}
