import { createContext, useContext } from 'react'

export interface AutosaveScope {
  /** Adds `flush` to the scope and returns its own removal function (shaped
   * for direct use as a `useEffect` cleanup). */
  register: (flush: () => Promise<void>) => () => void
  /** Awaits every registered autosave's pending writes. Never rejects —
   * `useAutosave.flush` already absorbs its own failures. */
  flushAll: () => Promise<void>
}

/**
 * Lets a component that ENDS a workout wait for edits being typed elsewhere in
 * the tree to land, without the two components needing to know about each
 * other. `useAutosave` is called once per block (strength card, run block,
 * station block) deep inside `ExerciseCard`, so a debounced weight can still be
 * in flight when the athlete taps "Completed" in `WorkoutFooter` — and
 * completion sets `frozen: true`, after which that pending `upsertSet` throws
 * `HistoryImmutableError` and the athlete's last entry is gone. Awaiting
 * `flushAll()` before the completion write closes that window.
 *
 * Deliberately a registry of flush functions rather than one lifted
 * `useAutosave`: each block keeps its own independent debounce timers (an edit
 * in one block must not reset another's), and blocks mount and unmount as the
 * live query re-emits.
 *
 * The provider lives in `AutosaveScopeProvider.tsx` — separate file so this one
 * exports no component and stays hot-reload friendly.
 */
export const AutosaveScopeContext = createContext<AutosaveScope | null>(null)

/** `null` outside a provider — every consumer treats a missing scope as "no
 * pending writes to wait for" so blocks stay independently mountable in tests. */
export function useAutosaveScope(): AutosaveScope | null {
  return useContext(AutosaveScopeContext)
}
