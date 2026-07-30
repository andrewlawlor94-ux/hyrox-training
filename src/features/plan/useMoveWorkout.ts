import { useCallback, useState } from 'react'
import { moveWorkoutManually, previewMoveConflicts } from '@/data/repositories'
import type { ISODate } from '@/data/types'

export interface UseMoveWorkoutResult {
  /** Non-null while a move is awaiting confirmation, holding every specific
   * conflict `previewMoveConflicts` found. */
  conflicts: string[] | null
  isBusy: boolean
  error: string | null
  /** Previews conflicts for `date`. Commits straight away when there are none;
   * otherwise stores them for `proceed`/`cancel` to resolve. */
  request: (date: ISODate) => Promise<void>
  /** Commits the move the athlete was warned about (§15: a manual move
   * overrides hard recovery conflicts, but must warn first). */
  proceed: () => Promise<void>
  cancel: () => void
}

/**
 * The preview-then-commit move flow, shared by every entry point rather than
 * reimplemented per screen. Extracted when Home gained its own "Do this today"
 * and "Move" controls: the conflict warning is the safety property here (§15),
 * and a second copy of the flow is a second chance to forget it.
 *
 * `instanceId` may be `undefined` so callers can invoke this unconditionally —
 * a card that sometimes has no session to move still has to call the hook on
 * every render. `request` no-ops in that case rather than throwing.
 */
export function useMoveWorkout(args: {
  instanceId: string | undefined
  today: ISODate
  onMoved?: () => void
}): UseMoveWorkoutResult {
  const { instanceId, today, onMoved } = args
  const [conflicts, setConflicts] = useState<string[] | null>(null)
  const [pendingDate, setPendingDate] = useState<ISODate | null>(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const commit = useCallback(async (targetDate: ISODate): Promise<void> => {
    if (instanceId === undefined) return
    setIsBusy(true)
    setError(null)
    try {
      await moveWorkoutManually({ instanceId, date: targetDate, now: new Date().toISOString(), today })
      setConflicts(null)
      setPendingDate(null)
      onMoved?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not move this workout.')
    } finally {
      setIsBusy(false)
    }
  }, [instanceId, today, onMoved])

  const request = useCallback(async (date: ISODate): Promise<void> => {
    if (instanceId === undefined || !date) return
    setIsBusy(true)
    setError(null)
    setPendingDate(date)
    try {
      const found = await previewMoveConflicts({ instanceId, date })
      if (found.length === 0) {
        await commit(date)
        return
      }
      setConflicts(found)
      setIsBusy(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not check this date.')
      setIsBusy(false)
    }
  }, [instanceId, commit])

  const proceed = useCallback(async (): Promise<void> => {
    if (pendingDate === null) return
    await commit(pendingDate)
  }, [pendingDate, commit])

  const cancel = useCallback((): void => {
    setConflicts(null)
    setPendingDate(null)
  }, [])

  return { conflicts, isBusy, error, request, proceed, cancel }
}
