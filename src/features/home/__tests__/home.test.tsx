import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, resetDatabase } from '@/data/db'
import {
  completeWorkout, completeWorkoutEarlier, saveRunLog, skipWorkout, syncQueue, updateSettings,
} from '@/data/repositories'
import type { ISODate, WorkoutInstance } from '@/data/types'
import { renderApp } from '@/test/renderApp'
import { seedTestDb } from '@/test/seedTestDb'

const TODAY: ISODate = '2026-01-05' // matches seedTestDb's default (plan start, week 1)
const NOW = '2026-01-05T08:00:00.000Z'
const FAKE_NOW = new Date(2026, 0, 5, 8, 0, 0)

async function onboard(): Promise<void> {
  await updateSettings({ onboardingCompletedAt: NOW })
}

async function renderHome(): Promise<void> {
  renderApp({ route: '/' })
  await screen.findByRole('heading', { level: 1, name: /home/i })
}

async function activePlanId(): Promise<string> {
  const settings = await db.settings.get('app')
  if (!settings) throw new Error('no settings row')
  return settings.activePlanId
}

async function instancesForWeek(weekNumber: number): Promise<WorkoutInstance[]> {
  const planId = await activePlanId()
  return db.workoutInstances.where({ planId, weekNumber }).toArray()
}

function sectionHeadingTexts(): string[] {
  return screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent ?? '')
}

async function cardFor(pattern: RegExp): Promise<HTMLElement> {
  const el = (await screen.findByText(pattern)).closest('.card')
  if (!el) throw new Error(`expected a .card ancestor matching ${String(pattern)}`)
  return el as HTMLElement
}

beforeEach(async () => {
  await resetDatabase()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Home: section order', () => {
  it("renders Today's workout, This week, and Goal snapshot as the first three <h2> headings, in that order", async () => {
    await seedTestDb()
    await onboard()
    await renderHome()

    await screen.findByText(/today.s workout/i)
    const headings = sectionHeadingTexts()
    expect(headings.slice(0, 3)).toEqual(["Today's workout", 'This week', 'Goal snapshot'])
  })
})

