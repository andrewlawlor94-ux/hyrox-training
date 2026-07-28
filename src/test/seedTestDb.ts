import { openDb } from '@/data/db'
import type { HyroxDb } from '@/data/db'
import { seedIfEmpty } from '@/data/seed/seedRunner'
import {
  addSet, completeWorkout, installSeedPlan, saveRunLog, saveStationLog, saveSymptomLog, upsertSet,
} from '@/data/repositories'
import type { ISODate, WorkoutInstance } from '@/data/types'

/**
 * Monday-aligned and exactly 24 weeks (168 days) before the race date, so
 * `anchorPlan` needs zero generated Base weeks and the seed's own week 1
 * lands as final week 1 — the simplest, most predictable fixture for tests
 * that don't care about Base-week/deferred-start anchoring themselves
 * (those cases get their own fixtures in the onboarding tests instead).
 */
const DEFAULT_TODAY: ISODate = '2026-01-05'
const DEFAULT_RACE_DATE: ISODate = '2026-06-15'
const FIXTURE_NOW = '2026-01-05T08:00:00.000Z'

const BACK_SQUAT_SLOT = 1
const BENCH_PRESS_SLOT = 5
const EASY_RUN_SLOT = 2

const BACK_SQUAT_TEST_WEIGHT_LB = 175
const BACK_SQUAT_TEST_REPS = 5
const BACK_SQUAT_TEST_RIR = 2
const BENCH_PRESS_TEST_WEIGHT_LB = 140
const BENCH_PRESS_TEST_REPS = 8
const BENCH_PRESS_TEST_RIR = 2
const EASY_RUN_TEST_DISTANCE_KM = 5
const EASY_RUN_TEST_DURATION_SEC = 1800
const EASY_RUN_SPLIT_DISTANCE_M = 2500
const EASY_RUN_SPLIT_DURATION_SEC = 900
const SLED_PUSH_TEST_DISTANCE_M = 12.5
const SYMPTOM_LOG_TEST_COUNT = 3
const SYMPTOM_LOG_TEST_RPE = 5
const SYMPTOM_LOG_TEST_SHIN_PAIN = 1

interface LiftFixture {
  instance: WorkoutInstance
  instancePrescriptionId: string
}

/** The seed's Base weeks (if any) prescribe nothing (`prescriptions: []`),
 * so scanning for the exercise id itself — not just the session slot —
 * naturally skips past them to the first *core* week that actually
 * prescribes it, however many Base weeks precede it for this fixture's
 * `today`/`raceDate`. */
async function findInstanceWithExercise(
  db: HyroxDb,
  sessionSlot: number,
  exerciseId: string,
): Promise<LiftFixture> {
  const candidates = (await db.workoutInstances.toArray())
    .filter((instance) => instance.sessionSlot === sessionSlot)
    .sort((a, b) => a.weekNumber - b.weekNumber)
  for (const instance of candidates) {
    const prescriptions = await db.instancePrescriptions.where('instanceId').equals(instance.id).toArray()
    const match = prescriptions.find((p) => p.exerciseId === exerciseId)
    if (match) return { instance, instancePrescriptionId: match.id }
  }
  throw new Error(`No WorkoutInstance for slot ${String(sessionSlot)} prescribing "${exerciseId}"`)
}

async function findEarliestInstance(db: HyroxDb, sessionSlot: number): Promise<WorkoutInstance> {
  const candidates = (await db.workoutInstances.toArray())
    .filter((instance) => instance.sessionSlot === sessionSlot)
    .sort((a, b) => a.weekNumber - b.weekNumber)
  const first = candidates[0]
  if (!first) throw new Error(`No WorkoutInstance for slot ${String(sessionSlot)}`)
  return first
}

