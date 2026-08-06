import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { db, resetDatabase } from '@/data/db'
import { seedIfEmpty } from '@/data/seed/seedRunner'
import { PastRecordEditor } from '../PastRecordEditor'

const NOW = '2026-08-24T09:00:00.000Z'
const INSTANCE_ID = 'wi_quality'
const PRESCRIPTION_ID = 'ip_quality'
const RUN_LOG_ID = `rl_${PRESCRIPTION_ID}`

/** A completed, frozen session with no prescriptions yet — each test adds the
 * ones it needs. */
async function seedCompletedSession(): Promise<void> {
  await db.workoutTemplates.add({
    id: 'tmpl_quality', planId: 'plan_test', planWeekId: 'week_1', sessionSlot: 3, sequenceInWeek: 0,
    name: 'Quality run (intervals)', kind: 'run', priority: 'essential', recoveryTags: ['hardRun'],
    estMinutes: 50, notes: '',
  })
  await db.workoutInstances.add({
    id: INSTANCE_ID, planId: 'plan_test', templateId: 'tmpl_quality', weekNumber: 1, sessionSlot: 3,
    plannedDate: '2026-08-24', scheduledDate: '2026-08-24', sequence: 0, priority: 'essential',
    recoveryTags: ['hardRun'], status: 'completed', isManualOverride: false, frozen: true,
    completedAt: NOW, completedForDate: '2026-08-24',
  })
}

/** That session, prescribing a 4 × 1000 m quality run. Whether it has a stored
 * run is the variable — the athlete's own session had none. */
async function seedCompletedIntervalSession(opts: { withLog: boolean }): Promise<void> {
  await seedCompletedSession()
  await db.instancePrescriptions.add({
    id: PRESCRIPTION_ID, instanceId: INSTANCE_ID, templateId: 'tmpl_quality', exerciseId: 'ex_quality_run',
    order: 0, restSec: 0, distanceM: 1000,
    intervalSpec: { reps: 4, workDistanceM: 1000, recoverySec: 90 },
  })

  if (!opts.withLog) return
  await db.runLogs.add({
    id: RUN_LOG_ID, instanceId: INSTANCE_ID, instancePrescriptionId: PRESCRIPTION_ID,
    distanceKm: 2, durationSec: 250 + 90 + 255, surface: 'track', runType: 'intervals', notes: '', loggedAt: NOW,
  })
  await db.intervalSplits.bulkAdd([
    { id: `${RUN_LOG_ID}_sp0`, runLogId: RUN_LOG_ID, index: 0, kind: 'work', distanceM: 1000, durationSec: 250 },
    { id: `${RUN_LOG_ID}_sp1`, runLogId: RUN_LOG_ID, index: 1, kind: 'recovery', durationSec: 90 },
    { id: `${RUN_LOG_ID}_sp2`, runLogId: RUN_LOG_ID, index: 2, kind: 'work', distanceM: 1000, durationSec: 255 },
  ])
}

beforeEach(async () => {
  await resetDatabase()
  await seedIfEmpty(db, NOW)
})

