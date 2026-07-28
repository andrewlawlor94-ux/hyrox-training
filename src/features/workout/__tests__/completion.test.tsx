import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { db, resetDatabase } from '@/data/db'
import { readSettings, updateSettings } from '@/data/repositories'
import { seedIfEmpty } from '@/data/seed/seedRunner'
import { RED_FLAG_QUESTIONS } from '@/domain/symptoms/redFlags'
import { renderApp } from '@/test/renderApp'

const TODAY = '2026-08-26' // Wednesday
const NOW = '2026-08-26T09:00:00.000Z'
const FAKE_NOW = new Date(2026, 7, 26, 9, 0, 0)

async function createSimpleWorkout(): Promise<string> {
  const instanceId = 'wi_completion_1'
  await db.workoutTemplates.add({
    id: 'tmpl_completion_1', planId: 'plan_test', planWeekId: 'week_test', sessionSlot: 1, sequenceInWeek: 1,
    name: 'Easy run day', kind: 'run', priority: 'essential', recoveryTags: [], estMinutes: 30, notes: '',
  })
  await db.workoutInstances.add({
    id: instanceId, planId: 'plan_test', templateId: 'tmpl_completion_1', weekNumber: 1, sessionSlot: 1,
    plannedDate: TODAY, scheduledDate: TODAY, sequence: 1, priority: 'essential',
    recoveryTags: [], status: 'available', isManualOverride: false, frozen: false,
  })
  await db.instancePrescriptions.add({
    id: 'ip_completion_1', instanceId, templateId: 'tmpl_completion_1', exerciseId: 'ex_easy_run', order: 1, restSec: 0,
  })
  return instanceId
}

/** Two same-week instances so a backdated completion of the first collides
 * with the second's planned date, producing a `backdatedExplanation` (see
 * `@/domain/queue/placement.ts`). */
async function createBackdateScenario(): Promise<{ instance1: string; instance2: string }> {
  await db.plans.add({ id: 'plan_bd', name: 'Plan', weeksCount: 24, status: 'active', startDate: '2026-08-24', raceGoalId: 'goal_bd', createdAt: NOW })
  await db.raceGoals.add({ id: 'goal_bd', raceDate: '2027-01-01', targetSeconds: 6000, stretchSeconds: 6300, division: '', isActive: true, createdAt: NOW })
  await db.planWeeks.add({ id: 'week_bd', planId: 'plan_bd', weekNumber: 1, phaseId: 'phase_bd', label: 'Week 1', isDeload: false, notes: '' })
  await db.workoutTemplates.bulkAdd([
    { id: 'tmpl_bd_1', planId: 'plan_bd', planWeekId: 'week_bd', sessionSlot: 1, sequenceInWeek: 1, name: 'Session A', kind: 'run', priority: 'essential', recoveryTags: [], estMinutes: 30, notes: '' },
    { id: 'tmpl_bd_2', planId: 'plan_bd', planWeekId: 'week_bd', sessionSlot: 2, sequenceInWeek: 2, name: 'Session B', kind: 'run', priority: 'essential', recoveryTags: [], estMinutes: 30, notes: '' },
  ])
  await db.workoutInstances.bulkAdd([
    { id: 'wi_bd_1', planId: 'plan_bd', templateId: 'tmpl_bd_1', weekNumber: 1, sessionSlot: 1, plannedDate: '2026-08-24', scheduledDate: '2026-08-24', sequence: 1, priority: 'essential', recoveryTags: [], status: 'available', isManualOverride: false, frozen: false },
    { id: 'wi_bd_2', planId: 'plan_bd', templateId: 'tmpl_bd_2', weekNumber: 1, sessionSlot: 2, plannedDate: '2026-08-25', scheduledDate: '2026-08-25', sequence: 2, priority: 'essential', recoveryTags: [], status: 'upcoming', isManualOverride: false, frozen: false },
  ])
  await updateSettings({ activePlanId: 'plan_bd' })
  return { instance1: 'wi_bd_1', instance2: 'wi_bd_2' }
}

async function setup(): Promise<void> {
  await resetDatabase()
  await seedIfEmpty(db, NOW)
  await updateSettings({ onboardingCompletedAt: NOW })
}

async function renderWorkout(instanceId: string): Promise<void> {
  renderApp({ route: `/workout/${instanceId}` })
  await screen.findByRole('heading', { level: 1 })
}

