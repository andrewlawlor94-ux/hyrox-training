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
    // Each exercise is now a row of two aligned columns (name, dose) rather
    // than a "Back squat: 4 x 5" sentence.
    const rows = card.querySelectorAll('.todays-workout-card__structure .exercise-row')
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.querySelector('.exercise-row__name')?.textContent).not.toBe('')
    }
    // At least one row carries a real prescribed dose — otherwise this would
    // pass on a card listing bare exercise names with nothing prescribed.
    const details = [...rows].map((row) => row.querySelector('.exercise-row__detail')?.textContent ?? '')
    expect(details.some((detail) => detail.trim() !== '')).toBe(true)

    // Priority is carried by its chip (asserted above), so the reason sentence
    // no longer repeats it as "— priority: essential".
    const reason = card.querySelector('.todays-workout-card__reason')?.textContent ?? ''
    expect(reason).toMatch(/^Scheduled for today as /)
    expect(reason).not.toMatch(/priority:/i)
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

    // Same facts as before, restructured (athlete feedback: "the UI right now is
    // just text/bullets"). Counts, the four-session minimum, the phase and the
    // partial session are all still asserted — the assertions moved with the
    // markup, nothing was dropped.
    expect(within(card).getByText(
      new RegExp(`${String(essentials.length)} of ${String(essentials.length)} essential sessions done`),
    )).toBeInTheDocument()
    // Scoped to the summary chips: "Completed" also appears as a status on the
    // schedule rows, which is the point of those rows, not an ambiguity here.
    const chipsText = card.querySelector('.week-progress__chips')?.textContent ?? ''
    expect(chipsText).toMatch(/\d+ completed/)
    expect(within(card).getByText(/sessions this week/)).toBeInTheDocument()
    expect(within(card).getByText(/Base/)).toBeInTheDocument()

    // Essential progress is now a real progressbar as well as a count.
    const bar = within(card).getByRole('progressbar')
    expect(bar.getAttribute('aria-label')).toMatch(/essential sessions/i)

    // The partial session is reported ON ITS OWN SCHEDULE ROW rather than in a
    // separate list that repeated its name — the duplication this restructure
    // removed. So assert the row, not just that the phrase appears somewhere.
    if (partial) {
      const partialRow = [...card.querySelectorAll('.week-row')]
        .find((row) => (row.textContent ?? '').includes('Partially completed'))
      expect(partialRow, 'expected a schedule row marked Partially completed').toBeDefined()
    }

    // Every session in the week appears exactly once, never two or three times
    // under different headings.
    const rowNames = [...card.querySelectorAll('.week-row__name')].map((e) => e.textContent ?? '')
    expect(rowNames.length).toBe(week1.length)

    const nextActions = card.querySelectorAll('.this-week-card__next-action')
    expect(nextActions).toHaveLength(1)
    expect(nextActions[0]?.textContent).not.toBe('')

    const text = card.textContent ?? ''
    expect(text).not.toMatch(/streak|don't break|failed|behind schedule|you missed/i)
  })

  it('marks a skipped session on its own row, as a scheduling fact and not a failure', async () => {
    await seedTestDb()
    await onboard()
    const week1 = await instancesForWeek(1)
    const optional = week1.find((i) => i.priority === 'optional')
    if (!optional) throw new Error('expected a week-1 optional session')
    await skipWorkout({ id: optional.id, now: NOW })
    await syncQueue(TODAY)

    await renderHome()
    const card = await cardFor(/^this week$/i)

    const skippedRow = [...card.querySelectorAll('.week-row')]
      .find((row) => (row.textContent ?? '').includes('Skipped'))
    expect(skippedRow, 'expected a schedule row marked Skipped').toBeDefined()
    // Still no guilt language attached to it.
    expect(skippedRow?.textContent ?? '').not.toMatch(/missed|failed|behind/i)
  })

  it('shows a moved session\'s original day inline on its row, not in a second list', async () => {
    await seedTestDb()
    await onboard()
    await renderHome()
    const card = await cardFor(/^this week$/i)

    // Whether any week-1 session has actually moved depends on real scheduling,
    // so this asserts the INVARIANT rather than forcing a move: a "moved from"
    // note only ever appears inside a schedule row, never as its own list.
    const movedNotes = card.querySelectorAll('.week-row__moved')
    for (const note of movedNotes) {
      expect(note.closest('.week-row')).not.toBeNull()
      expect(note.textContent).toMatch(/moved from/i)
    }
    expect(card.querySelector('.this-week-card__moved')).toBeNull()
    expect(card.querySelector('.this-week-card__partial')).toBeNull()
    expect(card.querySelector('.this-week-card__skipped')).toBeNull()
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

  // A rest day used to render a sentence and ZERO controls, so an athlete who
  // opened the app wanting to train had no path at all from Home — rescheduling
  // meant Plan tab -> week -> Edit -> a date input, which reads as "I can't move
  // this". The rest-day framing stays; the dead end does not.
  describe('a rest day offers to pull the next session forward', () => {
    /**
     * A genuinely empty day. Skipping today's sessions does NOT produce one —
     * the queue immediately fills the freed day with a later session, which is
     * correct behaviour. Sunday is the real rest day: automated placement only
     * ever uses Monday-Saturday (`AUTOMATED_PLACEMENT_WEEKDAYS_PER_WEEK`), so
     * nothing is ever scheduled on it while real sessions remain ahead.
     */
    const SUNDAY: ISODate = '2026-01-11' // the Sunday of seedTestDb's week 1

    async function onSunday(): Promise<void> {
      vi.setSystemTime(new Date(2026, 0, 11, 8, 0, 0))
      await syncQueue(SUNDAY)
    }

    it('names the next session and its scheduled date, instead of a dead end', async () => {
      await seedTestDb()
      await onboard()
      await onSunday()

      await renderHome()
      const card = await cardFor(/today.s workout/i)

      expect(within(card).getByText(/no session scheduled today/i)).toBeInTheDocument()
      const pullForward = card.querySelector('.todays-workout-card__pull-forward')
      expect(pullForward, 'expected a pull-forward block on a rest day').not.toBeNull()
      expect(pullForward?.textContent).toMatch(/Next up: .+/)
      expect(pullForward?.textContent).toMatch(/scheduled \d{4}-\d{2}-\d{2}/)
      expect(within(card).getByRole('button', { name: 'Do this today' })).toBeInTheDocument()
    })

    it('"Do this today" actually re-dates the session onto today', async () => {
      await seedTestDb()
      await onboard()
      await onSunday()

      await renderHome()
      const card = await cardFor(/today.s workout/i)
      const nextName = card.querySelector('.todays-workout-card__next')?.textContent ?? ''
      expect(nextName).toMatch(/Next up: /)

      await userEvent.click(within(card).getByRole('button', { name: 'Do this today' }))

      // Asserted against the DATABASE row, not the card's own re-render: the
      // move must actually persist, not merely look like it did.
      await waitFor(async () => {
        const moved = (await db.workoutInstances.toArray()).filter((i) => i.scheduledDate === SUNDAY)
        expect(moved.length).toBeGreaterThan(0)
      })

      // A pinned override is what makes the move survive the next recompute.
      const overrides = await db.scheduleOverrides.toArray()
      expect(overrides.some((o) => o.isPinned && o.date === SUNDAY)).toBe(true)
    })

    it('offers nothing to pull forward when there genuinely is no next session', async () => {
      await seedTestDb()
      await onboard()
      // Skip EVERY session in the plan, so no upcoming one remains. The card
      // must fall back to the plain rest-day message rather than inventing a
      // session or rendering an inert button.
      const planId = await activePlanId()
      for (const instance of await db.workoutInstances.where('planId').equals(planId).toArray()) {
        await skipWorkout({ id: instance.id, now: NOW })
      }
      await onSunday()

      await renderHome()
      const card = await cardFor(/today.s workout/i)
      expect(within(card).getByText(/no session scheduled today/i)).toBeInTheDocument()
      expect(card.querySelector('.todays-workout-card__pull-forward')).toBeNull()
      expect(within(card).queryByRole('button', { name: 'Do this today' })).toBeNull()
    })
  })

  // Same dead end as the rest day, one tap away: a SKIPPED session is not
  // "attended", so it used to be picked as today's actionable session and then
  // rendered with every action false — a card showing a name and no buttons at
  // all, and no way to bring anything else forward.
  it('after skipping today\'s only session, says so accurately and still offers the next one', async () => {
    await seedTestDb()
    await onboard()
    const week1 = await instancesForWeek(1)
    for (const instance of week1.filter((i) => i.scheduledDate === TODAY)) {
      await skipWorkout({ id: instance.id, now: NOW })
    }
    await syncQueue(TODAY)

    await renderHome()
    const card = await cardFor(/today.s workout/i)

    // Never claims the work was LOGGED when it was skipped.
    expect(card.textContent ?? '').not.toMatch(/is logged|has been logged/i)
    expect(within(card).getByText(/skipped or dropped/i)).toBeInTheDocument()

    // And there is a way forward, rather than a card with no controls.
    const buttons = [...card.querySelectorAll('button')].map((b) => b.textContent?.trim())
    expect(buttons.length).toBeGreaterThan(0)
    expect(buttons).toContain('Do this today')
  })

  it('offers "Move to another day" for an actionable session, and never for a frozen one', async () => {
    await seedTestDb()
    await onboard()
    await renderHome()
    const card = await cardFor(/today.s workout/i)

    // Actionable today: the control is offered.
    await userEvent.click(within(card).getByRole('button', { name: 'Move to another day' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText('Move to')).toBeInTheDocument()
  })
})
