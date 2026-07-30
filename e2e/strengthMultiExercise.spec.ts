import { expect, test, type Page } from '@playwright/test'
import { BASE_URL } from './constants'
import { completeOnboarding, readStore } from './helpers'

interface InstancePrescriptionRow { id: string; instanceId: string; exerciseId: string }
interface WorkoutInstanceRow { id: string; weekNumber: number }
interface StrengthSetRow { instanceId: string; isCompleted: boolean }

/** The three lower-leg durability exercises every easy run carries, in the order
 * the seed prescribes them. Three is the point: the defect this guards only ever
 * showed from the SECOND exercise onward. */
const DURABILITY_EXERCISES = ['Straight-knee calf raise', 'Bent-knee calf raise', 'Tibialis raise']
const SETS_PER_EXERCISE = 3

/** Finds the earliest easy-run instance, which is the one carrying all three
 * lower-leg exercises. */
async function earliestDurabilityInstanceId(page: Page): Promise<string> {
  const prescriptions = await readStore<InstancePrescriptionRow>(page, 'instancePrescriptions')
  const instances = await readStore<WorkoutInstanceRow>(page, 'workoutInstances')
  const withTibialis = new Set(
    prescriptions.filter((p) => p.exerciseId === 'ex_tibialis_raise').map((p) => p.instanceId),
  )
  const target = instances
    .filter((i) => withTibialis.has(i.id))
    .sort((a, b) => a.weekNumber - b.weekNumber)[0]
  if (!target) throw new Error('expected a seeded session prescribing the lower-leg durability work')
  return target.id
}

/**
 * The athlete's report: "Complete button on bent knee calf raise for second set
 * didn't work. Then tibialis raise (the next exercise) didn't work either."
 *
 * The write always landed — `strengthSets` reached `isCompleted: true` — but the
 * screen never re-rendered for the SECOND and later strength exercises, so the
 * row kept offering "Complete". Tapping again did nothing, because `completeSet`
 * re-reads the row, sees it is already complete, and returns.
 *
 * THIS TEST HAS TO BE END-TO-END. The equivalent unit test passes against the
 * unfixed code: the cause was Dexie `liveQuery` observability (one observed index
 * range per prescription, and writes stopped invalidating the later ones), and
 * fake-indexeddb under jsdom does not reproduce that behaviour. Only a real
 * browser with real IndexedDB does — the same reason the unit suite has missed
 * this project's worst defects before.
 */
test('completing sets across three exercises updates the screen, not only the database', async ({ page }) => {
  await completeOnboarding(page)

  const instanceId = await earliestDurabilityInstanceId(page)
  await page.goto(`${BASE_URL}workout/${instanceId}`)

  // Every exercise renders expanded, so all nine Complete controls exist up front.
  await expect(page.getByRole('button', { name: /^Complete set/ })).toHaveCount(
    DURABILITY_EXERCISES.length * SETS_PER_EXERCISE,
  )

  // Deliberately NO database read between clicks. `readStore` opens its own
  // IndexedDB connection, and doing that after every tap perturbed Dexie enough
  // to mask the very staleness this test exists to catch. The taps run straight
  // through, the way an athlete works through a session, and the database is
  // checked once at the end.
  for (const exerciseName of DURABILITY_EXERCISES) {
    // Scoped to this exercise's own card: "Complete set 1" repeats per exercise.
    const card = page.locator('article').filter({ hasText: exerciseName })
    for (let setNumber = 1; setNumber <= SETS_PER_EXERCISE; setNumber += 1) {
      await card.getByRole('button', { name: `Complete set ${String(setNumber)}` }).click()

      // The row must flip to Undo. This is the half that failed: it can only
      // happen if the live query re-ran and handed the card a fresh
      // `isCompleted`, rather than the stale snapshot it kept serving.
      await expect(
        card.getByRole('button', { name: `Undo set ${String(setNumber)}` }),
        `${exerciseName} set ${String(setNumber)} should show Undo once completed`,
      ).toBeVisible()
    }
  }

  // The database agrees, so this cannot pass on a UI-only illusion.
  const sets = await readStore<StrengthSetRow>(page, 'strengthSets')
  expect(sets.filter((s) => s.instanceId === instanceId && s.isCompleted)).toHaveLength(
    DURABILITY_EXERCISES.length * SETS_PER_EXERCISE,
  )

  // Nothing left offering Complete anywhere on the screen.
  await expect(page.getByRole('button', { name: /^Complete set/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /^Undo set/ })).toHaveCount(
    DURABILITY_EXERCISES.length * SETS_PER_EXERCISE,
  )
})

/** The athlete asked to reach an exercise's settings by tapping the exercise
 * itself, rather than hunting a separate Edit control. */
test('tapping an exercise name opens its own adjust sheet', async ({ page }) => {
  await completeOnboarding(page)
  const instanceId = await earliestDurabilityInstanceId(page)
  await page.goto(`${BASE_URL}workout/${instanceId}`)

  await page.getByRole('button', { name: 'Tibialis raise', exact: true }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  // The sheet is this exercise's own settings, not a generic one.
  await expect(dialog).toContainText(/Tibialis raise/)
  await expect(dialog.getByLabel(/rest/i)).toBeVisible()
})
