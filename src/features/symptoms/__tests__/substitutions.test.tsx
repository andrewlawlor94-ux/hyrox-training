import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { db, resetDatabase } from '@/data/db'
import { updateSettings } from '@/data/repositories'
import { seedIfEmpty } from '@/data/seed/seedRunner'
import { renderApp } from '@/test/renderApp'

const TODAY = '2026-08-26'
const NOW = '2026-08-26T09:00:00.000Z'
const FAKE_NOW = new Date(2026, 7, 26, 9, 0, 0)
const ORIGINAL_DISTANCE_M = 12000
/** Inside the seven-day suggestion window. */
const THIS_WEEK = '2026-08-28'
const ALSO_THIS_WEEK = '2026-08-29'
/** Outside it — the advice says "this week" and must mean it. */
const NEXT_MONTH = '2026-09-20'

const CARD_TITLE = 'Shin pain needs attention'

async function seedElevatedShin(): Promise<void> {
  await db.symptomLogs.add({ id: 'sym_sub_1', forDate: TODAY, sessionRpe: 5, shinPain: 6, sciaticPain: 0, notes: '', loggedAt: NOW })
}

/** Three sessions at a caution-level score: persistent, but never elevated, so
 * the only suggestion is to seek assessment — which changes nothing in the plan. */
async function seedPersistentShin(): Promise<void> {
  const dates = ['2026-08-24', '2026-08-25', TODAY]
  for (const [index, forDate] of dates.entries()) {
    await db.symptomLogs.add({
      id: `sym_persist_${String(index)}`, forDate, sessionRpe: 5, shinPain: 3, sciaticPain: 0,
      notes: '', loggedAt: `${forDate}T09:00:00.000Z`,
    })
  }
}

async function createAffectedInstance(instanceId: string, templateId: string, scheduledDate: string): Promise<{ prescriptionId: string }> {
  const prescriptionId = `presc_${instanceId}`
  await db.workoutTemplates.add({
    id: templateId, planId: 'plan_sub', planWeekId: 'week_sub', sessionSlot: 1, sequenceInWeek: 1,
    name: 'Long run', kind: 'run', priority: 'essential', recoveryTags: ['hardRun'], estMinutes: 60, notes: '',
  })
  await db.prescriptions.add({
    id: prescriptionId, templateId, exerciseId: 'ex_long_run', order: 1, restSec: 0, distanceM: ORIGINAL_DISTANCE_M,
  })
  await db.workoutInstances.add({
    id: instanceId, planId: 'plan_sub', templateId, weekNumber: 1, sessionSlot: 1,
    plannedDate: scheduledDate, scheduledDate, sequence: 1, priority: 'essential',
    recoveryTags: ['hardRun'], status: 'upcoming', isManualOverride: false, frozen: false,
  })
  await db.instancePrescriptions.add({
    id: `ip_${instanceId}`, instanceId, templateId, exerciseId: 'ex_long_run', order: 1, restSec: 0,
    distanceM: ORIGINAL_DISTANCE_M, sourcePrescriptionId: prescriptionId,
  })
  return { prescriptionId }
}

async function setup(): Promise<void> {
  await resetDatabase()
  await seedIfEmpty(db, NOW)
  await updateSettings({ onboardingCompletedAt: NOW, activePlanId: 'plan_sub' })
}

async function renderHome(): Promise<void> {
  renderApp({ route: '/' })
  await screen.findByRole('heading', { level: 1 })
}

function theCard(): HTMLElement {
  const el = screen.getByText(CARD_TITLE).closest('.card')
  if (!el) throw new Error('expected a .card ancestor for the advice card')
  return el as HTMLElement
}

