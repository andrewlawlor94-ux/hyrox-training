import '@/styles/global.css'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, resetDatabase } from '@/data/db'
import { getTimerState, startTimer, updateSettings } from '@/data/repositories'
import { RestTimerBar } from '../RestTimerBar'

const T0 = '2026-07-27T10:00:00.000Z'
const T0_PLUS_30S = '2026-07-27T10:00:30.000Z'
const T0_PLUS_95S = '2026-07-27T10:01:35.000Z'
/* A 60s timer started at T0 expires at T0+60s, so these are 10s and 60s past
 * expiry. Both now count as "you just missed it" — the linger window is measured
 * from when the expiry is NOTICED, so a rest that ran out while the athlete was
 * in another app survives long enough to be read. `T0_PLUS_2H` is past
 * `STALE_EXPIRY_SEC`, where an expiry stops being a missed rest and becomes
 * yesterday's history. */
const T0_PLUS_70S = '2026-07-27T10:01:10.000Z'
const T0_PLUS_120S = '2026-07-27T10:02:00.000Z'
const T0_PLUS_155S = '2026-07-27T10:02:35.000Z'
const T0_PLUS_2H = '2026-07-27T12:00:00.000Z'
const REAL_WAIT_TIMEOUT_MS = 2000

/** jsdom doesn't resolve CSS custom properties in getComputedStyle — same
 * technique as shell.test.tsx / onboarding.test.tsx: assert the raw
 * declaration text references the token, not a resolved pixel value. */
function resolvedPx(element: Element, property: string): number {
  const raw = getComputedStyle(element).getPropertyValue(property).trim()
  const varMatch = /^var\((--[\w-]+)\)$/.exec(raw)
  const varName = varMatch?.[1]
  const value = varName ? getComputedStyle(document.documentElement).getPropertyValue(varName).trim() : raw
  return Number.parseFloat(value)
}

