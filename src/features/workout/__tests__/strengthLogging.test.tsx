import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, openDb, resetDatabase } from '@/data/db'
import { getTimerState, updateSettings } from '@/data/repositories'
import { seedIfEmpty } from '@/data/seed/seedRunner'
import type { Unit, WorkoutStatus } from '@/data/types'
import { renderApp } from '@/test/renderApp'

const TODAY = '2026-08-24' // Monday
const NOW = '2026-08-24T09:00:00.000Z'
/** Local calendar date/time (not a UTC instant) so the faked clock lands on
 * the same LOCAL day `useToday` reports regardless of this machine's UTC
 * offset — same technique onboarding.test.tsx uses. `WorkoutScreen` derives
 * `today` from `useToday()`, which reads the real ambient clock; without
 * faking it, `recommendStrengthTarget`'s "last week" window would be
 * computed against whatever day the test actually runs on, not TODAY. */
const FAKE_NOW = new Date(2026, 7, 24, 9, 0, 0)

interface PrescriptionSpec {
  exerciseId: string
  sets?: number
  repMin?: number
  repMax?: number
  targetLoad?: number
  loadUnit?: Unit
  notes?: string
  targetRir?: number
}

let instanceCounter = 0

async function createWorkout(specs: PrescriptionSpec[], opts?: { status?: WorkoutStatus; templateName?: string }): Promise<string> {
  instanceCounter += 1
  const instanceId = `wi_test_${String(instanceCounter)}`
  const templateId = `tmpl_test_${String(instanceCounter)}`
  await db.workoutTemplates.add({
    id: templateId, planId: 'plan_test', planWeekId: 'week_test', sessionSlot: 1, sequenceInWeek: 1,
    name: opts?.templateName ?? '', kind: 'strength', priority: 'essential', recoveryTags: [], estMinutes: 45, notes: '',
  })
  await db.workoutInstances.add({
    id: instanceId, planId: 'plan_test', templateId, weekNumber: 1, sessionSlot: 1,
    plannedDate: TODAY, scheduledDate: TODAY, sequence: 1, priority: 'essential',
    recoveryTags: [], status: opts?.status ?? 'available', isManualOverride: false, frozen: false,
  })
  let order = 0
  for (const spec of specs) {
    order += 1
    await db.instancePrescriptions.add({
      id: `ip_test_${String(instanceCounter)}_${String(order)}`, instanceId, templateId,
      exerciseId: spec.exerciseId, order, restSec: 90,
      ...(spec.sets !== undefined ? { sets: spec.sets } : {}),
      ...(spec.repMin !== undefined ? { repMin: spec.repMin } : {}),
      ...(spec.repMax !== undefined ? { repMax: spec.repMax } : {}),
      ...(spec.targetLoad !== undefined ? { targetLoad: spec.targetLoad } : {}),
      ...(spec.loadUnit !== undefined ? { loadUnit: spec.loadUnit } : {}),
      ...(spec.notes !== undefined ? { notes: spec.notes } : {}),
      ...(spec.targetRir !== undefined ? { targetRir: spec.targetRir } : {}),
    })
  }
  return instanceId
}

let historyCounter = 0

/** Writes a frozen, completed past session directly (bypassing repositories
 * entirely, same fixture-building style as the domain layer's own tests) so
 * `exerciseHistory` has something real to summarize. `setsCount` matters: the
 * recommendation engine compares `completedSets.length` against the CURRENT
 * prescription's `sets` count to decide whether the session even qualifies
 * for `increase`/`optionalIncrease`. */