beforeEach(async () => {
  await setup()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('workout completion', () => {
  it('shows three horizontally arranged 0-10 scales with a default of 0, and all five completion states', async () => {
    const instanceId = await createSimpleWorkout()
    await renderWorkout(instanceId)

    expect(screen.getByText('Session RPE')).toBeInTheDocument()
    expect(screen.getByText('Shin pain')).toBeInTheDocument()
    expect(screen.getByText('Sciatic/back')).toBeInTheDocument()
    expect(document.getElementById(`symptom-${instanceId}-rpe-0`)).toBeChecked()
    expect(document.getElementById(`symptom-${instanceId}-shin-0`)).toBeChecked()
    expect(document.getElementById(`symptom-${instanceId}-sciatic-0`)).toBeChecked()

    for (const label of ['Completed', 'Partially completed', 'Completed earlier', 'Deferred', 'Skipped']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('Completed writes a symptom log, freezes the instance, appends COMPLETE, and navigates Home', async () => {
    const instanceId = await createSimpleWorkout()
    await renderWorkout(instanceId)

    fireEvent.click(document.getElementById(`symptom-${instanceId}-rpe-6`)!)
    fireEvent.click(screen.getByRole('button', { name: 'Completed' }))

    await waitFor(async () => {
      const instance = await db.workoutInstances.get(instanceId)
      expect(instance?.status).toBe('completed')
      expect(instance?.frozen).toBe(true)
    })
    const logs = await db.symptomLogs.where('instanceId').equals(instanceId).toArray()
    expect(logs).toHaveLength(1)
    expect(logs[0]?.sessionRpe).toBe(6)
    const events = await db.scheduleEvents.toArray()
    expect(events.filter((e) => e.type === 'COMPLETE')).toHaveLength(1)
    expect(await screen.findByText('Home')).toBeInTheDocument()
  })

  it('Partially completed sets partiallyCompleted, never completed', async () => {
    const instanceId = await createSimpleWorkout()
    await renderWorkout(instanceId)

    fireEvent.click(screen.getByRole('button', { name: 'Partially completed' }))

    await waitFor(async () => {
      const instance = await db.workoutInstances.get(instanceId)
      expect(instance?.status).toBe('partiallyCompleted')
      expect(instance?.status).not.toBe('completed')
    })
  })

  it('Deferred appends a DEFER event and writes no symptom log', async () => {
    const instanceId = await createSimpleWorkout()
    await renderWorkout(instanceId)

    fireEvent.click(screen.getByRole('button', { name: 'Deferred' }))

    await waitFor(async () => {
      const events = await db.scheduleEvents.toArray()
      expect(events.filter((e) => e.type === 'DEFER')).toHaveLength(1)
    })
    expect(await db.symptomLogs.where('instanceId').equals(instanceId).toArray()).toHaveLength(0)
  })

  it('Skipped appends a SKIP event and writes no symptom log', async () => {
    const instanceId = await createSimpleWorkout()
    await renderWorkout(instanceId)

    fireEvent.click(screen.getByRole('button', { name: 'Skipped' }))

    await waitFor(async () => {
      const events = await db.scheduleEvents.toArray()
      expect(events.filter((e) => e.type === 'SKIP')).toHaveLength(1)
    })
    expect(await db.symptomLogs.where('instanceId').equals(instanceId).toArray()).toHaveLength(0)
  })

  it('completing twice by double-tapping produces exactly one event', async () => {
    const instanceId = await createSimpleWorkout()
    await renderWorkout(instanceId)

    const button = screen.getByRole('button', { name: 'Completed' })
    fireEvent.click(button)
    fireEvent.click(button)

    await waitFor(async () => {
      const instance = await db.workoutInstances.get(instanceId)
      expect(instance?.frozen).toBe(true)
    })
    const events = await db.scheduleEvents.toArray()
    expect(events).toHaveLength(1)
  })

  it('Completed earlier opens a past-dates-only picker, writes completedForDate and COMPLETE_EARLIER, and syncQueue mentions the backdated session', async () => {
    const { instance1, instance2 } = await createBackdateScenario()
    await renderWorkout(instance1)

    fireEvent.click(screen.getByRole('button', { name: 'Completed earlier' }))
    const dateInput = await screen.findByLabelText<HTMLInputElement>('Date completed')
    expect(dateInput.max).toBe('2026-08-25') // yesterday relative to TODAY, never today or later
    fireEvent.change(dateInput, { target: { value: '2026-08-25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log completion' }))

    await waitFor(async () => {
      const instance = await db.workoutInstances.get(instance1)
      expect(instance?.completedForDate).toBe('2026-08-25')
      expect(instance?.status).toBe('completed')
    })
    const events = await db.scheduleEvents.toArray()
    expect(events.filter((e) => e.type === 'COMPLETE_EARLIER')).toHaveLength(1)

    await waitFor(async () => {
      const explanations = await db.queueExplanations.toArray()
      expect(explanations.some((e) => /backdated/i.test(e.text))).toBe(true)
    })
    const instance2After = await db.workoutInstances.get(instance2)
    expect(instance2After?.scheduledDate).not.toBe('2026-08-25')
  })

  it('shows the red-flag screen only when sciatic reaches 5, never for shin alone', async () => {
    const instanceId = await createSimpleWorkout()
    await renderWorkout(instanceId)

    fireEvent.click(document.getElementById(`symptom-${instanceId}-shin-9`)!)
    for (const q of RED_FLAG_QUESTIONS) expect(screen.queryByText(q.label)).toBeNull()

    fireEvent.click(document.getElementById(`symptom-${instanceId}-sciatic-5`)!)
    for (const q of RED_FLAG_QUESTIONS) expect(screen.getByText(q.label)).toBeInTheDocument()
    expect(RED_FLAG_QUESTIONS).toHaveLength(3)
  })

  it('answering yes to a red-flag question shows the urgent message and persists on Home until dismissed; no to all shows nothing', async () => {
    const instanceId = await createSimpleWorkout()
    await renderWorkout(instanceId)
    fireEvent.click(document.getElementById(`symptom-${instanceId}-sciatic-5`)!)

    const firstQuestion = RED_FLAG_QUESTIONS[0]!
    const questionGroup = screen.getByRole('group', { name: firstQuestion.label })
    fireEvent.click(within(questionGroup).getByRole('radio', { name: 'Yes' }))

    await waitFor(async () => {
      const settings = await readSettings()
      expect(settings.urgentRedFlagAt).toBeTruthy()
    })
    expect(await screen.findByText(/emergency/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: 'Home' }))
    expect(await screen.findByText(/same-day/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => { expect(screen.queryByText(/same-day/i)).toBeNull() })
  })
})
