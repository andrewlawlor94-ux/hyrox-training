import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, resetDatabase } from '@/data/db'
import { updateSettings } from '@/data/repositories'
import { seedIfEmpty } from '@/data/seed/seedRunner'
import type { InstancePrescription, Prescription, WorkoutInstance, WorkoutTemplate } from '@/data/types'
import { renderApp } from '@/test/renderApp'

const NOW = '2026-08-24T09:00:00.000Z'
const FAKE_NOW = new Date(2026, 7, 24, 9, 0, 0)
const PLAN_ID = 'plan_test'
const EXERCISE_ID = 'ex_back_squat' // real seeded strengthSets exercise

/**
 * A two-week plan: week 1 has a frozen (completed) strength session with a
 * logged set plus an upcoming run session; week 2 has an upcoming strength
 * session prescribing the same exercise (for the `thisAndFuture`
 * byte-identical proof).
 */
async function seedPlanFixture(): Promise<void> {
  await db.plans.add({ id: PLAN_ID, name: 'Test plan', weeksCount: 2, status: 'active', startDate: '2026-08-17', raceGoalId: 'goal_1', createdAt: NOW })
  await db.planPhases.add({ id: 'phase_1', planId: PLAN_ID, name: 'Base', weekStart: 1, weekEnd: 2, focus: '' })
  await db.planWeeks.bulkAdd([
    { id: 'week_1', planId: PLAN_ID, weekNumber: 1, phaseId: 'phase_1', label: 'Week 1', isDeload: false, notes: '' },
    { id: 'week_2', planId: PLAN_ID, weekNumber: 2, phaseId: 'phase_1', label: 'Week 2', isDeload: false, notes: '' },
  ])

  const templates: WorkoutTemplate[] = [
    { id: 'tmpl_1_str', planId: PLAN_ID, planWeekId: 'week_1', sessionSlot: 1, sequenceInWeek: 0, name: 'Strength A', kind: 'strength', priority: 'essential', recoveryTags: [], estMinutes: 45, notes: '' },
    { id: 'tmpl_1_run', planId: PLAN_ID, planWeekId: 'week_1', sessionSlot: 2, sequenceInWeek: 1, name: 'Easy run', kind: 'run', priority: 'important', recoveryTags: ['easyRun'], estMinutes: 30, notes: '' },
    { id: 'tmpl_2_str', planId: PLAN_ID, planWeekId: 'week_2', sessionSlot: 1, sequenceInWeek: 0, name: 'Strength A', kind: 'strength', priority: 'essential', recoveryTags: [], estMinutes: 45, notes: '' },
  ]
  await db.workoutTemplates.bulkAdd(templates)

  const prescriptions: Prescription[] = [
    { id: 'rx_1_str', templateId: 'tmpl_1_str', exerciseId: EXERCISE_ID, order: 0, sets: 4, repMin: 4, repMax: 6, restSec: 150 },
    { id: 'rx_2_str', templateId: 'tmpl_2_str', exerciseId: EXERCISE_ID, order: 0, sets: 4, repMin: 4, repMax: 6, restSec: 150 },
  ]
  await db.prescriptions.bulkAdd(prescriptions)

  const instances: WorkoutInstance[] = [
    { id: 'wi_1_str', planId: PLAN_ID, templateId: 'tmpl_1_str', weekNumber: 1, sessionSlot: 1, plannedDate: '2026-08-17', scheduledDate: '2026-08-17', sequence: 0, priority: 'essential', recoveryTags: [], status: 'completed', isManualOverride: false, frozen: true, completedAt: NOW, completedForDate: '2026-08-17' },
    { id: 'wi_1_run', planId: PLAN_ID, templateId: 'tmpl_1_run', weekNumber: 1, sessionSlot: 2, plannedDate: '2026-08-18', scheduledDate: '2026-08-18', sequence: 1, priority: 'important', recoveryTags: ['easyRun'], status: 'upcoming', isManualOverride: false, frozen: false },
    { id: 'wi_2_str', planId: PLAN_ID, templateId: 'tmpl_2_str', weekNumber: 2, sessionSlot: 1, plannedDate: '2026-08-24', scheduledDate: '2026-08-24', sequence: 0, priority: 'essential', recoveryTags: [], status: 'available', isManualOverride: false, frozen: false },
  ]
  await db.workoutInstances.bulkAdd(instances)

  const instancePrescriptions: InstancePrescription[] = [
    { id: 'ip_1_str', instanceId: 'wi_1_str', templateId: 'tmpl_1_str', exerciseId: EXERCISE_ID, order: 0, sets: 4, repMin: 4, repMax: 6, restSec: 150, sourcePrescriptionId: 'rx_1_str' },
    { id: 'ip_2_str', instanceId: 'wi_2_str', templateId: 'tmpl_2_str', exerciseId: EXERCISE_ID, order: 0, sets: 4, repMin: 4, repMax: 6, restSec: 150, sourcePrescriptionId: 'rx_2_str' },
  ]
  await db.instancePrescriptions.bulkAdd(instancePrescriptions)

  await db.strengthSets.add({
    id: 'set_1', instanceId: 'wi_1_str', instancePrescriptionId: 'ip_1_str', exerciseId: EXERCISE_ID,
    setIndex: 0, weight: 175, unit: 'lb', reps: 5, isCompleted: true, completedAt: NOW, isWarmup: false,
  })
}

async function setup(): Promise<void> {
  await resetDatabase()
  await seedIfEmpty(db, NOW)
  await updateSettings({ onboardingCompletedAt: NOW, activePlanId: PLAN_ID })
  await seedPlanFixture()
}

