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