describe('correcting a past interval run', () => {
  /**
   * The athlete's report: "when i go to edit quality run i did this morning it
   * just says no logged sets runs or stations to correct on this record."
   *
   * Their session recorded nothing, because the old save gate demanded an overall
   * duration that an interval prescription never sets. The editor listed stored
   * rows, so with no row it refused outright — the least useful moment to refuse,
   * since a session whose data went missing is exactly the one needing re-entry.
   */
  it('is not a dead end when the session recorded nothing', async () => {
    await seedCompletedIntervalSession({ withLog: false })
    render(<PastRecordEditor instanceId={INSTANCE_ID} />)

    expect(await screen.findByText(/Nothing was recorded for this run/)).toBeInTheDocument()
    expect(screen.queryByText(/No logged sets, runs, or stations/)).toBeNull()
    // The reps are there to fill in, from the prescription.
    expect(screen.getAllByLabelText(/^work \d+ time/i)).toHaveLength(4)
  })

  it('saves the reps entered afterwards, counting only the ones actually run', async () => {
    await seedCompletedIntervalSession({ withLog: false })
    render(<PastRecordEditor instanceId={INSTANCE_ID} />)
    await screen.findByText(/Nothing was recorded for this run/)

    // Two of the four, exactly as the athlete described.
    for (const [rep, digits] of [[1, '410'], [2, '415']] as const) {
      const time = screen.getByLabelText(new RegExp(`^work ${String(rep)} time`, 'i'))
      fireEvent.change(time, { target: { value: digits } })
      fireEvent.blur(time)
    }

    // Generous timeout on purpose. Each entry schedules its own debounced write,
    // and under a loaded jsdom the two commits can fall more than one 250ms
    // window apart — so the first write (one rep, 1 km) genuinely lands before
    // the second (both reps, 2 km). The default 1s window raced that and read the
    // intermediate row. The assertion below is unchanged and still strict.
    await waitFor(async () => {
      const logs = await db.runLogs.where('instanceId').equals(INSTANCE_ID).toArray()
      expect(logs).toHaveLength(1)
      // 2 km, never the 4 km of prefilled rows.
      expect(logs[0]?.distanceKm).toBe(2)
      expect(logs[0]?.durationSec).toBe(250 + 90 + 255)
      const splits = await db.intervalSplits.where('runLogId').equals(logs[0]!.id).sortBy('index')
      expect(splits.map((s) => s.kind)).toEqual(['work', 'recovery', 'work'])
    }, { timeout: 5000 })

    // The instance stays frozen: correcting a record never un-completes it.
    expect((await db.workoutInstances.get(INSTANCE_ID))?.frozen).toBe(true)
  })

  /** "I should be able to see what i logged and change it." */
  it('shows the times that were saved, not the prescription they were measured against', async () => {
    await seedCompletedIntervalSession({ withLog: true })
    render(<PastRecordEditor instanceId={INSTANCE_ID} />)

    expect(await screen.findByText(/Recorded: 2 km · 9:55/)).toBeInTheDocument()
    expect(screen.getByLabelText<HTMLInputElement>(/^work 1 time/i).value).toBe('4:10')
    expect(screen.getByLabelText<HTMLInputElement>(/^work 2 time/i).value).toBe('4:15')
    // Rep 3 was never run, so it shows the target, blank of a time.
    expect(screen.getByLabelText<HTMLInputElement>(/^work 3 time/i).value).toBe('')
    expect(screen.getByLabelText<HTMLInputElement>(/^recovery 1/i).value).toBe('1:30')
  })

  it('corrects a saved rep, and re-derives the totals from the reps', async () => {
    await seedCompletedIntervalSession({ withLog: true })
    render(<PastRecordEditor instanceId={INSTANCE_ID} />)
    await screen.findByLabelText(/^work 1 time/i)

    const time = screen.getByLabelText<HTMLInputElement>(/^work 1 time/i)
    fireEvent.change(time, { target: { value: '405' } }) // 4:05
    fireEvent.blur(time)

    // The write is debounced and goes through IndexedDB, which under full-suite
    // contention can take longer than `waitFor`'s 1s default. The assertions
    // themselves are unchanged and exact.
    await waitFor(async () => {
      const log = await db.runLogs.get(RUN_LOG_ID)
      expect(log?.durationSec).toBe(245 + 90 + 255)
      // The stored pace follows the corrected reps rather than disagreeing with them.
      expect(log?.paceSecPerKm).toBe((245 + 90 + 255) / 2)
    }, { timeout: 5000 })
    // The original logging time is kept — this is a correction, not a new run.
    expect((await db.runLogs.get(RUN_LOG_ID))?.loggedAt).toBe(NOW)
  })

  /**
   * The athlete generalised the requirement: "i should be able to edit that
   * record and input data even if it wasnt captured the first time." Not just
   * interval runs — anything the session prescribed.
   */
  it('lets a plain run with no stored row be entered afterwards', async () => {
    await seedCompletedSession()
    await db.instancePrescriptions.add({
      id: 'ip_easy', instanceId: INSTANCE_ID, templateId: 'tmpl_quality', exerciseId: 'ex_easy_run',
      order: 1, restSec: 0, durationSec: 2400,
    })
    render(<PastRecordEditor instanceId={INSTANCE_ID} />)

    expect(await screen.findByText(/Nothing was recorded for this run\. Enter the distance and the time/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText<HTMLInputElement>('Distance'), { target: { value: '8' } })
    const duration = screen.getByLabelText<HTMLInputElement>('Duration')
    fireEvent.change(duration, { target: { value: '4230' } }) // 42:30
    fireEvent.blur(duration)

    await waitFor(async () => {
      const logs = await db.runLogs.where('instanceId').equals(INSTANCE_ID).toArray()
      const easy = logs.find((l) => l.instancePrescriptionId === 'ip_easy')
      expect(easy?.distanceKm).toBe(8)
      expect(easy?.durationSec).toBe(42 * 60 + 30)
    }, { timeout: 5000 })
  })

  it('lets a station with no stored row be entered afterwards, with only the fields it has', async () => {
    await seedCompletedSession()
    await db.instancePrescriptions.add({
      id: 'ip_sled', instanceId: INSTANCE_ID, templateId: 'tmpl_quality', exerciseId: 'ex_sled_push',
      order: 1, restSec: 90, distanceM: 50,
    })
    render(<PastRecordEditor instanceId={INSTANCE_ID} />)

    expect(await screen.findByText(/Nothing was recorded for this station/)).toBeInTheDocument()
    // A 50 m sled push has no rep count, here as on the live screen.
    expect(screen.queryByLabelText('Reps')).toBeNull()

    const time = screen.getByLabelText<HTMLInputElement>('Time')
    fireEvent.change(time, { target: { value: '410' } }) // 4:10
    fireEvent.blur(time)

    await waitFor(async () => {
      const logs = await db.stationLogs.where('instanceId').equals(INSTANCE_ID).toArray()
      expect(logs).toHaveLength(1)
      expect(logs[0]?.timeSec).toBe(250)
      expect(logs[0]?.station).toBe('sledPush')
    }, { timeout: 5000 })
  })

  it('still shows a log that belongs to no prescription, rather than dropping it', async () => {
    // Older rows, or a backup predating the prescription link. Grouping by
    // exercise must not make them vanish from the one screen that can fix them.
    await seedCompletedSession()
    await db.runLogs.add({
      id: 'run_orphan', instanceId: INSTANCE_ID, distanceKm: 5, durationSec: 1800,
      surface: 'road', runType: 'easy', notes: '', loggedAt: NOW,
    })
    render(<PastRecordEditor instanceId={INSTANCE_ID} />)

    const distance = await screen.findByLabelText<HTMLInputElement>('Distance', { selector: '#past-run-distance-run_orphan' })
    expect(distance.value).toBe('5')
  })

  it('does not rewrite a record just because the editor was opened', async () => {
    await seedCompletedIntervalSession({ withLog: true })
    const before = await db.runLogs.get(RUN_LOG_ID)
    render(<PastRecordEditor instanceId={INSTANCE_ID} />)
    await screen.findByLabelText(/^work 1 time/i)

    // The splits editor reports its rows on mount; that echo must not count as
    // an edit to frozen history. Real delay, since this asserts an absence.
    await new Promise((resolve) => { setTimeout(resolve, 500) })
    expect(await db.runLogs.get(RUN_LOG_ID)).toEqual(before)
  })

  it('writes nothing at all just for opening the editor', async () => {
    await seedCompletedIntervalSession({ withLog: false })
    render(<PastRecordEditor instanceId={INSTANCE_ID} />)
    await screen.findByText(/Nothing was recorded for this run/)

    // A negative assertion, so it needs a real delay past the autosave window
    // rather than a `waitFor` that could pass on its first poll.
    await new Promise((resolve) => { setTimeout(resolve, 400) })
    expect(await db.runLogs.where('instanceId').equals(INSTANCE_ID).count()).toBe(0)
  })
})