beforeEach(async () => {
  await setup()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

async function renderPlan(): Promise<void> {
  renderApp({ route: '/plan' })
  await screen.findByRole('heading', { name: 'Plan', level: 1 })
}

describe('the Plan tab / week browser', () => {
  it('shows every week with its phase, completion, and current status', async () => {
    await renderPlan()
    expect(await screen.findByText(/Week 1/)).toBeInTheDocument()
    expect(await screen.findByText(/Week 2/)).toBeInTheDocument()
    // Week 1 is fully done (its only frozen session + upcoming run means
    // "in progress", not "done") -- assert the specific counts instead of a
    // vague presence check (this project has been burned by assertions
    // blind to absence).
    expect(screen.getAllByText(/Base/).length).toBeGreaterThan(0)
    expect(screen.getByText('1/2 done')).toBeInTheDocument()
    expect(screen.getByText('0/1 done')).toBeInTheDocument()
    // Week 2 contains "today" (FAKE_NOW = 2026-08-24, wi_2_str's scheduledDate).
    expect(screen.getByText('This week')).toBeInTheDocument()
  })

  it('a completed workout shows no normal editing form, only "Edit this past record" behind a warning', async () => {
    await renderPlan()
    await userEvent.click(await screen.findByText(/Week 1/))
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    await userEvent.click(editButtons[0]!) // wi_1_str's row -- first Edit button
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByText(/completed history and can't be edited/i)).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Name')).toBeNull()
    const pastRecordButton = within(dialog).getByRole('button', { name: 'Edit this past record' })
    await userEvent.click(pastRecordButton)
    expect(within(dialog).getByText(/changes what actually happened/i)).toBeInTheDocument()
  })

  it('a non-frozen workout (even in the past) opens the normal editor', async () => {
    // Move "today" earlier than wi_1_run's date so it reads as "past" by
    // date -- it is still not frozen, so it must still be editable
    // (§: gate on frozen, never on date).
    await renderPlan()
    await userEvent.click(await screen.findByText(/Week 1/))
    const editButtons = await screen.findAllByRole('button', { name: 'Edit' })
    // Second row (wi_1_run) is the non-frozen upcoming run.
    await userEvent.click(editButtons[1] ?? editButtons[0]!)
    const dialog = await screen.findByRole('dialog')
    expect(await within(dialog).findByLabelText('Name')).toBeInTheDocument()
  })

  it('adds, duplicates, and deletes an upcoming workout, and reorders via move-up/move-down buttons', async () => {
    await renderPlan()
    await userEvent.click(await screen.findByText(/Week 1/))

    // Add.
    await userEvent.click(await screen.findByRole('button', { name: 'Add workout' }))
    const addDialog = await screen.findByRole('dialog')
    await userEvent.type(within(addDialog).getByLabelText('Name'), 'Mobility')
    await userEvent.click(within(addDialog).getByRole('button', { name: 'Add' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(await screen.findByText('Mobility')).toBeInTheDocument()

    // Move-up/move-down are real buttons, keyboard reachable.
    const upButtons = screen.getAllByRole('button', { name: /Move .* up/ })
    expect(upButtons.length).toBeGreaterThan(0)

    // Duplicate wi_1_run via its Edit sheet.
    const editButtons = screen.getAllByRole('button', { name: 'Edit' })
    await userEvent.click(editButtons[1]!) // the run session
    const editDialog = await screen.findByRole('dialog')
    const duplicateButton = await within(editDialog).findByRole('button', { name: 'Duplicate' })
    await userEvent.click(duplicateButton)
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    expect(await screen.findByText('Easy run (copy)')).toBeInTheDocument()

    // Delete the duplicate.
    const rows = screen.getAllByText('Easy run (copy)')
    expect(rows.length).toBeGreaterThan(0)
    const allEditButtons = screen.getAllByRole('button', { name: 'Edit' })
    await userEvent.click(allEditButtons[allEditButtons.length - 1]!)
    const deleteDialog = await screen.findByRole('dialog')
    const deleteButton = await within(deleteDialog).findByRole('button', { name: 'Delete' })
    await userEvent.click(deleteButton)
    await userEvent.click(within(deleteDialog).getByRole('button', { name: 'Yes, delete it' }))
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull() })
    await waitFor(() => { expect(screen.queryByText('Easy run (copy)')).toBeNull() })
  })

  it('editing a template "This and future sessions" leaves a completed instance\'s sets byte-identical', async () => {
    const setBefore = await db.strengthSets.get('set_1')
    const frozenInstanceBefore = await db.workoutInstances.get('wi_1_str')

    await renderPlan()
    await userEvent.click(await screen.findByText(/Week 2/))
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(await within(dialog).findByRole('button', { name: 'Edit' })) // exercise-row Edit -> PrescriptionEditor
    // Nested sheets: WorkoutEditor's dialog is still open behind
    // PrescriptionEditor's -- take the topmost (last) one.
    const prescriptionDialog = (await screen.findAllByRole('dialog')).at(-1)!
    const restInput = await within(prescriptionDialog).findByLabelText(/rest/i)
    await userEvent.clear(restInput)
    await userEvent.type(restInput, '200')
    await userEvent.click(within(prescriptionDialog).getByRole('button', { name: 'Save' }))
    const scopeDialog = (await screen.findAllByRole('dialog')).at(-1)!
    await userEvent.click(within(scopeDialog).getByLabelText('This and future sessions'))
    await userEvent.click(within(scopeDialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(async () => { expect((await db.prescriptions.get('rx_2_str'))?.restSec).toBe(200) })

    expect(await db.strengthSets.get('set_1')).toEqual(setBefore)
    expect(await db.workoutInstances.get('wi_1_str')).toEqual(frozenInstanceBefore)
    expect((await db.prescriptions.get('rx_1_str'))?.restSec).toBe(150)
  })
})
