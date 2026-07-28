import { useState } from 'react'
import type { FC } from 'react'
import { Button } from '@/components'
import { exportRawSnapshot } from '@/data/db'
import type { DbFailureKind } from '@/data/errors'

const EXPORT_FILENAME = 'hyrox-training-export.json'

interface Copy {
  title: string
  message: string
}

/** One specific, actionable message per `DbFailureKind` — never a generic
 * "something went wrong" for a storage failure, per the boot-resilience
 * requirement. */
const COPY: Record<DbFailureKind, Copy> = {
  quotaExceeded: {
    title: 'Storage is full',
    message: 'Your device is out of storage space, so the training log can’t be opened. Free up space (photos, downloads, unused apps) and retry, or export what’s still readable below.',
  },
  upgradeBlocked: {
    title: 'Update blocked by another tab',
    message: 'An older copy of this app is open in another tab or window and is blocking this update. Close every other HYROX Training tab or window, then retry.',
  },
  accessDenied: {
    title: 'Storage access denied',
    message: 'Your browser is blocking local storage for this app — common in Private/Incognito mode or with strict privacy settings. Allow storage for this site, then retry.',
  },
  unknown: {
    title: 'Training log unavailable',
    message: 'Something prevented the training log from opening. Retry, or export what’s still readable below if the problem persists.',
  },
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

/**
 * Rendered by `BootGate` whenever `openDb()` fails, instead of a blank
 * screen. Copy is specific to `kind`; Retry re-runs the boot sequence;
 * Export makes a best-effort attempt to read whatever object stores are
 * still reachable through the native `indexedDB` API (bypassing Dexie's own
 * schema negotiation, which may be exactly what's broken) and offers the
 * result as a downloadable JSON file.
 */
export const DbErrorScreen: FC<{ kind: DbFailureKind; onRetry: () => void }> = ({ kind, onRetry }) => {
  const [exportError, setExportError] = useState<string | null>(null)
  const copy = COPY[kind]

  const handleExport = async (): Promise<void> => {
    setExportError(null)
    try {
      const snapshot = await exportRawSnapshot()
      triggerDownload(JSON.stringify(snapshot))
    } catch {
      setExportError('Export failed. Free up storage or close other tabs, then try again.')
    }
  }

  return (
    <div className="db-error-screen">
      <h1 className="db-error-screen__title">{copy.title}</h1>
      <p className="db-error-screen__message">{copy.message}</p>
      <div className="db-error-screen__actions">
        <Button onClick={onRetry}>Retry</Button>
        <Button variant="secondary" onClick={() => { void handleExport() }}>
          Export what we can
        </Button>
      </div>
      {exportError ? <p className="db-error-screen__export-error">{exportError}</p> : null}
    </div>
  )
}
