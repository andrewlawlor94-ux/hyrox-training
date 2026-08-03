import { useCallback, useEffect, useState } from 'react'
import type { FC, ReactNode } from 'react'
import { openDb } from '@/data/db'
import { DbUnavailableError } from '@/data/errors'
import type { DbFailureKind } from '@/data/errors'
import { ensureSettings } from '@/data/repositories'
import { reconcileSeededNames, seedIfEmpty } from '@/data/seed/seedRunner'
import { DbErrorScreen } from './DbErrorScreen'

type BootState = { status: 'pending' } | { status: 'ready' } | { status: 'error'; kind: DbFailureKind }

/** Any boot-time failure that isn't already a classified `DbUnavailableError`
 * (e.g. a bug in `seedIfEmpty`) still gets a screen instead of crashing to a
 * blank page — "boot must never blank-screen" is a stronger guarantee than
 * "every `DbUnavailableError` gets a message". */
function toBootFailureKind(err: unknown): DbFailureKind {
  return err instanceof DbUnavailableError ? err.kind : 'unknown'
}

/**
 * Gates the whole app behind `openDb()` + `seedIfEmpty` + `ensureSettings`.
 * Renders plain "Loading…" text (no spinner — decorative animation is
 * banned) while pending, `DbErrorScreen` on failure with a working Retry,
 * and `children` once storage is confirmed available, seeded, and the
 * settings row exists.
 *
 * `ensureSettings()` runs here — a normal async call, not inside any
 * `liveQuery` — specifically so the settings row is guaranteed to exist
 * before `useSettings`'s live query ever runs. `useSettings` itself now
 * only ever calls the pure, non-writing `readSettings`, so this isn't load-
 * bearing for correctness any more (a fresh database no longer crashes
 * either way) — but it means the common case never even takes the "row
 * doesn't exist yet, fall back to an in-memory default" branch at all.
 */
export const BootGate: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<BootState>({ status: 'pending' })

  const boot = useCallback(() => {
    setState({ status: 'pending' })
    void (async () => {
      try {
        const database = await openDb()
        const now = new Date().toISOString()
        await seedIfEmpty(database, now)
        // Carries seeded-exercise RENAMES to databases seeded before them.
        // Cannot live inside `seedIfEmpty`, whose contract is to never touch a
        // non-empty table; see `reconcileSeededNames`.
        await reconcileSeededNames(database, now)
        await ensureSettings()
        setState({ status: 'ready' })
      } catch (err) {
        setState({ status: 'error', kind: toBootFailureKind(err) })
      }
    })()
  }, [])

  useEffect(() => {
    boot()
  }, [boot])

  if (state.status === 'pending') return <p className="boot-gate__loading">Loading…</p>
  if (state.status === 'error') return <DbErrorScreen kind={state.kind} onRetry={boot} />
  return <>{children}</>
}
