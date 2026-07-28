import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { db, openDb, resetDatabase } from '@/data/db'
import { updateSettings } from '@/data/repositories'
import { seedIfEmpty } from '@/data/seed/seedRunner'
import type { WorkoutStatus } from '@/data/types'
import { renderApp } from '@/test/renderApp'

const TODAY = '2026-08-24'
const NOW = '2026-08-24T09:00:00.000Z'
/** Local date/time (not a UTC instant) matching TODAY, faked so `useToday()`
 * and every `new Date()` read in the workout feature agree with the
 * fixtures below regardless of which real day the test happens to run on. */
const FAKE_NOW = new Date(2026, 7, 24, 9, 0, 0)
const REAL_WAIT_SHORT_MS = 500
const REAL_WAIT_LONG_MS = 1500

let instanceCounter = 0

async function createWorkout(exerciseIds: string[], opts?: { status?: WorkoutStatus }): Promise<string> {
  instanceCounter += 1
  const instanceId = `wi_auto_${String(instanceCounter)}`
  const templateId = `tmpl_auto_${String(instanceCounter)}`
  await db.workoutInstances.add({
    id: instanceId, planId: 'plan_test', templateId, weekNumber: 1, sessionSlot: 1,
    plannedDate: TODAY, scheduledDate: TODAY, sequence: 1, priority: 'essential',
    recoveryTags: [], status: opts?.status ?? 'available', isManualOverride: false, frozen: false,
  })
  let order = 0
  for (const exerciseId of exerciseIds) {
    order += 1
    await db.instancePrescriptions.add({
      id: `ip_auto_${String(instanceCounter)}_${String(order)}`, instanceId, templateId, exerciseId, order, restSec: 90,
    })
  }
  return instanceId
}

async function setup(): Promise<void> {
  await resetDatabase()
  const database = await openDb()
  await seedIfEmpty(database, NOW)
  await updateSettings({ onboardingCompletedAt: NOW })
}

async function renderWorkout(instanceId: string): Promise<ReturnType<typeof renderApp>> {
  const result = renderApp({ route: `/workout/${instanceId}` })
  await screen.findByRole('heading', { level: 1 })
  return result
}

async function weightSetIndex(instanceId: string, setIndex: number): Promise<number | undefined> {
  const sets = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
  return sets.find((s) => s.setIndex === setIndex)?.weight
}

beforeEach(async () => {
  await setup()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
})

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

describe('workout autosave', () => {
  it('debounces a typed weight, persisting it to IndexedDB without waiting for blur', async () => {
    const instanceId = await createWorkout(['ex_back_squat'])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')

    const weightInput = (await screen.findAllByLabelText<HTMLInputElement>(/weight/i))[0]
    if (!weightInput) throw new Error('expected a weight input')
    fireEvent.change(weightInput, { target: { value: '185' } })

    // Not yet written — proves the write is debounced, not immediate.
    expect(await weightSetIndex(instanceId, 0)).toBeUndefined()

    await waitFor(async () => {
      expect(await weightSetIndex(instanceId, 0)).toBe(185)
    }, { timeout: REAL_WAIT_LONG_MS })
  })

  it('flushes immediately on blur, without waiting for the debounce', async () => {
    const instanceId = await createWorkout(['ex_back_squat'])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')

    const weightInput = (await screen.findAllByLabelText<HTMLInputElement>(/weight/i))[0]
    if (!weightInput) throw new Error('expected a weight input')
    fireEvent.change(weightInput, { target: { value: '190' } })
    fireEvent.blur(weightInput)

    await waitFor(async () => {
      expect(await weightSetIndex(instanceId, 0)).toBe(190)
    }, { timeout: REAL_WAIT_SHORT_MS })
  })

  it('flushes pending edits on unmount', async () => {
    const instanceId = await createWorkout(['ex_back_squat'])
    const { unmount } = await renderWorkout(instanceId)
    await screen.findByText('Back squat')

    const weightInput = (await screen.findAllByLabelText<HTMLInputElement>(/weight/i))[0]
    if (!weightInput) throw new Error('expected a weight input')
    fireEvent.change(weightInput, { target: { value: '195' } })

    unmount()

    await waitFor(async () => {
      expect(await weightSetIndex(instanceId, 0)).toBe(195)
    }, { timeout: REAL_WAIT_SHORT_MS })
  })

  it('survives a remount: a weight typed into set 2 (never blurred) is still there after remounting', async () => {
    const instanceId = await createWorkout(['ex_back_squat'])
    const { unmount } = await renderWorkout(instanceId)
    await screen.findByText('Back squat')
    await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i).length).toBeGreaterThanOrEqual(2) })

    const secondWeightInput = screen.getAllByLabelText<HTMLInputElement>(/weight/i)[1]
    if (!secondWeightInput) throw new Error('expected a second set row')
    fireEvent.change(secondWeightInput, { target: { value: '201' } })
    unmount()

    await waitFor(async () => {
      expect(await weightSetIndex(instanceId, 1)).toBe(201)
    }, { timeout: REAL_WAIT_SHORT_MS })

    await renderWorkout(instanceId)
    await screen.findByText('Back squat')
    await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i).length).toBeGreaterThanOrEqual(2) })
    const remounted = screen.getAllByLabelText<HTMLInputElement>(/weight/i)[1]
    if (!remounted) throw new Error('expected a second set row after remount')
    expect(remounted.value).toBe('201')
  })

  it('flushes pending edits when the document goes hidden', async () => {
    const instanceId = await createWorkout(['ex_back_squat'])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')

    const weightInput = (await screen.findAllByLabelText<HTMLInputElement>(/weight/i))[0]
    if (!weightInput) throw new Error('expected a weight input')
    fireEvent.change(weightInput, { target: { value: '210' } })

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))

    await waitFor(async () => {
      expect(await weightSetIndex(instanceId, 0)).toBe(210)
    }, { timeout: REAL_WAIT_SHORT_MS })
  })

  it('marks the instance inProgress on open, so Home can offer Continue', async () => {
    const instanceId = await createWorkout(['ex_back_squat'], { status: 'available' })
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')

    await waitFor(async () => {
      const instance = await db.workoutInstances.get(instanceId)
      expect(instance?.status).toBe('inProgress')
    })
  })

  it('holds no React state that is absent from the database after a flush — every row survives a remount unchanged', async () => {
    const instanceId = await createWorkout(['ex_back_squat'])
    const { unmount } = await renderWorkout(instanceId)
    await screen.findByText('Back squat')
    await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i)).toHaveLength(4) })

    const typed = ['101', '102', '103', '104']
    const inputs = screen.getAllByLabelText<HTMLInputElement>(/weight/i)
    for (const [i, value] of typed.entries()) {
      const input = inputs[i]
      if (!input) throw new Error(`expected row ${String(i)}`)
      fireEvent.change(input, { target: { value } })
      fireEvent.blur(input)
    }

    await waitFor(async () => {
      const sets = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
      for (const [i, value] of typed.entries()) {
        expect(sets.find((s) => s.setIndex === i)?.weight).toBe(Number(value))
      }
    })

    unmount()
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')
    await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i)).toHaveLength(4) })

    const remountedInputs = screen.getAllByLabelText<HTMLInputElement>(/weight/i)
    for (const [i, value] of typed.entries()) {
      expect(remountedInputs[i]?.value).toBe(value)
    }
  })
})
