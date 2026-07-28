import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { db, resetDatabase } from '@/data/db'
import { setRaceGoal, updateSettings } from '@/data/repositories'
import { seedIfEmpty } from '@/data/seed/seedRunner'
import type { IntervalSpec, PaceSource } from '@/data/types'
import { renderApp } from '@/test/renderApp'

const TODAY = '2026-08-24' // Monday
const NOW = '2026-08-24T09:00:00.000Z'
const FAKE_NOW = new Date(2026, 7, 24, 9, 0, 0)

interface RunPrescriptionSpec {
  exerciseId: string
  distanceM?: number
  durationSec?: number
  paceSource?: PaceSource
  targetPaceSecPerKm?: number
  intervalSpec?: IntervalSpec
}

let instanceCounter = 0

async function createRunWorkout(specs: RunPrescriptionSpec[]): Promise<string> {
  instanceCounter += 1
  const instanceId = `wi_run_${String(instanceCounter)}`
  const templateId = `tmpl_run_${String(instanceCounter)}`
  await db.workoutTemplates.add({
    id: templateId, planId: 'plan_test', planWeekId: 'week_test', sessionSlot: 1, sequenceInWeek: 1,
    name: 'Run session', kind: 'run', priority: 'essential', recoveryTags: [], estMinutes: 45, notes: '',
  })
  await db.workoutInstances.add({
    id: instanceId, planId: 'plan_test', templateId, weekNumber: 1, sessionSlot: 1,
    plannedDate: TODAY, scheduledDate: TODAY, sequence: 1, priority: 'essential',
    recoveryTags: [], status: 'available', isManualOverride: false, frozen: false,
  })
  let order = 0
  for (const spec of specs) {
    order += 1
    await db.instancePrescriptions.add({
      id: `ip_run_${String(instanceCounter)}_${String(order)}`, instanceId, templateId,
      exerciseId: spec.exerciseId, order, restSec: 0,
      ...(spec.distanceM !== undefined ? { distanceM: spec.distanceM } : {}),
      ...(spec.durationSec !== undefined ? { durationSec: spec.durationSec } : {}),
      ...(spec.paceSource !== undefined ? { paceSource: spec.paceSource } : {}),
      ...(spec.targetPaceSecPerKm !== undefined ? { targetPaceSecPerKm: spec.targetPaceSecPerKm } : {}),
      ...(spec.intervalSpec !== undefined ? { intervalSpec: spec.intervalSpec } : {}),
    })
  }
  return instanceId
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

describe('run logging', () => {
  it('renders distance, duration, surface, run type, and notes inputs with labels', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_easy_run' }])
    await renderWorkout(instanceId)

    expect(await screen.findByLabelText(/distance/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/duration/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument()
    expect(screen.getByText('Surface')).toBeInTheDocument()
    expect(screen.getByText('Run type')).toBeInTheDocument()
    for (const label of ['Track', 'Treadmill', 'Road', 'Other']) expect(screen.getByText(label)).toBeInTheDocument()
    for (const label of ['Easy', 'Long', 'Tempo', 'Intervals', 'Compromised', 'Benchmark', 'Race']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('computes and displays pace live from distance and duration, formatted M:SS/km', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_easy_run' }])
    await renderWorkout(instanceId)

    const distanceInput = screen.getByLabelText(/distance/i)
    const durationInput = screen.getByLabelText(/duration/i)
    fireEvent.change(distanceInput, { target: { value: '5' } })
    fireEvent.change(durationInput, { target: { value: '1900' } })

    expect(await screen.findByText(/Pace: 6:20\/km/)).toBeInTheDocument()
  })

  it('never shows NaN or Infinity — shows the placeholder for zero, empty, or half-entered fields', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_easy_run' }])
    await renderWorkout(instanceId)

    expect(screen.getByText('Pace: —')).toBeInTheDocument()

    const distanceInput = screen.getByLabelText(/distance/i)
    fireEvent.change(distanceInput, { target: { value: '0' } })
    expect(screen.getByText('Pace: —')).toBeInTheDocument()

    fireEvent.change(distanceInput, { target: { value: '5' } })
    expect(screen.getByText('Pace: —')).toBeInTheDocument() // duration still blank

    fireEvent.change(distanceInput, { target: { value: '' } })
    expect(screen.getByText('Pace: —')).toBeInTheDocument()

    expect(screen.queryByText(/NaN/)).toBeNull()
    expect(screen.queryByText(/Infinity/)).toBeNull()
  })

  it('saves with distance and duration alone, computing paceSecPerKm', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_easy_run' }])
    await renderWorkout(instanceId)

    fireEvent.change(screen.getByLabelText(/distance/i), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '1800' } })
    fireEvent.blur(screen.getByLabelText(/duration/i))

    await waitFor(async () => {
      const logs = await db.runLogs.where('instanceId').equals(instanceId).toArray()
      expect(logs).toHaveLength(1)
      expect(logs[0]?.distanceKm).toBe(5)
      expect(logs[0]?.durationSec).toBe(1800)
      expect(logs[0]?.paceSecPerKm).toBe(360)
    })
  })

  it('keeps the splits editor collapsed by default behind a single control', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_easy_run' }])
    await renderWorkout(instanceId)

    expect(screen.getByRole('button', { name: /add splits/i })).toBeInTheDocument()
    expect(screen.queryByLabelText(/warm-up/i)).toBeNull()
    expect(screen.queryByLabelText(/^reps/i)).toBeNull()
  })

  it('opening the splits editor shows warm-up, reps, work distance/duration, recovery, and cooldown fields', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_quality_run' }])
    await renderWorkout(instanceId)

    fireEvent.click(screen.getByRole('button', { name: /add splits/i }))

    expect(screen.getByLabelText(/warm-up/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^reps$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/work distance/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/work duration/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^recovery$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/cool-down/i)).toBeInTheDocument()
  })

  it('entering 5 reps generates 5 work rows plus recovery rows', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_quality_run' }])
    await renderWorkout(instanceId)
    fireEvent.click(screen.getByRole('button', { name: /add splits/i }))

    fireEvent.change(screen.getByLabelText(/^reps$/i), { target: { value: '5' } })

    expect(screen.getAllByLabelText(/^work \d+ duration/i)).toHaveLength(5)
    expect(screen.getAllByLabelText(/^recovery \d+/i)).toHaveLength(5)
  })

  it('shows the work-only mean pace from summarizeSplits', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_quality_run' }])
    await renderWorkout(instanceId)
    fireEvent.click(screen.getByRole('button', { name: /add splits/i }))

    fireEvent.change(screen.getByLabelText(/^reps$/i), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText(/work 1 distance/i), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText(/work 1 duration/i), { target: { value: '240' } })
    fireEvent.change(screen.getByLabelText(/work 2 distance/i), { target: { value: '1000' } })
    fireEvent.change(screen.getByLabelText(/work 2 duration/i), { target: { value: '240' } })

    expect(await screen.findByText(/Work-only mean pace: 4:00\/km/)).toBeInTheDocument()
  })

  it('saving persists IntervalSplit rows with correct index and kind', async () => {
    const instanceId = await createRunWorkout([{
      exerciseId: 'ex_quality_run', distanceM: 1000, durationSec: 240,
      intervalSpec: { reps: 2, workDistanceM: 1000, recoverySec: 90 },
    }])
    await renderWorkout(instanceId)

    fireEvent.change(screen.getByLabelText('Distance'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '600' } })
    fireEvent.blur(screen.getByLabelText('Duration'))

    await waitFor(async () => {
      const logs = await db.runLogs.where('instanceId').equals(instanceId).toArray()
      expect(logs).toHaveLength(1)
      const splits = await db.intervalSplits.where('runLogId').equals(logs[0]!.id).sortBy('index')
      expect(splits.map((s) => s.kind)).toEqual(['work', 'recovery', 'work', 'recovery'])
      expect(splits.map((s) => s.index)).toEqual([0, 1, 2, 3])
    })
  })

  it('prefills the splits editor from an interval prescription\'s intervalSpec', async () => {
    const instanceId = await createRunWorkout([{
      exerciseId: 'ex_quality_run',
      intervalSpec: { warmupSec: 300, reps: 4, workDistanceM: 1000, recoverySec: 90, cooldownSec: 300 },
    }])
    await renderWorkout(instanceId)

    // Auto-expanded — no need to click "Add splits" first.
    expect(screen.getByLabelText(/^reps$/i)).toHaveValue('4')
    expect(screen.getAllByLabelText(/^work \d+ distance/i)).toHaveLength(4)
    expect(screen.getByLabelText<HTMLInputElement>(/^work 1 distance/i).value).toBe('1000')
  })

  it('displays the goal-derived target pace for a race-pace prescription, and updates it when the goal changes', async () => {
    await setRaceGoal({ raceDate: '2027-01-01', targetSeconds: 5400, stretchSeconds: 5700 }, NOW)
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_quality_run', paceSource: 'goalRacePace' }])
    await renderWorkout(instanceId)

    expect(await screen.findByText(/Goal pace: 6:00\/km/)).toBeInTheDocument()

    await setRaceGoal({ raceDate: '2027-01-01', targetSeconds: 6000, stretchSeconds: 6300 }, NOW)

    await waitFor(() => { expect(screen.getByText(/Goal pace: 7:15\/km/)).toBeInTheDocument() })
  })
})
