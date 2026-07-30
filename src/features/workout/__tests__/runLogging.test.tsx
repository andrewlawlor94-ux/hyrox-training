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
    // Surface is genuinely the athlete's own choice — where they ran — so it
    // stays a picker.
    for (const label of ['Track', 'Treadmill', 'Road', 'Other']) expect(screen.getByText(label)).toBeInTheDocument()

    // The run TYPE is prescribed by the program, so it is stated rather than
    // offered (athlete: "it should tell me what type to do as it is a
    // program"). ex_easy_run prescribes Easy, and none of the other six types
    // is presented as a choice up front.
    expect(screen.getByText('Easy')).toBeInTheDocument()
    for (const label of ['Long', 'Tempo', 'Intervals', 'Compromised', 'Benchmark', 'Race']) {
      expect(screen.queryByText(label), label).toBeNull()
    }
    // The override exists, but only behind a disclosure.
    expect(screen.getByRole('button', { name: /ran a different type/i })).toBeInTheDocument()
  })

  it('states the prescribed run type per exercise, deriving intervals from the prescription itself', async () => {
    const longRun = await createRunWorkout([{ exerciseId: 'ex_long_run' }])
    await renderWorkout(longRun)
    expect(await screen.findByText('Long')).toBeInTheDocument()

    // An interval spec means intervals regardless of which exercise carries it.
    const intervals = await createRunWorkout([{
      exerciseId: 'ex_quality_run',
      intervalSpec: { reps: 4, workDistanceM: 1000, recoverySec: 90 },
    }])
    await renderWorkout(intervals)
    expect(await screen.findByText('Intervals')).toBeInTheDocument()
  })

  it('lets the athlete record a run that differed from the prescription, and says it differed', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_easy_run' }])
    await renderWorkout(instanceId)

    fireEvent.change(screen.getByLabelText(/distance/i), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '22:00' } })
    fireEvent.blur(screen.getByLabelText(/duration/i))

    fireEvent.click(screen.getByRole('button', { name: /ran a different type/i }))
    fireEvent.click(await screen.findByRole('radio', { name: 'Tempo' }))

    // Persisted as what was actually run — logging a tempo effort as "easy"
    // would corrupt Progress's pace-by-run-type comparison.
    await waitFor(async () => {
      const logs = await db.runLogs.where('instanceId').equals(instanceId).toArray()
      expect(logs[0]?.runType).toBe('tempo')
    })
    // And the difference from the prescription is shown, not hidden: the
    // prescribed type stays visible next to what was logged. Scoped to that
    // row, since "Easy" is also a radio option once the picker is open.
    const prescribedRow = document.querySelector('.run-block__type-prescribed')
    expect(prescribedRow?.textContent).toContain('Easy')
    expect(prescribedRow?.textContent).toContain('Logged as Tempo')
  })

  it('accepts a duration as mm:ss and normalises what it shows, instead of demanding raw seconds', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_easy_run' }])
    await renderWorkout(instanceId)

    const durationInput = screen.getByLabelText<HTMLInputElement>(/duration/i)
    fireEvent.change(screen.getByLabelText(/distance/i), { target: { value: '5' } })
    fireEvent.change(durationInput, { target: { value: '28:30' } })
    fireEvent.blur(durationInput)

    await waitFor(async () => {
      const logs = await db.runLogs.where('instanceId').equals(instanceId).toArray()
      expect(logs[0]?.durationSec).toBe(28 * 60 + 30)
    })

    // A bare number means MINUTES, and the field shows how it was read so a
    // mistyped value is visible rather than silently stored.
    fireEvent.change(durationInput, { target: { value: '45' } })
    fireEvent.blur(durationInput)
    await waitFor(() => { expect(durationInput.value).toBe('45:00') })
    await waitFor(async () => {
      const logs = await db.runLogs.where('instanceId').equals(instanceId).toArray()
      expect(logs[0]?.durationSec).toBe(45 * 60)
    })
  })

  it('refuses an unparseable duration rather than committing null and deleting the run', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_easy_run' }])
    await renderWorkout(instanceId)

    const durationInput = screen.getByLabelText<HTMLInputElement>(/duration/i)
    fireEvent.change(screen.getByLabelText(/distance/i), { target: { value: '5' } })
    fireEvent.change(durationInput, { target: { value: '30:00' } })
    fireEvent.blur(durationInput)
    await waitFor(async () => {
      expect(await db.runLogs.where('instanceId').equals(instanceId).count()).toBe(1)
    })

    fireEvent.change(durationInput, { target: { value: 'half an hour' } })
    fireEvent.blur(durationInput)

    expect(await screen.findByRole('alert')).toHaveTextContent(/mm:ss/i)
    // The junk is neither saved nor treated as "cleared" — the real run stands.
    const logs = await db.runLogs.where('instanceId').equals(instanceId).toArray()
    expect(logs).toHaveLength(1)
    expect(logs[0]?.durationSec).toBe(1800)
  })

  it('computes and displays pace live from distance and duration, formatted M:SS/km', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_easy_run' }])
    await renderWorkout(instanceId)

    const distanceInput = screen.getByLabelText(/distance/i)
    const durationInput = screen.getByLabelText(/duration/i)
    fireEvent.change(distanceInput, { target: { value: '5' } })
    fireEvent.change(durationInput, { target: { value: '31:40' } })
    fireEvent.blur(durationInput)

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
    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '30:00' } })
    fireEvent.blur(screen.getByLabelText(/duration/i))

    await waitFor(async () => {
      const logs = await db.runLogs.where('instanceId').equals(instanceId).toArray()
      expect(logs).toHaveLength(1)
      expect(logs[0]?.distanceKm).toBe(5)
      expect(logs[0]?.durationSec).toBe(1800)
      expect(logs[0]?.paceSecPerKm).toBe(360)
    })
  })

  it('I2/I1 root cause: a zero-value field is never persisted as a "real" run — the row is removed, not saved with a 0', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_easy_run' }])
    await renderWorkout(instanceId)

    fireEvent.change(screen.getByLabelText(/distance/i), { target: { value: '5' } })
    fireEvent.change(screen.getByLabelText(/duration/i), { target: { value: '0:00' } })
    fireEvent.blur(screen.getByLabelText(/duration/i))

    // Asserting a NEGATIVE outcome ("no row was written") can't use
    // `waitFor` for its usual "eventually true" purpose — the flush this
    // triggers is a genuine in-flight async write, so a bare `waitFor`
    // could pass vacuously on its very first (pre-write) poll. A real delay
    // comfortably past the flush's write time makes the check land after
    // whatever the write attempt was actually going to do.
    await new Promise((resolve) => { setTimeout(resolve, 400) })

    // A zero duration is never a real, loggable run — the stored row must
    // not exist at all (never `durationSec: 0`), so a downstream mean/best
    // calculation over the raw table can never be poisoned by it.
    const logs = await db.runLogs.where('instanceId').equals(instanceId).toArray()
    expect(logs).toHaveLength(0)
  })

  it('I3: clearing duration after a real save removes the whole stored row, not just the field', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_easy_run' }])
    await renderWorkout(instanceId)

    const distanceInput = screen.getByLabelText(/distance/i)
    const durationInput = screen.getByLabelText(/duration/i)
    fireEvent.change(distanceInput, { target: { value: '5' } })
    fireEvent.change(durationInput, { target: { value: '30:00' } })
    fireEvent.blur(durationInput)

    await waitFor(async () => {
      const logs = await db.runLogs.where('instanceId').equals(instanceId).toArray()
      expect(logs).toHaveLength(1)
      expect(logs[0]?.durationSec).toBe(1800)
    })

    // Clearing the field back out (not re-typing a new value) is the exact
    // failure scenario: the UI shows blank, and the stored row must match —
    // not silently keep serving the old duration and its derived pace.
    fireEvent.change(durationInput, { target: { value: '' } })
    fireEvent.blur(durationInput)

    await waitFor(async () => {
      const logs = await db.runLogs.where('instanceId').equals(instanceId).toArray()
      expect(logs).toHaveLength(0)
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
    fireEvent.change(screen.getByLabelText('Duration'), { target: { value: '10:00' } })
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
