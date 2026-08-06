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
  })

  /**
   * The athlete's instruction: "take the input as the first two digits are
   * minutes and second two are seconds". Digits fill from the seconds end and
   * the field shows the clock as it is built, so nothing has to be guessed —
   * which is what makes it safe that a bare '45' now means 45 SECONDS rather
   * than the 45 minutes it used to mean.
   */
  it('masks a duration as it is typed, digits filling from the seconds end', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_easy_run' }])
    await renderWorkout(instanceId)

    // Re-queried each step rather than captured once: this screen's live query
    // can resolve again between keystrokes, and a node held across that is a
    // detached element whose `.value` no longer reflects what is rendered.
    for (const [typed, shown] of [['4', '0:04'], ['45', '0:45'], ['453', '4:53'], ['4530', '45:30']] as const) {
      const field = screen.getByLabelText<HTMLInputElement>(/duration/i)
      fireEvent.change(field, { target: { value: typed } })
      expect(screen.getByLabelText<HTMLInputElement>(/duration/i).value, typed).toBe(shown)
    }

    fireEvent.change(screen.getByLabelText(/distance/i), { target: { value: '5' } })
    fireEvent.blur(screen.getByLabelText(/duration/i))
    await waitFor(async () => {
      const logs = await db.runLogs.where('instanceId').equals(instanceId).toArray()
      expect(logs[0]?.durationSec).toBe(45 * 60 + 30)
    })
  })

  it('never lets junk into a duration at all, so there is nothing to reject', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_easy_run' }])
    await renderWorkout(instanceId)

    const durationInput = screen.getByLabelText<HTMLInputElement>(/duration/i)
    fireEvent.change(screen.getByLabelText(/distance/i), { target: { value: '5' } })
    fireEvent.change(durationInput, { target: { value: '30:00' } })
    fireEvent.blur(durationInput)
    await waitFor(async () => {
      expect(await db.runLogs.where('instanceId').equals(instanceId).count()).toBe(1)
    })

    // Letters are dropped on the way in — the field keeps the digits it had, so
    // unlike the old free-text field there is no invalid state to warn about and
    // no way for junk to blank a real run.
    fireEvent.change(durationInput, { target: { value: '30:00abc' } })
    expect(durationInput.value).toBe('30:00')
    fireEvent.blur(durationInput)

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

  /**
   * The layout the athlete asked for: "Quality Run needs to be laid out better.
   * Explain the difference between warm up and work." The three phases are named
   * sections, and each says in words whether it counts toward the work pace —
   * which is the actual distinction, since `summarizeSplits` paces work reps
   * only.
   */
  it('lays the session out as warm-up, work and cool-down, and says which counts', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_quality_run' }])
    await renderWorkout(instanceId)

    fireEvent.click(screen.getByRole('button', { name: /add splits/i }))

    for (const heading of ['Warm-up', 'Work', 'Cool-down']) {
      expect(screen.getByRole('heading', { name: heading, level: 4 }), heading).toBeInTheDocument()
    }
    expect(screen.getByLabelText(/warm-up time/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/cool-down time/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^reps$/i)).toBeInTheDocument()

    // Warm-up and cool-down say they are excluded; work says it is what counts.
    expect(screen.getByText(/left out of your work pace/i)).toBeInTheDocument()
    expect(screen.getByText(/kept out\s+of the work pace/i)).toBeInTheDocument()
    expect(screen.getByText(/only splits your pace/i)).toBeInTheDocument()

    // The uniform TARGET fields are gone — they duplicated the per-rep rows and
    // left two places to type the same fact.
    expect(screen.queryByLabelText(/^work distance$/i)).toBeNull()
    expect(screen.queryByLabelText(/^work duration$/i)).toBeNull()
    expect(screen.queryByLabelText(/^recovery$/i)).toBeNull()
  })

  it('states the prescribed target rather than making it re-editable', async () => {
    const instanceId = await createRunWorkout([{
      exerciseId: 'ex_quality_run',
      intervalSpec: { reps: 4, workDistanceM: 1000, recoverySec: 90 },
    }])
    await renderWorkout(instanceId)

    expect(await screen.findByText('4 × 1000 m with 1:30 recovery')).toBeInTheDocument()
  })

  it('puts a recovery timer BETWEEN the reps, and never after the last one', async () => {
    const instanceId = await createRunWorkout([{
      exerciseId: 'ex_quality_run',
      intervalSpec: { reps: 4, workDistanceM: 1000, recoverySec: 90 },
    }])
    await renderWorkout(instanceId)

    // Four reps, three gaps. The athlete asked for "a timer between the four
    // works" — after the last rep comes the cool-down, not another recovery.
    expect(await screen.findAllByRole('button', { name: /start recovery/i })).toHaveLength(3)
    expect(screen.getAllByLabelText(/^recovery \d+/i)).toHaveLength(3)
  })

  it('starts the shared rest timer from the recovery button, at the prescribed recovery', async () => {
    const instanceId = await createRunWorkout([{
      exerciseId: 'ex_quality_run',
      intervalSpec: { reps: 2, workDistanceM: 1000, recoverySec: 90 },
    }])
    await renderWorkout(instanceId)

    fireEvent.click((await screen.findAllByRole('button', { name: /start recovery/i }))[0]!)

    const bar = await screen.findByRole('group', { name: 'Rest timer' })
    expect(bar).toHaveTextContent('Recovery after rep 1')
    expect(bar).toHaveTextContent('1:30')
  })

  it('entering 5 reps generates 5 work rows and the 4 recoveries between them', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_quality_run' }])
    await renderWorkout(instanceId)
    fireEvent.click(screen.getByRole('button', { name: /add splits/i }))

    fireEvent.change(screen.getByLabelText(/^reps$/i), { target: { value: '5' } })

    expect(screen.getAllByLabelText(/^work \d+ time/i)).toHaveLength(5)
    expect(screen.getAllByLabelText(/^recovery \d+/i)).toHaveLength(4)
  })

  it('shows a per-rep pace and the work-only mean, both from the splits', async () => {
    const instanceId = await createRunWorkout([{ exerciseId: 'ex_quality_run' }])
    await renderWorkout(instanceId)
    fireEvent.click(screen.getByRole('button', { name: /add splits/i }))

    fireEvent.change(screen.getByLabelText(/^reps$/i), { target: { value: '2' } })
    for (const rep of [1, 2]) {
      fireEvent.change(screen.getByLabelText(new RegExp(`^work ${String(rep)} distance`, 'i')), { target: { value: '1000' } })
      const time = screen.getByLabelText(new RegExp(`^work ${String(rep)} time`, 'i'))
      // '400' is 4:00 under the clock mask, not 400 seconds.
      fireEvent.change(time, { target: { value: '400' } })
      fireEvent.blur(time)
    }

    expect(await screen.findByText(/Work-only mean pace: 4:00\/km/)).toBeInTheDocument()
    // Each rep carries its own pace, so a fade across the set is visible.
    expect(screen.getAllByText('4:00/km').length).toBeGreaterThanOrEqual(2)
  })

  /**
   * The athlete's "quality run isn't actually logging data". An interval
   * session's distance and duration ARE the sums of its splits, but the save
   * gate checked two separate top-level boxes — and with the duration box blank
   * (the interval prescription sets no overall duration) a fully-filled session
   * saved nothing at all. The boxes are gone and the totals are derived.
   */
  it('saves an interval session from its reps alone, with no overall duration box to fill', async () => {
    const instanceId = await createRunWorkout([{
      exerciseId: 'ex_quality_run', distanceM: 1000,
      intervalSpec: { warmupSec: 300, reps: 2, workDistanceM: 1000, recoverySec: 90, cooldownSec: 300 },
    }])
    await renderWorkout(instanceId)

    // There is no overall Distance/Duration pair for an interval session.
    expect(screen.queryByLabelText('Duration')).toBeNull()
    expect(screen.queryByLabelText('Distance')).toBeNull()

    for (const rep of [1, 2]) {
      const time = await screen.findByLabelText(new RegExp(`^work ${String(rep)} time`, 'i'))
      fireEvent.change(time, { target: { value: '400' } })
      fireEvent.blur(time)
    }

    await waitFor(async () => {
      const logs = await db.runLogs.where('instanceId').equals(instanceId).toArray()
      expect(logs).toHaveLength(1)
      // 2 x 1000 m of work; warm-up and cool-down carry time but no distance.
      expect(logs[0]?.distanceKm).toBe(2)
      // 5:00 warm-up + 4:00 + 1:30 recovery + 4:00 + 5:00 cool-down.
      expect(logs[0]?.durationSec).toBe(300 + 240 + 90 + 240 + 300)
    })
  })

  /**
   * The athlete's own session: "i did the workout this morning and logged two
   * sets of 1km and the other two blank."
   *
   * A blank rep is not blank — a 4 × 1000 m prescription prefills 1000 m into all
   * four rows and leaves the times empty, so counting every row would have stored
   * 4 km for two reps, and a pace derived from twice the distance actually run.
   */
  it('records only the reps that were actually run, not the prefilled rows beside them', async () => {
    const instanceId = await createRunWorkout([{
      exerciseId: 'ex_quality_run', distanceM: 1000,
      intervalSpec: { reps: 4, workDistanceM: 1000, recoverySec: 90 },
    }])
    await renderWorkout(instanceId)

    // Every row starts with the prescribed distance already in it...
    for (const rep of [1, 2, 3, 4]) {
      expect(
        (await screen.findByLabelText<HTMLInputElement>(new RegExp(`^work ${String(rep)} distance`, 'i'))).value,
        `rep ${String(rep)} distance`,
      ).toBe('1000')
    }
    // ...and nothing is logged until a TIME turns one into a rep that happened.
    expect(await db.runLogs.where('instanceId').equals(instanceId).count()).toBe(0)

    for (const [rep, digits] of [[1, '410'], [2, '415']] as const) {
      const time = screen.getByLabelText(new RegExp(`^work ${String(rep)} time`, 'i'))
      fireEvent.change(time, { target: { value: digits } })
      fireEvent.blur(time)
    }

    await waitFor(async () => {
      const logs = await db.runLogs.where('instanceId').equals(instanceId).toArray()
      expect(logs).toHaveLength(1)
      // Two reps, so 2 km — never the 4 km sitting prefilled on screen.
      expect(logs[0]?.distanceKm).toBe(2)
      // 4:10 + one recovery between the two + 4:15.
      expect(logs[0]?.durationSec).toBe(250 + 90 + 255)

      const splits = await db.intervalSplits.where('runLogId').equals(logs[0]!.id).sortBy('index')
      // The two reps that happened, and the single gap between them. The blank
      // reps are absent entirely rather than stored as a 1000 m claim.
      expect(splits.map((s) => s.kind)).toEqual(['work', 'recovery', 'work'])
      expect(splits.filter((s) => s.kind === 'work').map((s) => s.durationSec)).toEqual([250, 255])
    })
  })

  it('saving persists IntervalSplit rows with correct index and kind', async () => {
    const instanceId = await createRunWorkout([{
      exerciseId: 'ex_quality_run', distanceM: 1000,
      intervalSpec: { reps: 2, workDistanceM: 1000, workSec: 240, recoverySec: 90 },
    }])
    await renderWorkout(instanceId)

    await waitFor(async () => {
      const logs = await db.runLogs.where('instanceId').equals(instanceId).toArray()
      expect(logs).toHaveLength(1)
      const splits = await db.intervalSplits.where('runLogId').equals(logs[0]!.id).sortBy('index')
      // Recovery sits BETWEEN the reps: two reps, one recovery.
      expect(splits.map((s) => s.kind)).toEqual(['work', 'recovery', 'work'])
      expect(splits.map((s) => s.index)).toEqual([0, 1, 2])
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
    // Durations are prefilled as clocks, not raw seconds.
    expect(screen.getByLabelText<HTMLInputElement>(/warm-up time/i).value).toBe('5:00')
    expect(screen.getByLabelText<HTMLInputElement>(/^recovery 1/i).value).toBe('1:30')
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
