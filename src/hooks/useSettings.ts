import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings } from '@/data/repositories'
import type { AppSettings } from '@/data/types'

/**
 * Reactive read of the singleton settings row: re-runs whenever any write
 * touches `db.settings` (via `dexie-react-hooks`' liveQuery tracking),
 * `undefined` while the very first read is still resolving. `BootGate` and
 * `AppShell` both depend on this returning `undefined` (not a stale default)
 * during that first tick, so the onboarding-redirect decision never runs
 * against data that hasn't loaded yet.
 */
export function useSettings(): AppSettings | undefined {
  return useLiveQuery(() => getSettings())
}
