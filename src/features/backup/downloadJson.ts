/**
 * How long the blob URL stays alive after the click. The download must have
 * begun reading it by then; a second is generous for a file of this size and
 * still short enough that the object is not leaked for the session.
 */
const REVOKE_DELAY_MS = 1000

/**
 * Downloads `json` as `filename`. The one implementation — Settings, the
 * pre-import safety snapshot, and the database-error screen all route through
 * here, because all three previously carried their own copy with the same two
 * defects:
 *
 * 1. `URL.revokeObjectURL` fired synchronously on the line after `click()`,
 *    which races the browser's own read of the blob. Revoking before the
 *    download has started reading produces a silently empty or failed save —
 *    the worst possible outcome for the one feature whose entire job is not
 *    losing the athlete's training history. Deferred instead.
 * 2. The anchor was never in the document. Firefox ignores a click on a
 *    detached anchor, so export did nothing there at all.
 *
 * Kept dependency-free and DOM-only so the error screen can use it even when
 * Dexie itself has failed to open.
 */
export function downloadJson(json: string, filename: string): void {
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => { URL.revokeObjectURL(url) }, REVOKE_DELAY_MS)
}
