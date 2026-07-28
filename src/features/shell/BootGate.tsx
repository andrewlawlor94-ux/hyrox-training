import { useCallback, useEffect, useState } from 'react'
import type { FC, ReactNode } from 'react'
import { openDb } from '@/data/db'
import { DbUnavailableError } from '@/data/errors'
import type { DbFailureKind } from '@/data/errors'
import { seedIfEmpty } from '@/data/seed/seedRunner'
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
 * Gates the whole app behind `openDb()` + `seedIfEmpty`. Renders plain
 * "Loading…" text (no spinner — decorative animation is banned) while
 * pending, `DbErrorScreen` on failure with a working Retry, and `children`
 * once storage is confirmed available and seeded.
 */
export const BootGate: FC<{ children: ReactNode }> = ({ children }) => {
  const [state, setState] = useState<BootState>({ status: 'pending' })

  const boot = useCallback(() => {
    setState({ status: 'pending' })
    void (async () => {
      try {
        const database = await openDb()
        await seedIfEmpty(database, new Date().toISOString())
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