async function seedPastSession(
  exerciseId: string,
  date: string,
  perf: { weight: number; reps: number; unit: Unit; rir?: number },
  setsCount = 1,
): Promise<void> {
  historyCounter += 1
  const instanceId = `wi_hist_${String(historyCounter)}`
  const templateId = `tmpl_hist_${String(historyCounter)}`
  const prescriptionId = `ip_hist_${String(historyCounter)}`
  await db.workoutInstances.add({
    id: instanceId, planId: 'plan_test', templateId, weekNumber: 1, sessionSlot: 1,
    plannedDate: date, scheduledDate: date, sequence: 1, priority: 'essential', recoveryTags: [],
    status: 'completed', isManualOverride: false, frozen: true,
    completedAt: `${date}T12:00:00.000Z`, completedForDate: date,
  })
  await db.instancePrescriptions.add({ id: prescriptionId, instanceId, templateId, exerciseId, order: 1, restSec: 90 })
  for (let setIndex = 0; setIndex < setsCount; setIndex += 1) {
    await db.strengthSets.add({
      id: `set_hist_${String(historyCounter)}_${String(setIndex)}`, instanceId, instancePrescriptionId: prescriptionId, exerciseId,
      setIndex, weight: perf.weight, unit: perf.unit, reps: perf.reps,
      ...(perf.rir !== undefined ? { rir: perf.rir } : {}),
      isCompleted: true, completedAt: `${date}T12:00:00.000Z`, isWarmup: false,
    })
  }
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

beforeEach(async () => {
  await setup()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FAKE_NOW)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('strength logging screen', () => {
  it('renders every exercise expanded on one screen, with no expander control anywhere', async () => {
    const ids = [
      'ex_back_squat', 'ex_romanian_deadlift', 'ex_split_squat',
      'ex_bench_press', 'ex_lat_pulldown', 'ex_pallof_press',
    ]
    const instanceId = await createWorkout(ids.map((exerciseId) => ({ exerciseId })))
    await renderWorkout(instanceId)

    for (const name of ['Back squat', 'Romanian deadlift', 'Bulgarian split squat', 'Bench press', 'Lat pulldown', 'Pallof press']) {
      expect(await screen.findByText(name)).toBeInTheDocument()
    }
    // 4 + 3 + 3 + 4 + 3 + 3 prescribed sets across the six exercises. Set
    // rows materialize asynchronously (writing a StrengthSet row per
    // prescribed set the first time the screen opens), so this polls rather
    // than asserting on the very first paint.
    await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i)).toHaveLength(20) })

    const expanders = screen.queryAllByRole('button', { name: /expand|show more|details/i })
    expect(expanders).toHaveLength(0)
  })

  it('shows the full target block for a strength exercise without any interaction, matching the previous performance and date', async () => {
    await seedPastSession('ex_back_squat', '2026-07-20', { weight: 175, reps: 5, unit: 'lb', rir: 2 }, 4)
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
    await renderWorkout(instanceId)

    expect(await screen.findByText('Back squat')).toBeInTheDocument()
    expect(screen.getByText('4 × 4–6')).toBeInTheDocument()
    expect(screen.getByText(/Last: 175 lb × 5.*Jul 20/)).toBeInTheDocument()
    expect(screen.queryByText(/Last week/)).toBeNull()
    expect(screen.getByText(/Today's target: 180 lb × 5/)).toBeInTheDocument()
    expect(screen.getByText('You completed all prescribed reps last time.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /use target/i })).toBeInTheDocument()
  })

  it('shows the plan\'s target RIR compactly alongside the prescribed sets/reps, not as its own line', async () => {
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat', targetRir: 2 }])
    await renderWorkout(instanceId)

    expect(await screen.findByText('Back squat')).toBeInTheDocument()
    expect(screen.getByText('4 × 4–6 · target RIR 2')).toBeInTheDocument()
  })

  it('omits any target RIR text when the prescription has none', async () => {
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
    await renderWorkout(instanceId)

    expect(await screen.findByText('Back squat')).toBeInTheDocument()
    expect(screen.getByText('4 × 4–6')).toBeInTheDocument()
    expect(screen.queryByText(/target RIR/)).toBeNull()
  })

  it('never prefills the RIR input from the plan\'s target RIR — the athlete reports it, or leaves it blank', async () => {
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat', targetRir: 2 }])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')
    await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/^rir/i)).toHaveLength(4) })

    for (const input of screen.getAllByLabelText<HTMLInputElement>(/^rir/i)) expect(input.value).toBe('')
  })

  it('shows last week\'s weight when a session exists in the previous calendar week', async () => {
    await seedPastSession('ex_back_squat', '2026-08-19', { weight: 175, reps: 5, unit: 'lb', rir: 2 }, 4)
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
    await renderWorkout(instanceId)

    expect(await screen.findByText(/Last week: 175 lb/)).toBeInTheDocument()
  })

  it('prefills every planned set row with the recommended target values', async () => {
    await seedPastSession('ex_back_squat', '2026-07-20', { weight: 175, reps: 5, unit: 'lb', rir: 2 }, 4)
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')
    await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i)).toHaveLength(4) })

    const weightInputs = screen.getAllByLabelText<HTMLInputElement>(/weight/i)
    for (const input of weightInputs) expect(input.value).toBe('180')
    const repInputs = screen.getAllByLabelText<HTMLInputElement>(/^reps/i)
    for (const input of repInputs) expect(input.value).toBe('5')
  })

  it('one tap on a set\'s complete control marks it complete in the database', async () => {
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')

    const completeButton = await screen.findByRole('button', { name: /complete set 1/i })
    await userEvent.click(completeButton)

    await waitFor(async () => {
      const sets = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
      const completed = sets.filter((s) => s.isCompleted)
      expect(completed).toHaveLength(1)
      expect(completed[0]?.setIndex).toBe(0)
    })
  })

  it('completing a set with no edits at all (the intended one-tap flow) persists the prefilled weight and reps, not undefined', async () => {
    await seedPastSession('ex_back_squat', '2026-07-20', { weight: 175, reps: 5, unit: 'lb', rir: 2 }, 4)
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')
    await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i)).toHaveLength(4) })

    // Every row prefills at the recommended target (180 lb x 5 - see the
    // "prefills every planned set row" test above) -- tap Complete on all
    // four WITHOUT touching a single field, exactly the one-tap flow the
    // requirements call for.
    for (let i = 0; i < 4; i += 1) {
      const completeButton = await screen.findByRole('button', { name: new RegExp(`complete set ${String(i + 1)}`, 'i') })
      await userEvent.click(completeButton)
    }

    await waitFor(async () => {
      const sets = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
      const completed = sets.filter((s) => s.isCompleted)
      expect(completed).toHaveLength(4)
      for (const set of completed) {
        expect(set.weight).toBe(180)
        expect(set.reps).toBe(5)
        // The unit must also survive the one-tap complete: exerciseHistory
        // requires weight, reps, AND unit before a session counts as usable
        // history for a future recommendation — see the analogous defect
        // this project already shipped for weight/reps.
        expect(set.unit).toBe('lb')
        expect(set.completedAt).toBeDefined()
      }
    })
  })

  it('completing a set with no edits on an exercise carrying a target RIR persists weight and reps but never a fabricated RIR', async () => {
    // Matches the exact scenario a real athlete hit: week-1 back squat seeds
    // targetLoad 175 lb, repMin 4, and a Base-phase target RIR of 3. Tapping
    // Complete on all four sets without touching any field must log what was
    // displayed for weight/reps (an assertion the athlete DID do the work)
    // but must never invent an RIR — that's a judgement only the athlete can
    // make, and the target is guidance to display, not a value to record.
    const instanceId = await createWorkout([
      { exerciseId: 'ex_back_squat', sets: 4, repMin: 4, repMax: 6, targetLoad: 175, loadUnit: 'lb', targetRir: 3 },
    ])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')
    await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i)).toHaveLength(4) })

    for (let i = 0; i < 4; i += 1) {
      const completeButton = await screen.findByRole('button', { name: new RegExp(`complete set ${String(i + 1)}`, 'i') })
      await userEvent.click(completeButton)
    }

    await waitFor(async () => {
      const sets = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
      expect(sets.filter((s) => s.isCompleted)).toHaveLength(4)
    })

    const sets = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
    for (const set of sets) {
      // Weight and reps ARE present -- a fix that threw away all three fields
      // (rather than only omitting the fabricated RIR) must fail this test too.
      expect(set.weight).toBe(175)
      expect(set.reps).toBe(4)
      // Absence, not a loose falsy check: `0` or `undefined`-via-truthy-check
      // would both wrongly pass a truthiness assertion here.
      expect('rir' in set).toBe(false)
    }
  })

  it('an untouched one-tap complete on a target-RIR exercise yields an optional-aim recommendation next session, not a confident increase', async () => {
    const instanceId = await createWorkout([
      { exerciseId: 'ex_back_squat', sets: 4, repMin: 4, repMax: 6, targetLoad: 175, loadUnit: 'lb', targetRir: 3 },
    ])
    const first = await renderWorkout(instanceId)
    await screen.findByText('Back squat')
    await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i)).toHaveLength(4) })

    for (let i = 0; i < 4; i += 1) {
      const completeButton = await screen.findByRole('button', { name: new RegExp(`complete set ${String(i + 1)}`, 'i') })
      await userEvent.click(completeButton)
    }
    await waitFor(async () => {
      const sets = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
      expect(sets.filter((s) => s.isCompleted)).toHaveLength(4)
    })
    first.unmount()

    // Move to a later session and load a fresh instance for the same
    // exercise -- this is the user-visible consequence: with no recorded
    // RIR, `recommendStrengthTarget` must offer the honest optional-aim
    // wording, never the confident "you completed all prescribed reps"
    // increase that a fabricated RIR 3 would have driven.
    vi.setSystemTime(new Date(2026, 7, 25, 9, 0, 0))
    const nextInstanceId = await createWorkout([{ exerciseId: 'ex_back_squat', sets: 4, repMin: 4, repMax: 6, targetRir: 3 }])
    await renderWorkout(nextInstanceId)
    await screen.findByText(/All reps completed, but no RIR recorded/)

    expect(screen.getByText(/All reps completed, but no RIR recorded — treat 180 lb as an optional aim\./)).toBeInTheDocument()
    expect(screen.queryByText('You completed all prescribed reps last time.')).toBeNull()
  })

  it('completing a set starts the rest timer using that exercise\'s defaultRestSec', async () => {
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')

    await userEvent.click(await screen.findByRole('button', { name: /complete set 1/i }))

    await waitFor(async () => {
      const state = await getTimerState()
      expect(state?.totalSec).toBe(150) // ex_back_squat.defaultRestSec
      expect(state?.label).toBe('Back squat')
    })
  })

  describe('undoing a completed set', () => {
    it('turns the control into an enabled Undo affordance once a set is completed', async () => {
      const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
      await renderWorkout(instanceId)
      await screen.findByText('Back squat')

      await userEvent.click(await screen.findByRole('button', { name: /complete set 1/i }))

      const undoButton = await screen.findByRole('button', { name: /undo set 1/i })
      expect(undoButton).not.toBeDisabled()
      expect(screen.queryByRole('button', { name: /complete set 1/i })).toBeNull()
    })

    it('tapping Undo clears isCompleted while preserving the logged weight and reps', async () => {
      await seedPastSession('ex_back_squat', '2026-07-20', { weight: 175, reps: 5, unit: 'lb', rir: 2 }, 4)
      const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
      await renderWorkout(instanceId)
      await screen.findByText('Back squat')
      await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i)).toHaveLength(4) })

      await userEvent.click(await screen.findByRole('button', { name: /complete set 1/i }))
      await waitFor(async () => {
        const sets = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
        expect(sets.find((s) => s.setIndex === 0)?.isCompleted).toBe(true)
      })

      await userEvent.click(await screen.findByRole('button', { name: /undo set 1/i }))

      await waitFor(async () => {
        const sets = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
        const undone = sets.find((s) => s.setIndex === 0)
        expect(undone?.isCompleted).toBe(false)
        expect(undone?.completedAt).toBeUndefined()
        expect(undone?.weight).toBe(180)
        expect(undone?.reps).toBe(5)
      })
      // The control flips back to "Complete" once undone, and the values
      // stay visible on screen -- nothing was cleared from the display.
      expect(await screen.findByRole('button', { name: /complete set 1/i })).toBeInTheDocument()
      expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i)[0]?.value).toBe('180')
    })

    it('undoing a set does not touch the rest timer that completing it started', async () => {
      const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
      await renderWorkout(instanceId)
      await screen.findByText('Back squat')

      await userEvent.click(await screen.findByRole('button', { name: /complete set 1/i }))
      await waitFor(async () => {
        const state = await getTimerState()
        expect(state?.totalSec).toBe(150)
      })

      await userEvent.click(await screen.findByRole('button', { name: /undo set 1/i }))

      // The rest timer the athlete may legitimately still be sitting through
      // must be untouched by undo -- same totalSec/label as right after
      // completing, not cleared and not restarted.
      await waitFor(async () => {
        const sets = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
        expect(sets.find((s) => s.setIndex === 0)?.isCompleted).toBe(false)
      })
      const state = await getTimerState()
      expect(state?.totalSec).toBe(150)
      expect(state?.label).toBe('Back squat')
    })
  })

  it('disables the complete control while its write is in flight and guards against a double-submit', async () => {
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')

    const completeButton = await screen.findByRole('button', { name: /complete set 1/i })
    fireEvent.click(completeButton)
    fireEvent.click(completeButton)

    await waitFor(() => { expect(completeButton).toBeDisabled() })
    await waitFor(async () => {
      const sets = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
      expect(sets).toHaveLength(4)
      expect(sets.filter((s) => s.isCompleted)).toHaveLength(1)
    })
  })

  it('edits weight and reps inline — typing never opens a dialog', async () => {
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')

    const weightInput = (await screen.findAllByLabelText<HTMLInputElement>(/weight/i))[0]
    if (!weightInput) throw new Error('expected a weight input')
    fireEvent.change(weightInput, { target: { value: '185' } })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Add set appends a row prefilled from the previous row\'s edited values', async () => {
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')
    await screen.findAllByLabelText<HTMLInputElement>(/weight/i)

    const weightInputs = () => screen.getAllByLabelText<HTMLInputElement>(/weight/i)
    await waitFor(() => { expect(weightInputs()).toHaveLength(4) })

    const lastWeightInput = weightInputs()[3]
    if (!lastWeightInput) throw new Error('expected a fourth row')
    fireEvent.change(lastWeightInput, { target: { value: '185' } })
    fireEvent.blur(lastWeightInput)

    await waitFor(async () => {
      const sets = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
      expect(sets.find((s) => s.setIndex === 3)?.weight).toBe(185)
    })

    await userEvent.click(screen.getByRole('button', { name: /add set/i }))

    await waitFor(() => { expect(weightInputs()).toHaveLength(5) })
    expect(weightInputs()[4]?.value).toBe('185')
  })

  it('Remove set removes the last row and its database row', async () => {
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')
    await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i)).toHaveLength(4) })

    const before = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
    expect(before).toHaveLength(4)
    const lastId = before.find((s) => s.setIndex === 3)?.id

    await userEvent.click(screen.getByRole('button', { name: /remove set/i }))

    await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i)).toHaveLength(3) })
    const after = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
    expect(after).toHaveLength(3)
    expect(after.some((s) => s.id === lastId)).toBe(false)
  })

  it('renders exercise notes when present and omits them when empty', async () => {
    const withNotes = await createWorkout([{ exerciseId: 'ex_back_squat', notes: 'keep knees tracking out' }])
    const first = await renderWorkout(withNotes)
    expect(await screen.findByText(/Notes: keep knees tracking out/)).toBeInTheDocument()
    first.unmount()

    const withoutNotes = await createWorkout([{ exerciseId: 'ex_romanian_deadlift' }])
    await renderWorkout(withoutNotes)
    await screen.findByText('Romanian deadlift')
    expect(screen.queryByText(/^Notes:/)).toBeNull()
  })

  it('Use target sets the row\'s weight to the recommendation in one tap', async () => {
    await seedPastSession('ex_back_squat', '2026-07-20', { weight: 175, reps: 5, unit: 'lb', rir: 2 }, 4)
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')

    const firstWeightInput = (await screen.findAllByLabelText<HTMLInputElement>(/weight/i))[0]
    if (!firstWeightInput) throw new Error('expected a weight input')
    fireEvent.change(firstWeightInput, { target: { value: '999' } })
    fireEvent.blur(firstWeightInput)
    await waitFor(async () => {
      const sets = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
      expect(sets.find((s) => s.setIndex === 0)?.weight).toBe(999)
    })

    await userEvent.click(screen.getByRole('button', { name: /use target/i }))

    await waitFor(async () => {
      const sets = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
      expect(sets.find((s) => s.setIndex === 0)?.weight).toBe(180)
    })
  })

  it('prefills an optionalIncrease row at the previous weight while showing the higher target only as an aim (D-rule)', async () => {
    await seedPastSession('ex_romanian_deadlift', '2026-07-20', { weight: 135, reps: 6, unit: 'lb' }, 3)
    const instanceId = await createWorkout([{ exerciseId: 'ex_romanian_deadlift' }])
    await renderWorkout(instanceId)
    await screen.findByText('Romanian deadlift')

    expect(screen.getByText(/Today's target: 140 lb × 6/)).toBeInTheDocument()
    // Both the target line's "(optional aim)" suffix and the reason
    // sentence say "optional aim" — assert at least one, not exactly one.
    expect(screen.getAllByText(/optional aim/i).length).toBeGreaterThan(0)
    await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i)).toHaveLength(3) })

    const weightInputs = screen.getAllByLabelText<HTMLInputElement>(/weight/i)
    for (const input of weightInputs) expect(input.value).toBe('135')
  })

  it('names the symptom in the reason sentence for a symptom hold', async () => {
    await seedPastSession('ex_back_squat', '2026-07-20', { weight: 175, reps: 5, unit: 'lb', rir: 3 }, 4)
    for (let i = 0; i < 3; i += 1) {
      await db.symptomLogs.add({
        id: `symptom_test_${String(i)}`, forDate: TODAY, sessionRpe: 6, shinPain: 0, sciaticPain: 8,
        notes: '', loggedAt: NOW,
      })
    }
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')

    // Scoped to the recommendation's own reason line — the workout footer's
    // "Sciatic/back" symptom-capture scale (Task 23) also legitimately
    // contains the word "sciatic" elsewhere on the same page.
    expect(document.querySelector('.target-header__reason')?.textContent).toMatch(/sciatic/i)
  })

  it('renders station fields (distance, time, RPE) instead of a strength set row for a station exercise', async () => {
    const instanceId = await createWorkout([{ exerciseId: 'ex_sled_push' }])
    await renderWorkout(instanceId)

    expect(await screen.findByText('Sled push')).toBeInTheDocument()
    expect(screen.getByLabelText('Distance')).toBeInTheDocument()
    expect(screen.getByLabelText(/^time/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/rpe/i)).toBeInTheDocument()
    // No generic "Load" for a sled: its weight is the sled plus plates, captured
    // by the dedicated sled fields below rather than one number.
    expect(screen.queryByLabelText(/^load/i)).toBeNull()
    // A strength SetRow's per-set fields ("Weight, set 1", "Reps, set 1")
    // never render for a station — this is what actually distinguishes a
    // station block from a strength card. A station's OWN generic "Reps"
    // field and (for sled stations) "Sled weight"/"Total loaded weight"
    // fields are expected here (Task 22) and are not the same thing.
    expect(screen.queryByLabelText(/weight, set/i)).toBeNull()
    expect(screen.queryByLabelText(/reps, set/i)).toBeNull()
  })

  it('has no horizontal scrollbar at a 375px viewport', async () => {
    const ids = ['ex_back_squat', 'ex_romanian_deadlift', 'ex_bench_press']
    const instanceId = await createWorkout(ids.map((exerciseId) => ({ exerciseId })))
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')

    expect(document.body.scrollWidth).toBeLessThanOrEqual(375)
  })

  describe('zero-load target presentation (fix pass)', () => {
    it('barbell exercise, real seeded target, no history: shows the seeded weight normally', async () => {
      const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat', targetLoad: 175, loadUnit: 'lb' }])
      await renderWorkout(instanceId)
      await screen.findByText('Back squat')

      expect(screen.getByText(/Today's target: 175 lb × 4/)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /use target/i })).toBeInTheDocument()
      await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i)).toHaveLength(4) })
      for (const input of screen.getAllByLabelText<HTMLInputElement>(/weight/i)) expect(input.value).toBe('175')
    })

    it('body-weight exercise, no seeded target, no history: reads "body weight", not "0 lb" or "unknown"', async () => {
      const instanceId = await createWorkout([{ exerciseId: 'ex_pull_up' }])
      await renderWorkout(instanceId)
      await screen.findByText('Pull-up')

      expect(screen.getByText(/Today's target: body weight × 5/)).toBeInTheDocument()
      expect(screen.queryByText(/0 lb/)).toBeNull()
      expect(screen.queryByText(/set your own load/i)).toBeNull()
      // Zero added load IS the real recommendation here, so Use target stays
      // available and every row still prefills at it (not left blank).
      expect(screen.getByRole('button', { name: /use target/i })).toBeInTheDocument()
      await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i)).toHaveLength(3) })
      for (const input of screen.getAllByLabelText<HTMLInputElement>(/weight/i)) expect(input.value).toBe('0')
    })

    it('machine exercise, no seeded target, no history: prompts to set a load instead of printing "0 lb"', async () => {
      const instanceId = await createWorkout([{ exerciseId: 'ex_pallof_press' }])
      await renderWorkout(instanceId)
      await screen.findByText('Pallof press')

      expect(screen.getByText(/Today's target: 10 reps · set your own load/)).toBeInTheDocument()
      expect(screen.queryByText(/0 lb/)).toBeNull()
      // Nothing to "use" — the control is absent rather than a no-op.
      expect(screen.queryByRole('button', { name: /use target/i })).toBeNull()
      await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight/i)).toHaveLength(3) })
      for (const input of screen.getAllByLabelText<HTMLInputElement>(/weight/i)) expect(input.value).toBe('')
    })
  })

  it('renders the session template name alongside the week/session line', async () => {
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat' }], { templateName: 'Strength A maintenance' })
    await renderWorkout(instanceId)

    expect(await screen.findByText('Strength A maintenance')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Week 1 · Session 1')
  })
})

