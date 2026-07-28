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

async function seedElevatedShin(): Promise<void> {
  await db.symptomLogs.add({ id: 'sym_sub_1', forDate: TODAY, sessionRpe: 5, shinPain: 6, sciaticPain: 0, notes: '', loggedAt: NOW })
}

async function createAffectedInstance(instanceId: string, templateId: string, scheduledDate: string): Promise<{ prescriptionId: string; templateId: string }> {
  const prescriptionId = `presc_${instanceId}`
  const instancePrescriptionId = `ip_${instanceId}`
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
    id: instancePrescriptionId, instanceId, templateId, exerciseId: 'ex_long_run', order: 1, restSec: 0,
    distanceM: ORIGINAL_DISTANCE_M, sourcePrescriptionId: prescriptionId,
  })
  return { prescriptionId, templateId }
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

function cardFor(title: string): HTMLElement {
  const el = screen.getByText(title).closest('.card')
  if (!el) throw new Error(`expected a .card ancestor for "${title}"`)
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

describe('substitution cards', () => {
  it('shows a SubstitutionCard for an affected upcoming workout under elevated shin symptoms', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', '2026-09-01')
    await seedElevatedShin()
    await renderHome()

    expect(await screen.findByText('Reduce impact volume')).toBeInTheDocument()
  })

  it('carries the exact non-diagnosis disclaimer on every card, and there is at least one card', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', '2026-09-01')
    await seedElevatedShin()
    await renderHome()
    await screen.findByText('Reduce impact volume')

    const disclaimers = document.querySelectorAll('.substitution-card__disclaimer')
    expect(disclaimers.length).toBeGreaterThan(0)
    for (const el of disclaimers) expect(el.textContent).toBe('Training-load suggestion, not a medical diagnosis.')
  })

  it('offers Accept, Modify, and Dismiss on every card, each one tap', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', '2026-09-01')
    await seedElevatedShin()
    await renderHome()
    await screen.findByText('Reduce impact volume')
    const card = cardFor('Reduce impact volume')

    expect(within(card).getByRole('button', { name: 'Accept' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Modify' })).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: 'Dismiss' })).toBeInTheDocument()
  })

  it('Accept on an impact-reduction suggestion reduces the instance distance by 20-30%, leaving the template Prescription untouched', async () => {
    const { prescriptionId } = await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', '2026-09-01')
    await seedElevatedShin()
    await renderHome()
    await screen.findByText('Reduce impact volume')

    fireEvent.click(within(cardFor('Reduce impact volume')).getByRole('button', { name: 'Accept' }))

    await waitFor(async () => {
      const ip = await db.instancePrescriptions.get('ip_wi_sub_1')
      expect(ip?.distanceM).toBeLessThan(ORIGINAL_DISTANCE_M)
      expect(ip?.distanceM).toBeGreaterThanOrEqual(ORIGINAL_DISTANCE_M * 0.7)
      expect(ip?.distanceM).toBeLessThanOrEqual(ORIGINAL_DISTANCE_M * 0.8)
    })
    const template = await db.prescriptions.get(prescriptionId)
    expect(template?.distanceM).toBe(ORIGINAL_DISTANCE_M)
  })

  it('Dismiss records the dismissal so the card does not reappear for that instance, but still appears for a different affected instance', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', '2026-09-01')
    await createAffectedInstance('wi_sub_2', 'tmpl_sub_2', '2026-09-02')
    await seedElevatedShin()
    await renderHome()
    await screen.findAllByText('Reduce impact volume')
    expect(screen.getAllByText('Reduce impact volume')).toHaveLength(2)

    const firstCardDismiss = within(screen.getAllByText('Reduce impact volume')[0]!.closest('.card') as HTMLElement)
      .getByRole('button', { name: 'Dismiss' })
    fireEvent.click(firstCardDismiss)

    await waitFor(() => { expect(screen.getAllByText('Reduce impact volume')).toHaveLength(1) })
    const settings = await db.settings.get('app')
    expect(settings?.dismissedSubstitutions).toContain('wi_sub_1:reduceImpactVolume')
  })

  it('never auto-cancels a workout: scheduledDate stays non-null and status is never skipped or autoDropped from symptoms alone', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', '2026-09-01')
    await seedElevatedShin()
    await renderHome()
    await screen.findByText('Reduce impact volume')

    const instance = await db.workoutInstances.get('wi_sub_1')
    expect(instance?.scheduledDate).not.toBeNull()
    expect(instance?.status).not.toBe('skipped')
    expect(instance?.status).not.toBe('autoDropped')
    expect(instance?.status).toBe('upcoming')
  })

  it('uses no diagnostic language: no "you have", and no named conditions', async () => {
    await createAffectedInstance('wi_sub_1', 'tmpl_sub_1', '2026-09-01')
    await seedElevatedShin()
    await renderHome()
    await screen.findByText('Reduce impact volume')

    const details = document.querySelectorAll('.substitution-card__detail')
    expect(details.length).toBeGreaterThan(0)
    for (const el of details) {
      expect(el.textContent).not.toMatch(/you have/i)
      expect(el.textContent).not.toMatch(/shin splints|stress fracture|sciatica|tendinitis|tendonitis/i)
    }
  })
})
