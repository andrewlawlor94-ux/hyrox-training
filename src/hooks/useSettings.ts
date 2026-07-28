import { useLiveQuery } from 'dexie-react-hooks'
import { readSettings } from '@/data/repositories'
import type { AppSettings } from '@/data/types'

/**
 * Reactive read of the singleton settings row: re-runs whenever any write
 * touches `db.settings` (via `dexie-react-hooks`' liveQuery tracking),
 * `undefined` while the very first read is still resolving. `BootGate` and
 * `AppShell` both depend on this returning `undefined` (not a stale default)
 * during that first tick, so the onboarding-redirect decision never runs
 * against data that hasn't loaded yet.
 *
 * Uses `readSettings`, never `getSettings`/`ensureSettings` — Dexie runs a
 * live query's callback in a read-only transaction context, and a write
 * inside it throws a `DexieError`. On a genuinely fresh database this fired
 * on every boot: `BootGate` now calls `ensureSettings()` once, outside any
 * live query, before rendering children, so by the time this hook's first
 * read runs the row already exists — but `readSettings` stays the pure,
 * never-writes read regardless, so this hook can never reintroduce the bug.
 */
export function useSettings(): AppSettings | undefined {
  return useLiveQuery(() => readSettings())
}