/**
 * Regression cover for the athlete's report: "Complete button on bent knee calf
 * raise for second set didn't work. Then tibialis raise (the next exercise)
 * didn't work either."
 *
 * The write always succeeded — `strengthSets` reached `isCompleted: true` — but
 * the screen never re-rendered for the SECOND and later strength exercises, so
 * the row kept offering "Complete". Tapping again did nothing, because
 * `completeSet` reads the row fresh, sees it already completed and returns.
 *
 * Cause: `loadWorkout` ran one `where('instancePrescriptionId').equals(...)`
 * query PER prescription, registering N separate observed index ranges on one
 * table; writes stopped invalidating the later ones. It now reads the whole
 * instance in a single query and groups in JS.
 *
 * The critical part of this test is that it uses THREE exercises and asserts
 * the UI after each completion. Every pre-existing test used one exercise, which
 * is exactly why a green suite missed this.
 */
describe('completing sets across several exercises keeps the UI in step with the database', () => {
  it('reflects every completion on screen, not just the first exercise\'s', async () => {
    const instanceId = await createWorkout([
      { exerciseId: 'ex_calf_raise_straight_knee', sets: 2, repMin: 12 },
      { exerciseId: 'ex_calf_raise_bent_knee', sets: 2, repMin: 12 },
      { exerciseId: 'ex_tibialis_raise', sets: 2, repMin: 15 },
    ])
    await renderWorkout(instanceId)
    await screen.findByText('Straight-knee calf raise')
    await waitFor(() => { expect(screen.getAllByRole('button', { name: /^Complete set/ }).length).toBe(6) })

    const names = ['Straight-knee calf raise', 'Bent-knee calf raise', 'Tibialis raise']
    let expectedDone = 0

    // Located by the card's own heading TEXT rather than its accessible name:
    // the name is a button into the exercise's settings, so the heading's
    // accessible name also carries that control's label.
    const cardFor = (name: string): HTMLElement => {
      const card = [...document.querySelectorAll('article')]
        .find((a) => a.querySelector('.target-header__name')?.textContent?.startsWith(name))
      if (!card) throw new Error(`expected a card for ${name}`)
      return card
    }

    for (const name of names) {
      for (const setNumber of [1, 2]) {
        const cardEl = cardFor(name)
        const button = [...cardEl.querySelectorAll('button')]
          .find((b) => b.getAttribute('aria-label') === `Complete set ${String(setNumber)}`)
        expect(button, `${name} set ${String(setNumber)} should still offer Complete`).toBeDefined()

        fireEvent.click(button as HTMLButtonElement)
        expectedDone += 1

        // The database took the write...
        await waitFor(async () => {
          const done = (await db.strengthSets.where('instanceId').equals(instanceId).toArray())
            .filter((row) => row.isCompleted).length
          expect(done).toBe(expectedDone)
        })

        // ...AND the screen shows it. This is the half that used to fail: the
        // row must now offer Undo, which is only possible if the live query
        // re-ran and handed the card a fresh `isCompleted`.
        await waitFor(() => {
          const refreshed = cardFor(name)
          const undo = [...refreshed.querySelectorAll('button')]
            .some((b) => b.getAttribute('aria-label') === `Undo set ${String(setNumber)}`)
          expect(undo, `${name} set ${String(setNumber)} should show Undo after completing`).toBe(true)
        })
      }
    }

    // Every row across all three exercises ends up completed on screen, not
    // merely in the database.
    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Undo set/ })).toHaveLength(6)
      expect(screen.queryAllByRole('button', { name: /^Complete set/ })).toHaveLength(0)
    })
  })
})