beforeEach(async () => {
  await resetDatabase()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(T0))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('RestTimerBar', () => {
  it('is absent when no timer row exists', () => {
    const { container } = render(<RestTimerBar />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the label and MM:SS with aria-live polite once a timer is running', async () => {
    await startTimer({ label: 'Back squat', totalSec: 90, now: T0 })
    render(<RestTimerBar />)

    await screen.findByText('Back squat')
    const countdown = await screen.findByText('1:30')
    expect(countdown).toHaveAttribute('aria-live', 'polite')
  })

  it('renders Pause, +30s, −30s, and Skip as buttons with accessible names, each at least 44×44px', async () => {
    await startTimer({ label: 'Back squat', totalSec: 90, now: T0 })
    render(<RestTimerBar />)
    await screen.findByText('Back squat')

    const controls = [
      screen.getByRole('button', { name: /pause/i }),
      screen.getByRole('button', { name: /\+30s/i }),
      screen.getByRole('button', { name: /-30s|−30s/i }),
      screen.getByRole('button', { name: /skip/i }),
    ]
    for (const control of controls) {
      expect(resolvedPx(control, 'min-height')).toBeGreaterThanOrEqual(44)
      expect(resolvedPx(control, 'min-width')).toBeGreaterThanOrEqual(44)
    }
  })

  it('+30s increases the displayed remainder', async () => {
    await startTimer({ label: 'Back squat', totalSec: 90, now: T0 })
    render(<RestTimerBar />)
    await screen.findByText('1:30')

    await userEvent.click(screen.getByRole('button', { name: /\+30s/i }))
    await screen.findByText('2:00')
  })

  it('−30s decreases the displayed remainder and clamps at 0:00', async () => {
    await startTimer({ label: 'Back squat', totalSec: 10, now: T0 })
    render(<RestTimerBar />)
    await screen.findByText('0:10')

    await userEvent.click(screen.getByRole('button', { name: /-30s|−30s/i }))
    await screen.findByText('0:00')
  })

  it('Skip removes the bar and clears the persisted row', async () => {
    await startTimer({ label: 'Back squat', totalSec: 90, now: T0 })
    const { container } = render(<RestTimerBar />)
    await screen.findByText('Back squat')

    await userEvent.click(screen.getByRole('button', { name: /skip/i }))

    await waitFor(() => expect(container).toBeEmptyDOMElement())
    expect(await getTimerState()).toBeUndefined()
  })

  it('remounting with the same database restores an accurate countdown (refresh survival)', async () => {
    await startTimer({ label: 'Back squat', totalSec: 300, now: T0 })
    const { unmount } = render(<RestTimerBar />)
    await screen.findByText('5:00')
    unmount()

    vi.setSystemTime(new Date(T0_PLUS_95S))
    render(<RestTimerBar />)
    await screen.findByText('3:25')
  })

  it('pausing, unmounting, and remounting shows the paused remainder unchanged', async () => {
    await startTimer({ label: 'Back squat', totalSec: 90, now: T0 })
    const { unmount } = render(<RestTimerBar />)
    await screen.findByText('1:30')

    vi.setSystemTime(new Date(T0_PLUS_30S))
    await userEvent.click(screen.getByRole('button', { name: /pause/i }))
    await screen.findByText('1:00')
    unmount()

    vi.setSystemTime(new Date(T0_PLUS_95S))
    render(<RestTimerBar />)
    await screen.findByText('1:00')
  })

  it('the bar sits above the bottom nav and pads for --safe-bottom', async () => {
    await startTimer({ label: 'Back squat', totalSec: 90, now: T0 })
    const { container } = render(<RestTimerBar />)
    await screen.findByText('Back squat')

    const bar = container.firstElementChild as Element
    const raw = getComputedStyle(bar).getPropertyValue('bottom')
    expect(raw).toContain('--nav-height')
    expect(raw).toContain('--safe-bottom')
  })

  it('sound and vibration stay off by default: starting and expiring a timer calls neither navigator.vibrate nor any audio constructor', async () => {
    const vibrateSpy = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrateSpy, configurable: true })
    const audioCtorSpy = vi.fn()
    vi.stubGlobal('AudioContext', audioCtorSpy)

    await startTimer({ label: 'Back squat', totalSec: 1, now: T0 })
    render(<RestTimerBar />)
    await screen.findByText('0:01')

    vi.setSystemTime(new Date(T0_PLUS_30S))
    await waitFor(() => expect(screen.getByText('0:00')).toBeInTheDocument(), { timeout: REAL_WAIT_TIMEOUT_MS })

    expect(vibrateSpy).not.toHaveBeenCalled()
    expect(audioCtorSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('with restVibrationEnabled true and navigator.vibrate present, expiry calls it exactly once', async () => {
    await updateSettings({ restVibrationEnabled: true })
    const vibrateSpy = vi.fn()
    Object.defineProperty(navigator, 'vibrate', { value: vibrateSpy, configurable: true })

    await startTimer({ label: 'Back squat', totalSec: 1, now: T0 })
    render(<RestTimerBar />)
    await screen.findByText('0:01')

    vi.setSystemTime(new Date(T0_PLUS_30S))
    await waitFor(() => expect(vibrateSpy).toHaveBeenCalledTimes(1), { timeout: REAL_WAIT_TIMEOUT_MS })

    // Stays at exactly one call even after further re-renders/ticks.
    await act(async () => {
      await new Promise((resolve) => { setTimeout(resolve, 300) })
    })
    expect(vibrateSpy).toHaveBeenCalledTimes(1)
  })

  it('with restVibrationEnabled true and navigator.vibrate absent (iOS), nothing throws', async () => {
    await updateSettings({ restVibrationEnabled: true })
    const original = (navigator as { vibrate?: unknown }).vibrate
    Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true })

    await startTimer({ label: 'Back squat', totalSec: 1, now: T0 })
    render(<RestTimerBar />)
    await screen.findByText('0:01')

    vi.setSystemTime(new Date(T0_PLUS_30S))
    await waitFor(() => expect(screen.getByText('0:00')).toBeInTheDocument(), { timeout: REAL_WAIT_TIMEOUT_MS })

    Object.defineProperty(navigator, 'vibrate', { value: original, configurable: true })
  })

  it('reaching zero does not navigate, open a dialog, or depend on the Notification API', async () => {
    await startTimer({ label: 'Back squat', totalSec: 1, now: T0 })
    render(<RestTimerBar />)
    await screen.findByText('0:01')

    vi.setSystemTime(new Date(T0_PLUS_30S))
    await waitFor(() => expect(screen.getByText('0:00')).toBeInTheDocument(), { timeout: REAL_WAIT_TIMEOUT_MS })

    expect(screen.queryByRole('dialog')).toBeNull()
    expect(window.location.pathname).toBe('/')
  })

  // Before this, an expired timer sat at 0:00 across every screen forever,
  // with a Pause button, until the athlete tapped Skip.
  describe('expiry', () => {
    it('reads as finished rather than as a stuck timer, and drops the controls that no longer mean anything', async () => {
      await startTimer({ label: 'Back squat', totalSec: 60, now: T0 })
      render(<RestTimerBar />)
      await screen.findByText('1:00')

      // 10s past expiry, so it says how long ago rather than implying it just
      // went off — the athlete may have been in another app for those 10s.
      vi.setSystemTime(new Date(T0_PLUS_70S))
      await waitFor(() => expect(screen.getByText('Rest finished 0:10 ago')).toBeInTheDocument(), { timeout: REAL_WAIT_TIMEOUT_MS })

      expect(screen.getByText('0:00')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /pause/i })).toBeNull()
      expect(screen.queryByRole('button', { name: '-30s' })).toBeNull()
      // "+30s" stays: needing a bit more rest at 0:00 is a real thing to want.
      expect(screen.getByRole('button', { name: '+30s' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument()

      // Still inside the linger window, so the row is deliberately still there.
      expect(await getTimerState()).toBeDefined()
    })

    it('clears itself once the expiry has been on screen for the linger window', async () => {
      await startTimer({ label: 'Back squat', totalSec: 60, now: T0 })
      const { container } = render(<RestTimerBar />)
      await screen.findByText('1:00')

      // Notice the expiry first...
      vi.setSystemTime(new Date(T0_PLUS_120S))
      await waitFor(() => expect(screen.getByText(/Rest finished/)).toBeInTheDocument(), { timeout: REAL_WAIT_TIMEOUT_MS })
      expect(await getTimerState()).toBeDefined()

      // ...then let the linger window pass from that moment.
      vi.setSystemTime(new Date(T0_PLUS_155S))
      await waitFor(async () => { expect(await getTimerState()).toBeUndefined() }, { timeout: REAL_WAIT_TIMEOUT_MS })
      await waitFor(() => { expect(container).toBeEmptyDOMElement() }, { timeout: REAL_WAIT_TIMEOUT_MS })
    })

    /**
     * The athlete's "the timer doesn't go off if I'm in another app". It cannot
     * always sound while they are away, so the least it can do is not pretend
     * nothing happened: a rest that ran out a minute ago stays on screen and says
     * so, instead of vanishing before it can be read.
     */
    it('a rest that ran out while the athlete was away says how long ago, and waits to be read', async () => {
      await startTimer({ label: 'Back squat', totalSec: 60, now: T0 })
      vi.setSystemTime(new Date(T0_PLUS_120S))

      render(<RestTimerBar />)
      expect(await screen.findByText('Rest finished 1:00 ago')).toBeInTheDocument()
      expect(await getTimerState()).toBeDefined()
    })

    it('a timer that expired hours ago is gone immediately, silently, not resurrected', async () => {
      // A reopened app must not alarm for a session that ended yesterday, and
      // must not show a stale 0:00 either.
      await startTimer({ label: 'Back squat', totalSec: 60, now: T0 })
      vi.setSystemTime(new Date(T0_PLUS_2H))

      const { container } = render(<RestTimerBar />)
      await waitFor(async () => { expect(await getTimerState()).toBeUndefined() }, { timeout: REAL_WAIT_TIMEOUT_MS })
      expect(container).toBeEmptyDOMElement()
    })

    it('a PAUSED timer never expires or self-clears, however long it sits', async () => {
      await startTimer({ label: 'Back squat', totalSec: 60, now: T0 })
      render(<RestTimerBar />)
      await screen.findByText('1:00')
      await userEvent.click(screen.getByRole('button', { name: /pause/i }))

      vi.setSystemTime(new Date(T0_PLUS_120S))
      await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 400) }) })

      expect(await getTimerState()).toBeDefined()
      expect(screen.getByText('Back squat')).toBeInTheDocument()
      expect(screen.queryByText('Rest complete')).toBeNull()
    })
  })

  it('does not read through a write-on-read settings call from inside the live query', async () => {
    // Regression guard for the project's known defect pattern: any function
    // called from a useLiveQuery callback must be a pure read. Seeding
    // nothing and rendering immediately exercises the settings read this
    // component makes on a genuinely fresh database.
    await db.settings.clear()
    const { container } = render(<RestTimerBar />)
    expect(container).toBeEmptyDOMElement()
  })
})
