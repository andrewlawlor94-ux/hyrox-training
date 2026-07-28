import { useEffect, useState } from 'react'
import type { ISODate } from '@/data/types'

const DATE_FIELD_WIDTH = 2

/** The device's local calendar date, `YYYY-MM-DD`. This is the ONLY place in
 * the whole app that reads the ambient clock to derive "today" — every
 * domain call and every repository `today`/`now` argument must trace back to
 * this hook, never to a fresh `new Date()` elsewhere. */
function localTodayISO(): ISODate {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(DATE_FIELD_WIDTH, '0')
  const day = String(now.getDate()).padStart(DATE_FIELD_WIDTH, '0')
  return `${year}-${month}-${day}`
}

/** Milliseconds until the next local midnight, so a timer fired at exactly
 * that boundary re-derives `today` without waiting for a `visibilitychange`
 * that may never come (e.g. the app left open and in the foreground
 * overnight). */
function msUntilNextLocalMidnight(): number {
  const now = new Date()
  const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return nextMidnight.getTime() - now.getTime()
}

/**
 * Today's date, recomputed whenever the tab becomes visible again (the
 * device may have slept past midnight) and via a timeout scheduled for the
 * next local midnight while the tab stays open and foregrounded. Every
 * consumer receives the SAME string for the lifetime of a render — no
 * component below this hook may call `new Date()` itself to answer "what
 * day is it".
 */
export function useToday(): ISODate {
  const [today, setToday] = useState<ISODate>(localTodayISO)

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>

    function scheduleMidnightRefresh(): void {
      timeoutId = setTimeout(() => {
        setToday(localTodayISO())
        scheduleMidnightRefresh()
      }, msUntilNextLocalMidnight())
    }

    function handleVisibilityChange(): void {
      if (document.visibilityState === 'visible') setToday(localTodayISO())
    }

    scheduleMidnightRefresh()
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return today
}
