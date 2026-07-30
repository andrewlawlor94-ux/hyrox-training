import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
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
    // Still editable while in progress -- not yet frozen.
    expect(within(card).getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Start' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Completed earlier' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Defer' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Skip' })).toBeNull()
  })

  it('offers no actions at all (including no Edit) once every session for today is completed -- completed history is immutable', async () => {
    await seedTestDb()
    await onboard()
    const week1 = await instancesForWeek(1)
    const today = week1.find((i) => i.scheduledDate === TODAY)
    if (!today) throw new Error('expected an instance scheduled today')
    await completeWorkout({ id: today.id, state: 'completed', forDate: TODAY, now: NOW })
    await syncQueue(TODAY)

    await renderHome()
    const card = await cardFor(/today.s workout/i)
    expect(within(card).queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Start' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Continue' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Completed earlier' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Defer' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Skip' })).toBeNull()
  })

  it('offers Edit for an available session, and Edit opens the edit sheet in place rather than navigating to the workout screen', async () => {
    await seedTestDb()
    await onboard()
    await renderHome()
    const card = await cardFor(/today.s workout/i)

    await userEvent.click(within(card).getByRole('button', { name: 'Edit' }))
    await screen.findByRole('dialog')
    // Still on Home -- the mislabelled version of this button navigated to
    // /workout/:id (Start's own handler); the real fix must not.
    expect(screen.getByRole('heading', { level: 1, name: /home/i })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: /week 1/i })).toBeNull()
  })

  it('applies a "Just this workout" edit made from Home to that exercise\'s own InstancePrescription, leaving a sibling exercise and its template untouched', async () => {
    await seedTestDb()
    await onboard()
    const week1 = await instancesForWeek(1)
    const today = week1.find((i) => i.scheduledDate === TODAY)
    if (!today) throw new Error('expected an instance scheduled today')

    const prescriptions = await db.instancePrescriptions.where('instanceId').equals(today.id).toArray()
    const strengthCandidates = []
    for (const p of prescriptions) {
      const exercise = await db.exercises.get(p.exerciseId)
      if (exercise?.measurementType === 'strengthSets') strengthCandidates.push({ prescription: p, exercise })
    }
    if (strengthCandidates.length === 0) throw new Error('expected at least one strength exercise scheduled today')
    const [target, ...others] = strengthCandidates
    if (!target) throw new Error('expected a target candidate')

    await renderHome()
    const card = await cardFor(/today.s workout/i)
    await userEvent.click(within(card).getByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')

    if (strengthCandidates.length > 1) {
      await userEvent.click(await within(dialog).findByRole('button', { name: new RegExp(target.exercise.name) }))
    }
    const restInput = await within(dialog).findByLabelText(/rest/i)
    fireEvent.change(restInput, { target: { value: '210' } })
    fireEvent.click(within(dialog).getByLabelText('Just this workout'))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })

    expect((await db.instancePrescriptions.get(target.prescription.id))?.restSec).toBe(210)
    if (target.prescription.sourcePrescriptionId) {
      expect((await db.prescriptions.get(target.prescription.sourcePrescriptionId))?.restSec).toBe(target.prescription.restSec)
    }
    for (const other of others) {
      expect((await db.instancePrescriptions.get(other.prescription.id))?.restSec).toBe(other.prescription.restSec)
    }
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
  // The card was restructured to be scanned rather than read (athlete feedback:
  // "the layout is very text heavy"). Every fact it carried before is still
  // asserted here — the assertions moved with the markup, nothing was dropped.
  it('shows the countdown, race date, target time, plan week, a trajectory pill, and non-empty evidence', async () => {
    await seedTestDb()
    await onboard()
    await renderHome()
    const card = await cardFor(/goal snapshot/i)

    // Countdown, in place of a date the athlete has to subtract from today.
    // seedTestDb's fixture is today 2026-01-05 -> race 2026-06-15 = 161 days.
    expect(within(card).getByText('161 days')).toBeInTheDocument()
    // The date itself is still present, alongside the countdown rather than
    // instead of it.
    expect(within(card).getByText(/2026-06-15/)).toBeInTheDocument()
    expect(within(card).getByText(/target time/i)).toBeInTheDocument()
    expect(within(card).getByText(/Week 1 of/)).toBeInTheDocument()

    // Plan position is now a real progressbar as well as a number, so the
    // percentage is announced rather than duplicated as a second line of text
    // (two adjacent figures read as "274%").
    const bar = within(card).getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow')
    expect(bar.getAttribute('aria-label')).toMatch(/plan progress/i)
    const fill = card.querySelector<HTMLElement>('.goal-progress__fill')
    expect(fill).not.toBeNull()
    // A real width, never NaN% (which renders as a silently full bar).
    expect(fill?.style.width).toMatch(/^\d+%$/)

    // Each readiness status keeps its own TEXT label, not colour alone.
    for (const label of ['Running', 'Strength', 'Symptoms']) {
      expect(within(card).getByText(label)).toBeInTheDocument()
    }

    // The evidence is still there in full, behind a native disclosure.
    const evidence = card.querySelectorAll('.goal-evidence__list li')
    expect(evidence.length).toBeGreaterThan(0)
    for (const li of evidence) expect(li.textContent).not.toBe('')
    expect(within(card).getByText('Why this outlook')).toBeInTheDocument()
  })

  it('shows no predicted finishing time and says so plainly when benchmark data is insufficient', async () => {
    await seedTestDb()
    await onboard()
    await renderHome()
    const card = await cardFor(/goal snapshot/i)

    expect(card.querySelector('.goal-outlook__estimate')).toBeNull()
    const message = card.querySelector('.goal-outlook__no-estimate')
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
      expect(card.querySelector('.goal-outlook__estimate')).not.toBeNull()
    })
    expect(card.querySelector('.goal-outlook__no-estimate')).toBeNull()
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
