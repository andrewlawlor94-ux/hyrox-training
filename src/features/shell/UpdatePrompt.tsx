import type { FC } from 'react'
import { useState } from 'react'
import { Button } from '@/components'
import { applyPwaUpdate, usePwaUpdateAvailable } from '@/pwa'

/**
 * Non-destructive update banner (D9). `vite.config.ts` sets
 * `registerType: 'prompt'`, so a new service worker installs and then waits
 * rather than swapping itself in — this card is the only thing that ever
 * tells it to proceed. "Update now" calls `applyPwaUpdate` (posts
 * SKIP_WAITING to the waiting worker and reloads once it takes control);
 * "Later" just hides the card for the rest of this session, nothing more.
 * Neither path touches IndexedDB: the update mechanism is entirely
 * service-worker/Cache Storage, so an athlete's logged workout history is
 * never at risk from tapping either button.
 *
 * Renders nothing at all (not a hidden/zero-height element) until an update
 * is actually waiting, so it never occupies layout or the accessibility
 * tree on an ordinary visit.
 */
export const UpdatePrompt: FC = () => {
  const updateAvailable = usePwaUpdateAvailable()
  const [dismissed, setDismissed] = useState(false)

  if (!updateAvailable || dismissed) return null

  return (
    <div className="update-prompt" role="status" aria-live="polite">
      <p className="update-prompt__message">
        A new version of the app is ready. Your workout history is saved and won&apos;t be affected.
      </p>
      <div className="update-prompt__actions">
        <Button size="sm" onClick={() => { void applyPwaUpdate() }}>Update now</Button>
        <Button variant="quiet" size="sm" onClick={() => { setDismissed(true) }}>Later</Button>
      </div>
    </div>
  )
}