beforeEach(async () => {
  await setup()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('symptom advice on Home', () => {
  /**
   * The athlete's report: "the home tab has a crazy amount of suggestions."
   * Every suggestion used to be rendered once per affected session across the
   * whole remaining plan — four suggestions against every running session for
   * six months. One observation is now one card.
   */
  it('shows ONE card for a stream however many sessions it affects', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', THIS_WEEK)
    await createAffectedInstance('wi_sub_2', 'tmpl_sub_2', ALSO_THIS_WEEK)
    await createAffectedInstance('wi_sub_3', 'tmpl_sub_3', NEXT_MONTH)
    await seedElevatedShin()
    await renderHome()

    expect(await screen.findAllByText(CARD_TITLE)).toHaveLength(1)
    // The four suggestions are its bullet points, not four more cards.
    const card = theCard()
    for (const title of ['Reduce impact volume', 'Swap a hard run for low-impact cardio', 'Hold load progression', 'Keep up calf and tibialis strengthening']) {
      expect(within(card).getByText(title), title).toBeInTheDocument()
    }
  })

  /** "im not sure why it thinks i need these suggestions based on what i logged." */
  it('states the report that raised it', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', THIS_WEEK)
    await seedElevatedShin()
    await renderHome()
    await screen.findByText(CARD_TITLE)

    expect(within(theCard()).getByText(`You reported shin pain of 6 out of 10 on ${TODAY}.`)).toBeInTheDocument()
  })

  it('counts only the sessions inside the week it says it applies to', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', THIS_WEEK)
    await createAffectedInstance('wi_sub_2', 'tmpl_sub_2', ALSO_THIS_WEEK)
    await createAffectedInstance('wi_sub_3', 'tmpl_sub_3', NEXT_MONTH)
    await seedElevatedShin()
    await renderHome()
    await screen.findByText(CARD_TITLE)

    expect(within(theCard()).getByText('Applying changes 2 sessions this week.')).toBeInTheDocument()
  })

  it('applies to every affected session this week, leaving the template and next month alone', async () => {
    const { prescriptionId } = await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', THIS_WEEK)
    await createAffectedInstance('wi_sub_2', 'tmpl_sub_2', ALSO_THIS_WEEK)
    await createAffectedInstance('wi_sub_3', 'tmpl_sub_3', NEXT_MONTH)
    await seedElevatedShin()
    await renderHome()
    await screen.findByText(CARD_TITLE)

    fireEvent.click(within(theCard()).getByRole('button', { name: 'Apply to my plan' }))

    await waitFor(async () => {
      for (const id of ['ip_wi_sub_1', 'ip_wi_sub_2']) {
        const ip = await db.instancePrescriptions.get(id)
        expect(ip?.distanceM, id).toBeLessThan(ORIGINAL_DISTANCE_M)
        expect(ip?.distanceM, id).toBeGreaterThanOrEqual(ORIGINAL_DISTANCE_M * 0.7)
      }
    }, { timeout: 5000 })

    // Out of the window, so untouched.
    expect((await db.instancePrescriptions.get('ip_wi_sub_3'))?.distanceM).toBe(ORIGINAL_DISTANCE_M)
    // And the plan's own template is never rewritten by a suggestion.
    expect((await db.prescriptions.get(prescriptionId))?.distanceM).toBe(ORIGINAL_DISTANCE_M)
  })

  /** The other half of "the button doesn't work": applying changed the plan and
   * left the card sitting there, indistinguishable from nothing happening. */
  it('clears the card once applied', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', THIS_WEEK)
    await seedElevatedShin()
    await renderHome()
    await screen.findByText(CARD_TITLE)

    fireEvent.click(within(theCard()).getByRole('button', { name: 'Apply to my plan' }))
    await waitFor(() => { expect(screen.queryByText(CARD_TITLE)).toBeNull() }, { timeout: 5000 })
  })

  /**
   * Four of the six suggestion kinds change nothing in the plan —
   * `applySubstitution` has no branch for them. They were rendered with an
   * Accept button that reported success and did nothing.
   */
  it('offers no apply control when the advice cannot change anything', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', THIS_WEEK)
    await seedPersistentShin()
    await renderHome()
    await screen.findByText(CARD_TITLE)
    const card = theCard()

    expect(within(card).getByText('Consider a professional assessment')).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Apply to my plan' })).toBeNull()
    expect(within(card).queryByRole('button', { name: 'Modify' })).toBeNull()
    // One honest way out, and it is not called "Accept".
    expect(within(card).getByRole('button', { name: 'Got it' })).toBeInTheDocument()
  })

  it('says so rather than offering a dead button when nothing is scheduled this week', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', NEXT_MONTH)
    await seedElevatedShin()
    await renderHome()
    await screen.findByText(CARD_TITLE)
    const card = theCard()

    expect(within(card).getByText(/nothing to change/i)).toBeInTheDocument()
    expect(within(card).queryByRole('button', { name: 'Apply to my plan' })).toBeNull()
  })

  it('dismisses per report, so a later report raises it again', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', THIS_WEEK)
    await seedElevatedShin()
    await renderHome()
    await screen.findByText(CARD_TITLE)

    fireEvent.click(within(theCard()).getByRole('button', { name: 'Dismiss' }))

    await waitFor(() => { expect(screen.queryByText(CARD_TITLE)).toBeNull() })
    const settings = await db.settings.get('app')
    // Keyed to the report, never to the kind alone — otherwise dismissing today
    // would silence the same advice after a fresh report next week.
    expect(settings?.dismissedSubstitutions).toContain(`shin@${TODAY}`)
  })

  /**
   * The plan's commonest running session is prescribed by TIME, not distance.
   * Reducing "impact volume" scaled only `distanceM`, so accepting the
   * suggestion against a week of 40-minute easy runs changed nothing at all and
   * reported success — the same dead-button complaint in a fourth disguise.
   */
  it('reduces a duration-prescribed run too, not only a distance-prescribed one', async () => {
    await db.workoutTemplates.add({
      id: 'tmpl_dur', planId: 'plan_sub', planWeekId: 'week_sub', sessionSlot: 2, sequenceInWeek: 2,
      name: 'Easy run', kind: 'run', priority: 'important', recoveryTags: ['easyRun'], estMinutes: 40, notes: '',
    })
    await db.workoutInstances.add({
      id: 'wi_dur', planId: 'plan_sub', templateId: 'tmpl_dur', weekNumber: 1, sessionSlot: 2,
      plannedDate: THIS_WEEK, scheduledDate: THIS_WEEK, sequence: 2, priority: 'important',
      recoveryTags: ['easyRun'], status: 'upcoming', isManualOverride: false, frozen: false,
    })
    await db.instancePrescriptions.add({
      id: 'ip_wi_dur', instanceId: 'wi_dur', templateId: 'tmpl_dur', exerciseId: 'ex_easy_run',
      order: 1, restSec: 0, durationSec: 2400,
    })
    await seedElevatedShin()
    await renderHome()
    await screen.findByText(CARD_TITLE)

    fireEvent.click(within(theCard()).getByRole('button', { name: 'Apply to my plan' }))

    await waitFor(async () => {
      const ip = await db.instancePrescriptions.get('ip_wi_dur')
      expect(ip?.durationSec).toBeLessThan(2400)
      expect(ip?.durationSec).toBeGreaterThanOrEqual(2400 * 0.7)
    }, { timeout: 5000 })
  })

  /** The card says "replace ONE hard run this week". Applying the swap to every
   * affected session turned a week of running into a week of SkiErg. */
  it('swaps a single run for low-impact work, not the whole week of them', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', THIS_WEEK)
    await createAffectedInstance('wi_sub_2', 'tmpl_sub_2', ALSO_THIS_WEEK)
    await seedElevatedShin()
    await renderHome()
    await screen.findByText(CARD_TITLE)

    fireEvent.click(within(theCard()).getByRole('button', { name: 'Apply to my plan' }))

    await waitFor(async () => {
      expect((await db.instancePrescriptions.get('ip_wi_sub_1'))?.exerciseId).not.toBe('ex_long_run')
    }, { timeout: 5000 })
    // The second run keeps its own exercise — only its volume comes down.
    expect((await db.instancePrescriptions.get('ip_wi_sub_2'))?.exerciseId).toBe('ex_long_run')
    expect((await db.instancePrescriptions.get('ip_wi_sub_2'))?.distanceM).toBeLessThan(ORIGINAL_DISTANCE_M)
  })

  it('carries the exact non-diagnosis disclaimer', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', THIS_WEEK)
    await seedElevatedShin()
    await renderHome()
    await screen.findByText(CARD_TITLE)

    const disclaimers = document.querySelectorAll('.substitution-card__disclaimer')
    expect(disclaimers.length).toBeGreaterThan(0)
    for (const el of disclaimers) expect(el.textContent).toBe('Training-load suggestion, not a medical diagnosis.')
  })

  it('never auto-cancels a workout: scheduledDate stays non-null and status is never skipped or autoDropped from symptoms alone', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', THIS_WEEK)
    await seedElevatedShin()
    await renderHome()
    await screen.findByText(CARD_TITLE)

    const instance = await db.workoutInstances.get('wi_sub_1')
    expect(instance?.scheduledDate).not.toBeNull()
    expect(instance?.status).toBe('upcoming')
  })

  it('uses no diagnostic language: no "you have", and no named conditions', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', THIS_WEEK)
    await seedElevatedShin()
    await renderHome()
    await screen.findByText(CARD_TITLE)

    const details = document.querySelectorAll('.substitution-card__detail')
    expect(details.length).toBeGreaterThan(0)
    for (const el of details) {
      expect(el.textContent).not.toMatch(/you have/i)
      expect(el.textContent).not.toMatch(/shin splints|stress fracture|sciatica|tendinitis|tendonitis/i)
    }
  })
})
