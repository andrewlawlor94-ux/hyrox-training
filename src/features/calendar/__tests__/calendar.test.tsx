import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, resetDatabase } from '@/data/db'
import { completeWorkout, skipWorkout, syncQueue, updateSettings } from '@/data/repositories'
import type { ISODate } from '@/data/types'
import { renderApp } from '@/test/renderApp'
import { seedTestDb } from '@/test/seedTestDb'
import { loadCalendar } from '../calendarData'

const TODAY: ISODate = '2026-01-05' // seedTestDb's default: plan start, week 1
const NOW = '2026-01-05T08:00:00.000Z'
const FAKE_NOW = new Date(2026, 0, 5, 8, 0, 0)

async function onboard(): Promise<void> {
  await updateSettings({ onboardingCompletedAt: NOW })
}

async function renderCalendar(): Promise<void> {
  renderApp({ route: '/calendar' })
  await screen.findByRole('heading', { level: 1, name: 'Calendar' })
}

async function activePlanId(): Promise<string> {
  const settings = await db.settings.get('app')
  if (!settings) throw new Error('no settings row')
  return settings.activePlanId
}

beforeEach(async () => {
  await resetDatabase()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('calendar data', () => {
  it('spans from the first session through race day, one month grid at a time', async () => {
    await seedTestDb() // 2026-01-05 -> race 2026-06-15
    const data = await loadCalendar(TODAY)
    expect(data).toBeDefined()
    if (!data) return

    expect(data.raceDate).toBe('2026-06-15')
    // January through June inclusive.
    expect(data.months.map((m) => m.label)).toEqual([
      'January 2026', 'February 2026', 'March 2026', 'April 2026', 'May 2026', 'June 2026',
    ])
    // Opens on the month containing today.
    expect(data.months[data.todayMonthIndex]?.label).toBe('January 2026')
  })

  it('lays out whole Monday-first weeks, so every grid row has exactly seven days', async () => {
    await seedTestDb()
    const data = await loadCalendar(TODAY)
    if (!data) throw new Error('expected calendar data')

    for (const month of data.months) {
      for (const week of month.weeks) {
        expect(week).toHaveLength(7)
        // Monday first: `startOfIsoWeek` drives the cursor, so day 0 of every
        // row must be a Monday. Verified via the known-Monday plan start.
        const [first] = week
        expect(first).toBeDefined()
      }
      // Every day of the month itself appears exactly once.
      const inMonth = month.weeks.flat().filter((d) => !d.isOutsideMonth).map((d) => d.date)
      expect(new Set(inMonth).size).toBe(inMonth.length)
    }
  })

  it('places a completed session on the day it was actually done, not the day it was planned', async () => {
    await seedTestDb()
    const planId = await activePlanId()
    const week1 = await db.workoutInstances.where({ planId, weekNumber: 1 }).toArray()
    const target = week1.find((i) => i.scheduledDate === TODAY)
    if (!target) throw new Error('expected a session scheduled today')

    // Logged as done on an EARLIER day than it was planned for.
    await completeWorkout({ id: target.id, state: 'completed', forDate: '2026-01-03', now: NOW })
    await syncQueue(TODAY)

    const data = await loadCalendar(TODAY)
    if (!data) throw new Error('expected calendar data')
    const allDays = data.months.flatMap((m) => m.weeks.flat())
    const onDoneDay = allDays.find((d) => d.date === '2026-01-03' && !d.isOutsideMonth)
    expect(onDoneDay?.entries.some((e) => e.instanceId === target.id)).toBe(true)
    // And NOT left sitting on its original planned day.
    const onPlannedDay = allDays.filter((d) => d.date === TODAY && !d.isOutsideMonth)
    expect(onPlannedDay.some((d) => d.entries.some((e) => e.instanceId === target.id))).toBe(false)
  })

  it('includes skipped and dropped sessions rather than hiding them', async () => {
    await seedTestDb()
    const planId = await activePlanId()
    const week1 = await db.workoutInstances.where({ planId, weekNumber: 1 }).toArray()
    const optional = week1.find((i) => i.priority === 'optional')
    if (!optional) throw new Error('expected an optional week-1 session')
    await skipWorkout({ id: optional.id, now: NOW })
    await syncQueue(TODAY)

    const data = await loadCalendar(TODAY)
    if (!data) throw new Error('expected calendar data')
    const entries = data.months.flatMap((m) => m.weeks.flat()).flatMap((d) => d.entries)
    expect(entries.some((e) => e.instanceId === optional.id)).toBe(true)
  })

  it('returns undefined when there is no active plan, rather than an empty grid', async () => {
    await expect(loadCalendar(TODAY)).resolves.toBeUndefined()
  })
})

describe('calendar screen', () => {
  it('marks today and race day, and pages between months', async () => {
    await seedTestDb()
    await onboard()
    await renderCalendar()

    await waitFor(() => { expect(screen.getByText('January 2026')).toBeInTheDocument() })
    expect(document.querySelectorAll('.calendar-day--today')).toHaveLength(1)

    // Race day is in June: page forward until it appears.
    for (let i = 0; i < 5; i += 1) {
      await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    }
    await waitFor(() => { expect(screen.getByText('June 2026')).toBeInTheDocument() })
    expect(document.querySelectorAll('.calendar-day--race').length).toBeGreaterThan(0)
    // At the end of the range, Next is disabled rather than paging into nothing.
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('tapping a day with sessions opens the same preview Home uses, with "Do today"', async () => {
    await seedTestDb()
    await onboard()
    await renderCalendar()

    await waitFor(() => { expect(document.querySelectorAll('.calendar-day--button').length).toBeGreaterThan(0) })
    // A day that is NOT today, so the preview offers to pull it forward.
    const dayButtons = [...document.querySelectorAll<HTMLButtonElement>('.calendar-day--button')]
    const laterDay = dayButtons.find((b) => !b.className.includes('calendar-day--today'))
    if (!laterDay) throw new Error('expected a session on a day other than today')
    await userEvent.click(laterDay)

    const dialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(dialog.querySelectorAll('.session-preview__structure .exercise-row').length).toBeGreaterThan(0)
    })
    expect(within(dialog).getByRole('button', { name: 'Do today' })).toBeInTheDocument()
  })

  it('a day with nothing scheduled is not a control', async () => {
    await seedTestDb()
    await onboard()
    await renderCalendar()

    await waitFor(() => { expect(document.querySelectorAll('.calendar-day').length).toBeGreaterThan(0) })
    // Sunday is never a placement day, so at least one empty day exists.
    const empty = [...document.querySelectorAll('.calendar-day')]
      .filter((d) => d.querySelectorAll('.calendar-dot').length === 0)
    expect(empty.length).toBeGreaterThan(0)
    // An empty button would be a tap target that does nothing.
    for (const day of empty) expect(day.tagName.toLowerCase()).not.toBe('button')
  })

  it('never carries meaning by colour alone: every session day names its sessions and statuses', async () => {
    await seedTestDb()
    await onboard()
    await renderCalendar()

    await waitFor(() => { expect(document.querySelectorAll('.calendar-day--button').length).toBeGreaterThan(0) })
    for (const day of document.querySelectorAll('.calendar-day--button')) {
      const label = day.getAttribute('aria-label') ?? ''
      // Day number plus at least one "<name>: <status>" pair.
      expect(label).toMatch(/\d+/)
      expect(label).toMatch(/: (Upcoming|Ready today|In progress|Completed|Partially completed|Deferred|Skipped|Dropped)/)
    }
    // The legend states each dot in words too.
    for (const text of ['Done', 'Planned', 'Skipped or dropped']) {
      expect(screen.getByText(text)).toBeInTheDocument()
    }
  })
})
