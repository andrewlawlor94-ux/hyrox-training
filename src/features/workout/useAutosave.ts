import { useCallback, useEffect, useRef } from 'react'
import { AUTOSAVE_DEBOUNCE_MS } from './constants'
import { useAutosaveScope } from './autosaveScope'

interface PendingEntry {
  timer: ReturnType<typeof setTimeout>
  save: () => Promise<void>
}

/** Dexie surfaces a closed database as a `DatabaseClosedError`, identified by
 * `name` rather than by class so this holds across Dexie's wrapped/inner error
 * shapes without importing Dexie into a component module. */
function isDatabaseClosed(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'name' in err
    && (err as { name?: unknown }).name === 'DatabaseClosedError'
}

export interface UseAutosaveResult {
  /** (Re)schedules `save` for `key`, cancelling any timer already pending
   * for that key. Call this on every keystroke — the closure passed in
   * should capture the LATEST merged value, since only the most recent
   * `save` per key ever runs. */
  schedule: (key: string, save: () => Promise<void>) => void
  /** Runs `key`'s pending save immediately (if any) and removes it from the
   * queue. Used on blur, where the spec requires an immediate flush rather
   * than waiting out the debounce. */
  flushKey: (key: string) => Promise<void>
  /** Flushes every pending key. Used on unmount and on `visibilitychange`
   * going hidden — the two triggers that aren't scoped to one field. */
  flush: () => Promise<void>
}

/**
 * Generic debounced multi-key write queue (§ autosave). Deliberately not
 * `StrengthSet`-shaped: each `key` is whatever identifies the row being
 * edited (a set id, a station-log id, ...) and `save` is a closure the
 * caller builds fresh on every change, so this hook has no knowledge of what
 * it's persisting. Nothing here holds the athlete's actual field values —
 * only a `Map` of pending save closures — so "no React state holds a value
 * absent from the database after a flush" is true by construction: once
 * flushed, the entry is gone, and the value it wrote lives only in
 * IndexedDB from that point on.
 */
export function useAutosave(debounceMs = AUTOSAVE_DEBOUNCE_MS): UseAutosaveResult {
  const pending = useRef(new Map<string, PendingEntry>())
  /**
   * Saves that have STARTED but not finished, per key.
   *
   * Without this, `flushKey` returned immediately whenever the pending map held
   * no timer for the key — including when a save for that key was still in
   * flight — and that was a real data-loss race, not a theoretical one:
   *
   *   1. the athlete types reps, which schedules a debounced save whose closure
   *      carries the row as it was, `isCompleted: false` and all;
   *   2. tapping Complete blurs the input first, so `handleBlur` fires
   *      `flushKey` WITHOUT awaiting it — the entry leaves the map and the write
   *      begins;
   *   3. `handleComplete`'s own `await flushKey(...)` finds an empty map and
   *      returns instantly, believing everything is settled;
   *   4. `completeSet` writes `isCompleted: true`;
   *   5. the step-2 write lands last and puts `isCompleted: false` back.
   *
   * The set silently un-completes. Awaiting the in-flight promise closes it.
   */
  const inFlight = useRef(new Map<string, Promise<void>>())

  // Never rejects: a failed write has no UI left to report to by the time
  // most callers reach it (a debounced timer firing, a blur handler, an
  // unmount cleanup), so letting it throw would only surface as an unhandled
  // promise rejection rather than anything the athlete could act on. Logged
  // for visibility instead.
  const flushKey = useCallback(async (key: string): Promise<void> => {
    const entry = pending.current.get(key)
    if (!entry) {
      // Nothing scheduled — but a save started by an earlier, un-awaited flush
      // may still be running. Wait for it rather than reporting "settled".
      await inFlight.current.get(key)
      return
    }
    clearTimeout(entry.timer)
    pending.current.delete(key)
    try {
      const running = entry.save()
      inFlight.current.set(key, running.then(() => undefined, () => undefined))
      await running
    } catch (err) {
      // A flush racing a closing database is expected, not a fault: the unmount
      // handler fires while the athlete is navigating away (and in tests while
      // the fixture database is torn down), so the write legitimately loses. Any
      // other failure is real and must stay loud — swallowing it wholesale would
      // hide genuine data loss, which is the one thing this app cannot afford.
      if (isDatabaseClosed(err)) return
      console.error('Autosave write failed', err)
    } finally {
      inFlight.current.delete(key)
    }
  }, [])

  const flush = useCallback(async (): Promise<void> => {
    const keys = [...pending.current.keys()]
    await Promise.all(keys.map((key) => flushKey(key)))
  }, [flushKey])

  const schedule = useCallback((key: string, save: () => Promise<void>): void => {
    const existing = pending.current.get(key)
    if (existing) clearTimeout(existing.timer)
    const timer = setTimeout(() => { void flushKey(key) }, debounceMs)
    pending.current.set(key, { timer, save })
  }, [debounceMs, flushKey])

  useEffect(() => {
    function handleVisibilityChange(): void {
      if (document.visibilityState === 'hidden') void flush()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      void flush()
    }
  }, [flush])

  // Joins the enclosing `AutosaveScopeProvider` (if any) so the component that
  // completes the workout can await this queue before freezing the instance —
  // a pending write that lands after `frozen: true` throws and the edit is
  // lost. No-ops outside a provider.
  const scope = useAutosaveScope()
  useEffect(() => scope?.register(flush), [scope, flush])

  return { schedule, flushKey, flush }
}
