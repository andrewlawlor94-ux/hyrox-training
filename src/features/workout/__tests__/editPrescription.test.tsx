import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, resetDatabase } from '@/data/db'
import { updateSettings } from '@/data/repositories'
import { seedIfEmpty } from '@/data/seed/seedRunner'
import type { InstancePrescription, Prescription, WorkoutInstance, WorkoutTemplate } from '@/data/types'
import { renderApp } from '@/test/renderApp'

const TODAY = '2026-08-24' // Monday
const FUTURE_DATE = '2026-08-31'
const PAST_DATE = '2026-08-17'
const NOW = '2026-08-24T09:00:00.000Z'
const FAKE_NOW = new Date(2026, 7, 24, 9, 0, 0)

const EXERCISE_ID = 'ex_back_squat' // real seeded strengthSets exercise
const PLAN_ID = 'plan_edit_test'

const ORIGINAL_REST_SEC = 150

/**
 * Three instances sharing one exercise (`ex_back_squat`): `wi_today` (today,
 * not frozen -- the one under test), `wi_future` (a later date, not frozen,
 * whose `InstancePrescription` was sourced from its own template `rx_future`),
 * and `wi_frozen` (completed history, with a logged strength set) -- the same
 * three-instance shape `planRepo.test.ts`'s `applyPrescriptionEdit` suite
 * uses, rendered through the real UI instead of called directly.
 */
async function seedEditFixture(): Promise<void> {
  const templates: WorkoutTemplate[] = [
    { id: 'tmpl_today', planId: PLAN_ID, planWeekId: 'week_today', sessionSlot: 1, sequenceInWeek: 0, name: 'Strength A', kind: 'strength', priority: 'essential', recoveryTags: [], estMinutes: 45, notes: '' },
    { id: 'tmpl_future', planId: PLAN_ID, planWeekId: 'week_future', sessionSlot: 1, sequenceInWeek: 0, name: 'Strength A', kind: 'strength', priority: 'essential', recoveryTags: [], estMinutes: 45, notes: '' },
  ]
  await db.workoutTemplates.bulkAdd(templates)

  const prescriptions: Prescription[] = [
    { id: 'rx_today', templateId: 'tmpl_today', exerciseId: EXERCISE_ID, order: 0, sets: 4, repMin: 4, repMax: 6, restSec: ORIGINAL_REST_SEC },
    { id: 'rx_future', templateId: 'tmpl_future', exerciseId: EXERCISE_ID, order: 0, sets: 4, repMin: 4, repMax: 6, restSec: ORIGINAL_REST_SEC },
  ]
  await db.prescriptions.bulkAdd(prescriptions)

  const instances: WorkoutInstance[] = [
    { id: 'wi_today', planId: PLAN_ID, templateId: 'tmpl_today', weekNumber: 1, sessionSlot: 1, plannedDate: TODAY, scheduledDate: TODAY, sequence: 0, priority: 'essential', recoveryTags: [], status: 'available', isManualOverride: false, frozen: false },
    { id: 'wi_future', planId: PLAN_ID, templateId: 'tmpl_future', weekNumber: 2, sessionSlot: 1, plannedDate: FUTURE_DATE, scheduledDate: FUTURE_DATE, sequence: 0, priority: 'essential', recoveryTags: [], status: 'upcoming', isManualOverride: false, frozen: false },
    { id: 'wi_frozen', planId: PLAN_ID, templateId: 'tmpl_today', weekNumber: 0, sessionSlot: 1, plannedDate: PAST_DATE, scheduledDate: PAST_DATE, sequence: 0, priority: 'essential', recoveryTags: [], status: 'completed', isManualOverride: false, frozen: true, completedAt: NOW, completedForDate: PAST_DATE },
  ]
  await db.workoutInstances.bulkAdd(instances)

  const instancePrescriptions: InstancePrescription[] = [
    { id: 'ip_today', instanceId: 'wi_today', templateId: 'tmpl_today', exerciseId: EXERCISE_ID, order: 0, sets: 4, repMin: 4, repMax: 6, restSec: ORIGINAL_REST_SEC, sourcePrescriptionId: 'rx_today' },
    { id: 'ip_future', instanceId: 'wi_future', templateId: 'tmpl_future', exerciseId: EXERCISE_ID, order: 0, sets: 4, repMin: 4, repMax: 6, restSec: ORIGINAL_REST_SEC, sourcePrescriptionId: 'rx_future' },
    { id: 'ip_frozen', instanceId: 'wi_frozen', templateId: 'tmpl_today', exerciseId: EXERCISE_ID, order: 0, sets: 4, repMin: 4, repMax: 6, restSec: ORIGINAL_REST_SEC, sourcePrescriptionId: 'rx_today' },
  ]
  await db.instancePrescriptions.bulkAdd(instancePrescriptions)

  await db.strengthSets.add({
    id: 'set_frozen', instanceId: 'wi_frozen', instancePrescriptionId: 'ip_frozen', exerciseId: EXERCISE_ID,
    setIndex: 0, weight: 175, unit: 'lb', reps: 5, isCompleted: true, completedAt: NOW, isWarmup: false,
  })
}

async function setup(): Promise<void> {
  await resetDatabase()
  await seedIfEmpty(db, NOW)
  await updateSettings({ onboardingCompletedAt: NOW })
  await seedEditFixture()
}

async function renderWorkout(instanceId: string): Promise<void> {
  renderApp({ route: `/workout/${instanceId}` })
  await screen.findByRole('heading', { level: 1 })
}

async function openEditSheet(): Promise<HTMLElement> {
  await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
  const dialog = await screen.findByRole('dialog')
  // The sheet's own data is a `useLiveQuery` read, so the dialog can mount
  // showing "Loading..." for a tick before the form itself appears -- wait
  // for an actual field rather than racing the dialog's own mount.
  await within(dialog).findByLabelText(/rest/i)
  return dialog
}