async function logCompletedLift(
  fixture: LiftFixture,
  values: { weight: number; reps: number; rir: number },
  today: ISODate,
): Promise<void> {
  const set = await addSet({
    instanceId: fixture.instance.id,
    instancePrescriptionId: fixture.instancePrescriptionId,
    now: FIXTURE_NOW,
  })
  await upsertSet({
    ...set, weight: values.weight, unit: 'lb', reps: values.reps, rir: values.rir,
    isCompleted: true, completedAt: FIXTURE_NOW,
  })
  await completeWorkout({ id: fixture.instance.id, state: 'completed', forDate: today, now: FIXTURE_NOW })
}

/**
 * Two completed strength sessions (back squat 175 lb x 5 @ RIR 2, bench
 * press 140 lb x 8 @ RIR 2), one completed easy run with two splits, one
 * station log (sled push, logged against the same session as the back
 * squat before it freezes), and three symptom logs for `today`.
 */
async function writeHistoryFixture(db: HyroxDb, today: ISODate): Promise<void> {
  const squat = await findInstanceWithExercise(db, BACK_SQUAT_SLOT, 'ex_back_squat')
  await saveStationLog({
    id: crypto.randomUUID(), instanceId: squat.instance.id, station: 'sledPush',
    distanceM: SLED_PUSH_TEST_DISTANCE_M, notes: '',
  })
  await logCompletedLift(squat, {
    weight: BACK_SQUAT_TEST_WEIGHT_LB, reps: BACK_SQUAT_TEST_REPS, rir: BACK_SQUAT_TEST_RIR,
  }, today)

  const bench = await findInstanceWithExercise(db, BENCH_PRESS_SLOT, 'ex_bench_press')
  await logCompletedLift(bench, {
    weight: BENCH_PRESS_TEST_WEIGHT_LB, reps: BENCH_PRESS_TEST_REPS, rir: BENCH_PRESS_TEST_RIR,
  }, today)

  const run = await findEarliestInstance(db, EASY_RUN_SLOT)
  const runLogId = crypto.randomUUID()
  await saveRunLog(
    {
      id: runLogId, instanceId: run.id, distanceKm: EASY_RUN_TEST_DISTANCE_KM,
      durationSec: EASY_RUN_TEST_DURATION_SEC, surface: 'road', runType: 'easy', notes: '', loggedAt: FIXTURE_NOW,
    },
    [
      { id: crypto.randomUUID(), runLogId, index: 0, kind: 'work', distanceM: EASY_RUN_SPLIT_DISTANCE_M, durationSec: EASY_RUN_SPLIT_DURATION_SEC },
      { id: crypto.randomUUID(), runLogId, index: 1, kind: 'work', distanceM: EASY_RUN_SPLIT_DISTANCE_M, durationSec: EASY_RUN_SPLIT_DURATION_SEC },
    ],
  )
  await completeWorkout({ id: run.id, state: 'completed', forDate: today, now: FIXTURE_NOW })

  for (let i = 0; i < SYMPTOM_LOG_TEST_COUNT; i += 1) {
    await saveSymptomLog({
      id: crypto.randomUUID(), forDate: today, sessionRpe: SYMPTOM_LOG_TEST_RPE,
      shinPain: SYMPTOM_LOG_TEST_SHIN_PAIN, sciaticPain: 0, notes: '', loggedAt: FIXTURE_NOW,
    })
  }
}

/**
 * Standard database fixture for every test that needs real, non-empty data:
 * opens the db, seeds the exercise/standards library, installs a fresh
 * 24-week plan anchored to `today`/`raceDate`, and — when `withHistory` is
 * set — writes the history fixture described above. No test should ever
 * construct raw rows itself; this is the one place fixture data is built.
 */
export async function seedTestDb(opts?: { raceDate?: ISODate; today?: ISODate; withHistory?: boolean }): Promise<void> {
  const today = opts?.today ?? DEFAULT_TODAY
  const raceDate = opts?.raceDate ?? DEFAULT_RACE_DATE

  const db = await openDb()
  await seedIfEmpty(db, FIXTURE_NOW)
  await installSeedPlan({ today, raceDate, now: FIXTURE_NOW })

  if (opts?.withHistory) await writeHistoryFixture(db, today)
}