describe("Home: today's workout card", () => {
  it('shows name, phase/week, priority, duration, and structure inline for the session scheduled today', async () => {
    await seedTestDb()
    await onboard()
    await renderHome()
    const card = await cardFor(/today.s workout/i)

    expect(within(card).getByText(/Base/)).toBeInTheDocument()
    expect(within(card).getByText(/Week 1/)).toBeInTheDocument()
    expect(within(card).getByText('Essential')).toBeInTheDocument()
    expect(within(card).getByText(/min/)).toBeInTheDocument()
    expect(card.querySelectorAll('.todays-workout-card__structure li').length).toBeGreaterThan(0)
    expect(within(card).getByText(/priority: essential/i)).toBeInTheDocument()
  })

  it('offers Start for an available session, and Start navigates to /workout/:id', async () => {
    await seedTestDb()
    await onboard()
    await renderHome()
    const card = await cardFor(/today.s workout/i)
    expect(within(card).queryByRole('button', { name: 'Continue' })).toBeNull()

    const week1 = await instancesForWeek(1)
    const today = week1.find((i) => i.scheduledDate === TODAY)
    if (!today) throw new Error('expected an instance scheduled today')

    await userEvent.click(within(card).getByRole('button', { name: 'Start' }))
    await screen.findByText(new RegExp(`Week 1.*Session ${String(today.sessionSlot)}`, 'i'))
  })

  it('offers Continue instead of Start once the instance is inProgress, hiding Completed earlier/Defer/Skip', async () => {
    await seedTestDb()
    await onboard()
    const week1 = await instancesForWeek(1)
    const today = week1.find((i) => i.scheduledDate === TODAY)
    if (!today) throw new Error('expected an instance scheduled today')
    const { startWorkout } = await import('@/data/repositories')
    await startWorkout(today.id, NOW)

    await renderHome()
    const card = await cardFor(/today.s workout/i)
    expect(within(card).getByRole('button', { name: 'Continue' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Start' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Completed earlier' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Defer' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Skip' })).toBeNull()
  })

  it('offers only Edit (no Start/Continue/Completed earlier/Defer/Skip) once a session is completed', async () => {
    await seedTestDb()
    await onboard()
    const week1 = await instancesForWeek(1)
    const today = week1.find((i) => i.scheduledDate === TODAY)
    if (!today) throw new Error('expected an instance scheduled today')
    await completeWorkout({ id: today.id, state: 'completed', forDate: TODAY, now: NOW })
    await syncQueue(TODAY)

    await renderHome()
    const card = await cardFor(/today.s workout/i)
    expect(within(card).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Start' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Continue' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Completed earlier' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Defer' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Skip' })).toBeNull()
  })

  it('renders a real, engine-produced schedule-adjustment explanation verbatim from queueExplanations', async () => {
    await seedTestDb()
    await onboard()
    const week1 = await instancesForWeek(1)
    const first = week1.find((i) => i.sequence === 1)
    const second = week1.find((i) => i.sequence === 2)
    if (!first || !second) throw new Error('expected two week-1 instances')

    // Backdate `first`'s completion onto `second`'s planned date, which
    // bumps `second` elsewhere with a real, engine-produced explanation
    // (same scenario as completion.test.tsx's own backdate test).
    await completeWorkoutEarlier({ id: first.id, forDate: second.plannedDate, now: NOW })
    await syncQueue(TODAY)

    const bumped = await db.workoutInstances.get(second.id)
    if (!bumped?.scheduledDate) throw new Error('expected the bumped instance to still have a scheduled date')
    const explanations = await db.queueExplanations.where('instanceId').equals(second.id).toArray()
    const explanationText = explanations[0]?.text
    if (!explanationText) throw new Error('expected a queueExplanations row for the bumped instance')

    vi.setSystemTime(new Date(`${bumped.scheduledDate}T08:00:00.000Z`))
    await onboard()
    await renderHome()

    const card = await cardFor(/today.s workout/i)
    const rendered = within(card).getByRole('note')
    expect(rendered.textContent).toBe(explanationText)
  })
})

describe('Home: this week card', () => {
  it('shows essential/total completed counts, four-session-minimum status, the recommended schedule, current phase, and exactly one next-best action, with no streak/guilt language', async () => {
    await seedTestDb()
    await onboard()
    const week1 = await instancesForWeek(1)
    const essentials = week1.filter((i) => i.priority === 'essential')
    for (const instance of essentials) {
      await completeWorkout({ id: instance.id, state: 'completed', forDate: instance.scheduledDate, now: NOW })
    }
    const partial = week1.find((i) => i.priority === 'important')
    if (partial) await completeWorkout({ id: partial.id, state: 'partiallyCompleted', forDate: partial.scheduledDate, now: NOW })
    await syncQueue(TODAY)

    await renderHome()
    const card = await cardFor(/^this week$/i)

    expect(within(card).getByText(
      new RegExp(`Essential sessions completed: ${String(essentials.length)} of ${String(essentials.length)}`),
    )).toBeInTheDocument()
    expect(within(card).getByText(/Total sessions completed/)).toBeInTheDocument()
    expect(within(card).getByText(/sessions this week/)).toBeInTheDocument()
    expect(within(card).getByText(/Base/)).toBeInTheDocument()
    if (partial) expect(within(card).getByText(/Partially completed/i)).toBeInTheDocument()

    const nextActions = card.querySelectorAll('.this-week-card__next-action')
    expect(nextActions).toHaveLength(1)
    expect(nextActions[0]?.textContent).not.toBe('')

    const text = card.textContent ?? ''
    expect(text).not.toMatch(/streak|don't break|failed|behind schedule|you missed/i)
  })

  it('lists skipped/dropped sessions and shows original dates where they differ from the current schedule', async () => {
    await seedTestDb()
    await onboard()
    const week1 = await instancesForWeek(1)
    const optional = week1.find((i) => i.priority === 'optional')
    if (!optional) throw new Error('expected a week-1 optional session')
    await skipWorkout({ id: optional.id, now: NOW })
    await syncQueue(TODAY)

    await renderHome()
    const card = await cardFor(/^this week$/i)
    expect(within(card).getByText(/Skipped or dropped/i)).toBeInTheDocument()
  })
})

describe('Home: goal snapshot card', () => {
  it('shows race date, target time, plan week, a trajectory pill, and non-empty evidence naming specific milestones', async () => {
    await seedTestDb()
    await onboard()
    await renderHome()
    const card = await cardFor(/goal snapshot/i)

    expect(within(card).getByText(/Race date: 2026-06-15/)).toBeInTheDocument()
    expect(within(card).getByText(/Target time:/)).toBeInTheDocument()
    expect(within(card).getByText(/Plan week 1 of/)).toBeInTheDocument()

    const evidence = card.querySelectorAll('.goal-snapshot-card__evidence li')
    expect(evidence.length).toBeGreaterThan(0)
    for (const li of evidence) expect(li.textContent).not.toBe('')
  })

  it('shows no predicted finishing time and says so plainly when benchmark data is insufficient', async () => {
    await seedTestDb()
    await onboard()
    await renderHome()
    const card = await cardFor(/goal snapshot/i)

    expect(card.querySelector('.goal-snapshot-card__estimate')).toBeNull()
    const message = card.querySelector('.goal-snapshot-card__no-estimate')
    expect(message).not.toBeNull()
    expect(message?.textContent).toMatch(/not enough benchmark data/i)
  })

  it('shows a labelled range once a 5 km benchmark, a compromised-km mean, and a 75% simulation are all present', async () => {
    await seedTestDb()
    await onboard()
    const planId = await activePlanId()

    const anyInstance = (await db.workoutInstances.where('planId').equals(planId).toArray())[0]
    if (!anyInstance) throw new Error('expected at least one instance')

    await saveRunLog(
      { id: 'run_bench', instanceId: anyInstance.id, distanceKm: 5, durationSec: 1500, surface: 'road', runType: 'benchmark', notes: '', loggedAt: NOW },
      [],
    )
    for (let i = 0; i < 6; i += 1) {
      await saveRunLog(
        { id: `run_comp_${String(i)}`, instanceId: anyInstance.id, distanceKm: 1, durationSec: 390, surface: 'road', runType: 'compromised', notes: '', loggedAt: NOW },
        [],
      )
    }

    const simulationTemplate = (await db.workoutTemplates.where('planId').equals(planId).toArray())
      .find((t) => t.kind === 'simulation' && t.stationVolumePct === 75)
    if (!simulationTemplate) throw new Error('expected a 75% simulation template in the seeded plan')
    const simulationInstance = (await db.workoutInstances.where('planId').equals(planId).toArray())
      .find((i) => i.templateId === simulationTemplate.id)
    if (!simulationInstance) throw new Error('expected a 75% simulation instance')
    await completeWorkout({ id: simulationInstance.id, state: 'completed', forDate: simulationInstance.scheduledDate, now: NOW })

    await renderHome()
    const card = await cardFor(/goal snapshot/i)

    await waitFor(() => {
      expect(card.querySelector('.goal-snapshot-card__estimate')).not.toBeNull()
    })
    expect(card.querySelector('.goal-snapshot-card__no-estimate')).toBeNull()
    expect(card.textContent).toMatch(/estimate/i)
    expect(card.textContent).toMatch(/–/) // en dash range separator
  })
})

describe('Home: empty and rest-day states', () => {
  it('renders a useful empty state with a route to onboarding when there is no active plan, instead of crashing', async () => {
    await onboard() // onboardingCompletedAt set, but no plan installed at all
    await renderHome()

    expect(await screen.findByText(/no plan yet/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /onboarding/i }))
    await screen.findByRole('heading', { level: 1, name: /race date/i })
  })

  it('says today is logged and offers the next session, rather than an empty slot, once every session today is complete', async () => {
    await seedTestDb()
    await onboard()
    const week1 = await instancesForWeek(1)
    const today = week1.filter((i) => i.scheduledDate === TODAY)
    for (const instance of today) {
      await completeWorkout({ id: instance.id, state: 'completed', forDate: TODAY, now: NOW })
    }
    await syncQueue(TODAY)

    await renderHome()
    const card = await cardFor(/today.s workout/i)
    expect(within(card).getByText(/session is logged/i)).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Start' })).toBeNull()
  })
})
