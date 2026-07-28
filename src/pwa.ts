import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

/**
 * Wraps `registerSW` from `virtual:pwa-register` (vite-plugin-pwa's client)
 * behind a subscribable "update available" signal, so the rest of the app
 * never touches the raw service-worker API directly.
 *
 * `vite.config.ts` sets `registerType: 'prompt'` (D9): a new service worker
 * installs and then WAITS rather than taking over on its own. This module
 * only flips a flag when that happens (`onNeedRefresh`) and, when told to,
 * asks the waiting worker to activate. It never opens, reads, or clears
 * IndexedDB — the update mechanism lives entirely in the service
 * worker/Cache Storage layer, so an athlete's logged workout history is
 * never at risk from an update.
 */

type Listener = () => void

let updateAvailable = false
let skipWaitingAndReload: ((reloadPage?: boolean) => Promise<void>) | undefined
const listeners = new Set<Listener>()

function setUpdateAvailable(next: boolean): void {
  if (updateAvailable === next) return
  updateAvailable = next
  for (const listener of listeners) listener()
}

/**
 * Registers the service worker for this tab. Safe to call more than once
 * (e.g. React StrictMode's double-invoked effects) — the underlying
 * `registerSW` call only actually happens the first time.
 */
export function initPwaUpdateWatcher(): void {
  if (skipWaitingAndReload) return
  skipWaitingAndReload = registerSW({
    immediate: true,
    onNeedRefresh() {
      setUpdateAvailable(true)
    },
  })
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): boolean {
  return updateAvailable
}

/** True once a new service worker has installed and is waiting to activate. */
export function usePwaUpdateAvailable(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}

/**
 * Tells the waiting service worker to skip waiting and take control, then
 * reloads the page once it does. Talks only to the service worker via
 * `registerSW`'s own returned function — never touches IndexedDB.
 */
export async function applyPwaUpdate(): Promise<void> {
  if (!skipWaitingAndReload) return
  await skipWaitingAndReload()
  setUpdateAvailable(false)
}

/**
 * Test-only escape hatch: this module holds its state at module scope (one
 * registration per tab, by design), so tests that exercise it more than once
 * need a way to reset between cases.
 */
export function __resetPwaUpdateStateForTests(): void {
  updateAvailable = false
  skipWaitingAndReload = undefined
  listeners.clear()
}