/**
 * The athlete's report: "Complete button on bent knee calf raise for second set
 * didn't work. Then tibialis raise (the next exercise) didn't work either."
 *
 * Cause: typing into a set scheduled a debounced autosave whose closure carried
 * the whole row, `isCompleted: false` included. Tapping Complete blurs the input
 * first, so the blur's `flushKey` started that write WITHOUT being awaited;
 * `handleComplete`'s own `await flushKey` then found an empty pending map and
 * returned immediately, `completeSet` wrote `isCompleted: true`, and the earlier
 * write landed last and put `false` back. The row reverted to "Complete", and
 * tapping again did nothing because `completeSet` no-ops on a set the database
 * already reports as complete.
 *
 * Two fixes, both asserted here: `flushKey` now awaits an in-flight save, and the
 * autosave writes through `saveSetValues`, which re-reads the row and CANNOT
 * express "also mark this incomplete".
 */
describe('typing a value and then completing the set', () => {
  it('keeps the set completed, and keeps the typed value', async () => {
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat', sets: 2, repMin: 5 }])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')
    await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight, set/i)).toHaveLength(2) })

    // Type into set 2 specifically — set 1 is usually one-tapped straight from
    // the prefill, which is why it appeared to work while set 2 did not.
    const weight = screen.getByLabelText<HTMLInputElement>('Weight, set 2')
    fireEvent.change(weight, { target: { value: '205' } })
    // Blur (as tapping the button does) then immediately complete: this is the
    // exact interleaving that lost the completion.
    fireEvent.blur(weight)
    fireEvent.click(screen.getByRole('button', { name: 'Complete set 2' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Undo set 2' })).toBeInTheDocument()
    })

    // And it STAYS completed once every queued write has settled — the revert
    // used to arrive a beat later, so a same-tick assertion would have passed
    // even against the bug.
    await new Promise((resolve) => { setTimeout(resolve, 400) })

    const rows = await db.strengthSets.where('instanceId').equals(instanceId).toArray()
    const secondSet = rows.find((row) => row.setIndex === 1)
    expect(secondSet?.isCompleted, 'set 2 must still be completed').toBe(true)
    expect(secondSet?.weight, 'the typed weight must survive the completion').toBe(205)
    expect(screen.getByRole('button', { name: 'Undo set 2' })).toBeInTheDocument()
  })

  it('a debounced write that lands after a completion can no longer un-complete it', async () => {
    const instanceId = await createWorkout([{ exerciseId: 'ex_back_squat', sets: 1, repMin: 5 }])
    await renderWorkout(instanceId)
    await screen.findByText('Back squat')
    await waitFor(() => { expect(screen.getAllByLabelText<HTMLInputElement>(/weight, set/i)).toHaveLength(1) })

    // Type WITHOUT blurring, so the save stays on its debounce timer, then
    // complete. The timer fires afterwards, which is the ordering the old
    // whole-row spread turned into a silent revert.
    fireEvent.change(screen.getByLabelText('Weight, set 1'), { target: { value: '199' } })
    fireEvent.click(screen.getByRole('button', { name: 'Complete set 1' }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Undo set 1' })).toBeInTheDocument()
    })
    await new Promise((resolve) => { setTimeout(resolve, 600) })

    const row = (await db.strengthSets.where('instanceId').equals(instanceId).toArray())[0]
    expect(row?.isCompleted).toBe(true)
    expect(row?.weight).toBe(199)
  })
})
