import type { FC } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button } from '@/components'
import { getSafetyBackup } from '@/data/repositories'
import { ImportConfirmSheet } from './ImportConfirmSheet'
import { useImportBackup } from './useImportBackup'
import { downloadJson } from './downloadJson'

const SNAPSHOT_FILENAME = 'hyrox-training-pre-import-snapshot.json'

/**
 * Surfaces `importBackup`'s pre-import safety snapshot (C3): before this, the
 * only non-test reference to `safetyBackups` anywhere in `src` was a comment
 * describing it as "the last chance to recover today's data" — no screen
 * listed, restored, or exported it, so recovering from a mistaken import
 * needed DevTools. This makes it a normal Settings item: when it exists, it
 * can be exported like any other backup, or restored through the same
 * staged-confirmation `useImportBackup` path every other import uses (so
 * restoring it is itself never a silent, un-confirmed overwrite).
 *
 * `useLiveQuery` (not a manual effect + state) so this updates the instant
 * ANY import writes a new snapshot — including one driven by Settings' own
 * main "Import backup" control, a completely different `useImportBackup`
 * instance than this panel's own "Restore snapshot" one.
 */
export const SafetySnapshotPanel: FC = () => {
  const snapshot = useLiveQuery(() => getSafetyBackup(), [])
  const { message, pending, beginImportFromRaw, confirmImport, cancelImport } = useImportBackup()

  if (snapshot === undefined) return null

  return (
    <div className="settings-screen__section">
      <h2>Pre-import snapshot</h2>
      {!snapshot ? (
        <p className="settings-screen__note">
          No snapshot yet — one is saved automatically the moment you first import a backup.
        </p>
      ) : (
        <>
          <p className="settings-screen__status">
            {`Saved automatically before the last import, on ${new Date(snapshot.at).toLocaleString()}.`}
          </p>
          <div className="settings-screen__actions">
            <Button variant="secondary" onClick={() => { downloadJson(snapshot.json, SNAPSHOT_FILENAME) }}>
              Export snapshot
            </Button>
            <Button variant="secondary" onClick={() => { beginImportFromRaw(snapshot.json) }}>
              Restore snapshot
            </Button>
          </div>
        </>
      )}
      {message && <p role="status" className="settings-screen__note">{message}</p>}
      <ImportConfirmSheet pending={pending} onConfirm={confirmImport} onCancel={cancelImport} />
    </div>
  )
}