function setRestSeconds(dialog: HTMLElement, value: string): void {
  const input = within(dialog).getByLabelText(/rest/i)
  fireEvent.change(input, { target: { value } })
}

function chooseScope(dialog: HTMLElement, label: string): void {
  fireEvent.click(within(dialog).getByLabelText(label))
}

/** Clicks Apply and waits for the sheet to close -- `EditPrescriptionSheet`
 * only calls `onClose` after `applyPrescriptionEdit`'s awaited write fully
 * resolves (see its `handleApply`), so waiting for the dialog to disappear
 * is what guarantees every write the scope implies has actually landed,
 * rather than racing `userEvent.click`'s own synchronous return against the
 * fire-and-forget async handler it kicked off. */
async function apply(dialog: HTMLElement): Promise<void> {
  await userEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
  await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
}

beforeEach(async () => {
  await setup()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('editing a prescription from the workout screen', () => {
  it('"Just this workout" changes only that InstancePrescription, leaving the template, the sibling instance, and history untouched', async () => {
    const frozenInstanceBefore = await db.workoutInstances.get('wi_frozen')
    const frozenPrescriptionBefore = await db.instancePrescriptions.get('ip_frozen')
    const setBefore = await db.strengthSets.get('set_frozen')

    await renderWorkout('wi_today')
    const dialog = await openEditSheet()
    setRestSeconds(dialog, '200')
    chooseScope(dialog, 'Just this workout')
    await apply(dialog)

    expect((await db.instancePrescriptions.get('ip_today'))?.restSec).toBe(200)
    expect((await db.prescriptions.get('rx_today'))?.restSec).toBe(ORIGINAL_REST_SEC)
    expect((await db.instancePrescriptions.get('ip_future'))?.restSec).toBe(ORIGINAL_REST_SEC)
    expect((await db.prescriptions.get('rx_future'))?.restSec).toBe(ORIGINAL_REST_SEC)
    expect((await db.exercises.get(EXERCISE_ID))?.defaultRestSec).not.toBe(200)
    expect(await db.instancePrescriptions.get('ip_frozen')).toEqual(frozenPrescriptionBefore)
    expect(await db.workoutInstances.get('wi_frozen')).toEqual(frozenInstanceBefore)
    expect(await db.strengthSets.get('set_frozen')).toEqual(setBefore)
  })

  it('"This and future sessions" changes the source template and the non-frozen sibling instance, leaving the sibling\'s own template and history untouched', async () => {
    const frozenInstanceBefore = await db.workoutInstances.get('wi_frozen')
    const frozenPrescriptionBefore = await db.instancePrescriptions.get('ip_frozen')
    const setBefore = await db.strengthSets.get('set_frozen')

    await renderWorkout('wi_today')
    const dialog = await openEditSheet()
    setRestSeconds(dialog, '220')
    chooseScope(dialog, 'This and future sessions')
    await apply(dialog)

    expect((await db.prescriptions.get('rx_today'))?.restSec).toBe(220)
    expect((await db.instancePrescriptions.get('ip_today'))?.restSec).toBe(220)
    expect((await db.instancePrescriptions.get('ip_future'))?.restSec).toBe(220)
    // The sibling instance's OWN source template is untouched -- only the
    // template `wi_today` itself was sourced from changes.
    expect((await db.prescriptions.get('rx_future'))?.restSec).toBe(ORIGINAL_REST_SEC)
    expect((await db.exercises.get(EXERCISE_ID))?.defaultRestSec).not.toBe(220)
    expect(await db.instancePrescriptions.get('ip_frozen')).toEqual(frozenPrescriptionBefore)
    expect(await db.workoutInstances.get('wi_frozen')).toEqual(frozenInstanceBefore)
    expect(await db.strengthSets.get('set_frozen')).toEqual(setBefore)
  })

  it('"Change the exercise default only" changes the Exercise row and neither template nor any scheduled instance', async () => {
    const ip1Before = await db.instancePrescriptions.get('ip_today')
    const ip2Before = await db.instancePrescriptions.get('ip_future')
    const rx1Before = await db.prescriptions.get('rx_today')
    const rx2Before = await db.prescriptions.get('rx_future')
    const setBefore = await db.strengthSets.get('set_frozen')

    await renderWorkout('wi_today')
    const dialog = await openEditSheet()
    setRestSeconds(dialog, '300')
    chooseScope(dialog, 'Change the exercise default only')
    await apply(dialog)

    expect((await db.exercises.get(EXERCISE_ID))?.defaultRestSec).toBe(300)
    expect(await db.instancePrescriptions.get('ip_today')).toEqual(ip1Before)
    expect(await db.instancePrescriptions.get('ip_future')).toEqual(ip2Before)
    expect(await db.prescriptions.get('rx_today')).toEqual(rx1Before)
    expect(await db.prescriptions.get('rx_future')).toEqual(rx2Before)
    expect(await db.strengthSets.get('set_frozen')).toEqual(setBefore)
  })

  it('offers no Edit control on a frozen (completed) instance', async () => {
    await renderWorkout('wi_frozen')
    await screen.findByText('Back squat')
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
  })

  it('surfaces a real error rather than swallowing it if applying "Just this workout" against a frozen instance is somehow attempted', async () => {
    const { applyPrescriptionEdit } = await import('@/data/repositories')
    await expect(applyPrescriptionEdit({
      instanceId: 'wi_frozen', prescriptionId: 'ip_frozen', patch: { restSec: 999 }, scope: 'thisWorkout', now: NOW,
    })).rejects.toThrow(/immutable/i)
  })
})
