import type { FC, ReactNode } from 'react'
import { useCallback, useMemo, useRef } from 'react'
import type { AutosaveScope } from './autosaveScope'
import { AutosaveScopeContext } from './autosaveScope'

/** Provides the registry described in `autosaveScope.ts`. Must enclose both the
 * blocks that own autosave queues and whatever component ends the session. */
export const AutosaveScopeProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const flushes = useRef(new Set<() => Promise<void>>())

  const register = useCallback((flush: () => Promise<void>) => {
    flushes.current.add(flush)
    return () => { flushes.current.delete(flush) }
  }, [])

  const flushAll = useCallback(async () => {
    await Promise.all([...flushes.current].map((flush) => flush()))
  }, [])

  const value = useMemo<AutosaveScope>(() => ({ register, flushAll }), [register, flushAll])

  return <AutosaveScopeContext.Provider value={value}>{children}</AutosaveScopeContext.Provider>
}
