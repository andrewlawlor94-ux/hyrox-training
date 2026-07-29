import { expect, test, type Page } from '@playwright/test'
import { completeOnboarding, exerciseCard, horizontalOverflow, parseDurationText, readStore } from './helpers'

/** Just the fields this spec reads back out of IndexedDB directly — a
 * narrowed local view of `src/data/types/logs.ts`'s `StrengthSet`. */
interface StrengthSetRow {
  exerciseId: string
  setIndex: number
  weight?: number
  reps?: number
  isCompleted: boolean
}

interface WorkoutInstanceRow {
  id: string
  status: string
}

/** Seeded on `ex_back_squat` (`src/data/seed/exercises/lowerBody.ts`) — the
 * rest timer started by completing its first set must show this exact
 * duration, not a generic/default one. */
const BACK_SQUAT_REST_SEC = 150
/** Lower bound for "still basically the full rest duration" right after
 * starting the timer — a few seconds of real test execution may have already
 * ticked by before this reads the countdown. */
const REST_JUST_STARTED_MIN_SEC = 140
const TEST_SET_2_WEIGHT = 185
const MS_PER_SEC = 1000
/** How far real wall-clock drift (test execution time, browser reload) is
 * allowed to push the post-reload countdown from the "elapsed since start"
 * prediction, in either direction. */
const REST_TOLERANCE_BEHIND_SEC = 15
const REST_TOLERANCE_AHEAD_SEC = 5
/** A deliberate real wait before reloading, so the countdown has genuinely
 * ticked down by at least a couple of whole seconds by the time it's read
 * again -- see the call site for why this must be a real wait, not a mock. */
const REST_TOLERANCE_WAIT_MS = 3000

/** iPhone SE (3rd gen) / iPhone 13 mini — the smallest screen this app has to
 * work on, and narrower than the iPhone 13 profile the suite otherwise uses. */
const NARROWEST_IPHONE_WIDTH_PX = 375
const NARROWEST_IPHONE_HEIGHT_PX = 667

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  // Asserting on the offender list rather than a boolean so a failure says
  // WHICH element overflowed and by how much.
  expect(await horizontalOverflow(page)).toEqual([])
}

test('logs a set with one tap, survives reload, and finishes partially — never as completed', async ({ page }) => {
  await completeOnboarding(page)
  await expectNoHorizontalScroll(page)

  // Home shows all three sections and a real (not rest-day) session for today.
  await expect(page.getByRole('heading', { name: "Today's workout" })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Goal snapshot' })).toBeVisible()

  const workoutName = (await page.locator('.todays-workout-card__name').innerText()).trim()
  expect(workoutName.length).toBeGreaterThan(0)
  expect(workoutName).not.toBe('No session scheduled today')

  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page).toHaveURL(/\/workout\//)
  await expectNoHorizontalScroll(page)

  // Seed data always opens with back squat as the first strength exercise --
  // wait for the real content (not the screen's transient loading state)
  // before reading anything off it.
  await expect(page.getByRole('heading', { name: 'Back squat' })).toBeVisible()

  // Every exercise is expanded already — its target block is visible without
  // any tap, and there is no expander control anywhere on the screen.
  const exerciseNames = await page.locator('.workout-screen__exercises h3').allInnerTexts()
  expect(exerciseNames.length).toBeGreaterThan(0)
  for (const name of exerciseNames) expect(name.trim().length).toBeGreaterThan(0)
  await expect(page.getByText(/today's target:/i).first()).toBeVisible()
  await expect(page.locator('[aria-expanded]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /expand|collapse|show details/i })).toHaveCount(0)

  const backSquat = exerciseCard(page, 'Back squat')
  const weightBefore = await backSquat.getByLabel('Weight, set 1').inputValue()
  const repsBefore = await backSquat.getByLabel('Reps, set 1').inputValue()
  expect(weightBefore).not.toBe('')
  expect(repsBefore).not.toBe('')

  // One tap on Complete, no field edits.
  const timerStartedAt = Date.now()
  await backSquat.getByRole('button', { name: 'Complete set 1' }).click()
  await expect(backSquat.getByRole('button', { name: 'Undo set 1' })).toBeVisible()

  // Rest timer appears with the exercise's own seeded rest duration (150s).
  const timerBar = page.getByRole('group', { name: 'Rest timer' })
  await expect(timerBar).toBeVisible()
  await expect(timerBar).toContainText('Back squat')
  const initialCountdown = parseDurationText(await timerBar.locator('.rest-timer-bar__countdown').innerText())
  expect(initialCountdown).toBeGreaterThan(REST_JUST_STARTED_MIN_SEC)
  expect(initialCountdown).toBeLessThanOrEqual(BACK_SQUAT_REST_SEC)

  // The regression that matters most: the DATABASE row carries the
  // prefilled weight/reps that were on screen, not just `isCompleted`.
  const setsAfterFirstComplete = await readStore<StrengthSetRow>(page, 'strengthSets')
  const backSquatSets = setsAfterFirstComplete
    .filter((row) => row.exerciseId === 'ex_back_squat')
    .sort((a, b) => a.setIndex - b.setIndex)
  expect(backSquatSets.length).toBeGreaterThanOrEqual(2)
  const firstSet = backSquatSets[0]
  const secondSet = backSquatSets[1]
  expect(firstSet).toBeDefined()
  expect(secondSet).toBeDefined()
  expect(firstSet?.isCompleted).toBe(true)
  expect(firstSet?.weight).toBe(Number(weightBefore))
  expect(firstSet?.reps).toBe(Number(repsBefore))

  // Type a weight into set 2, wait for it to actually persist, then reload.
  await backSquat.getByLabel('Weight, set 2').fill(String(TEST_SET_2_WEIGHT))
  await backSquat.getByLabel('Weight, set 2').press('Tab')
  const secondSetIndex = secondSet?.setIndex
  await expect.poll(async () => {
    const rows = await readStore<StrengthSetRow>(page, 'strengthSets')
    return rows.find((row) => row.exerciseId === 'ex_back_squat' && row.setIndex === secondSetIndex)?.weight
  }).toBe(TEST_SET_2_WEIGHT)

  // A real wait, deliberately: the whole point of the next assertion is that
  // the countdown reflects genuine ELAPSED WALL-CLOCK TIME across a reload,
  // not a mocked clock -- so a few real seconds have to actually pass first,
  // or a same-second reload could show an unchanged value for a reason that
  // has nothing to do with whether the timer survives reload correctly.
  await page.waitForTimeout(REST_TOLERANCE_WAIT_MS)

  await page.reload()

  // Still in progress, on the same workout — a reload never lost the session.
  await expect(page.getByRole('heading', { name: /Week \d+ · Session \d+/ })).toBeVisible()
  await expectNoHorizontalScroll(page)
  await expect(backSquat.getByLabel('Weight, set 2')).toHaveValue(String(TEST_SET_2_WEIGHT))

  // The workout screen is the densest layout in the app (a set row is five
  // columns of controls), so check it at the NARROWEST current iPhone too, not
  // just this project's iPhone 13 profile. Restored immediately afterwards so
  // the rest of the test runs at the configured viewport.
  const configuredViewport = page.viewportSize()
  await page.setViewportSize({ width: NARROWEST_IPHONE_WIDTH_PX, height: NARROWEST_IPHONE_HEIGHT_PX })
  await expectNoHorizontalScroll(page)
  if (configuredViewport) await page.setViewportSize(configuredViewport)

  const instancesAfterReload = await readStore<WorkoutInstanceRow>(page, 'workoutInstances')
  const inProgressCount = instancesAfterReload.filter((row) => row.status === 'inProgress').length
  expect(inProgressCount).toBe(1)

  // The rest timer survived the reload with a correctly DECREMENTED
  // remainder — not reset back to the full 150s.
  const timerBarAfterReload = page.getByRole('group', { name: 'Rest timer' })
  await expect(timerBarAfterReload).toBeVisible()
  const countdownAfterReload = parseDurationText(
    await timerBarAfterReload.locator('.rest-timer-bar__countdown').innerText(),
  )
  const elapsedSec = Math.ceil((Date.now() - timerStartedAt) / MS_PER_SEC)
  expect(countdownAfterReload).toBeLessThan(initialCountdown)
  expect(countdownAfterReload).toBeGreaterThan(0)
  expect(countdownAfterReload).toBeGreaterThanOrEqual(BACK_SQUAT_REST_SEC - elapsedSec - REST_TOLERANCE_BEHIND_SEC)
  expect(countdownAfterReload).toBeLessThanOrEqual(BACK_SQUAT_REST_SEC - elapsedSec + REST_TOLERANCE_AHEAD_SEC)

  // Complete every remaining back-squat set, then finish the session early —
  // Partially completed, on purpose, with other exercises left untouched.
  for (const set of backSquatSets.slice(1)) {
    await backSquat.getByRole('button', { name: `Complete set ${String(set.setIndex + 1)}` }).click()
    await expect(backSquat.getByRole('button', { name: `Undo set ${String(set.setIndex + 1)}` })).toBeVisible()
  }

  await expect(page.getByRole('group', { name: 'Rest timer' })).toBeVisible()
  await page.getByRole('button', { name: 'Partially completed' }).click()

  // Back on Home, reporting the session as partial — never as completed.
  // (The plan may also list another, unrelated optional session for today
  // that got auto-dropped for recovery -- that's real scheduling behaviour,
  // not this session reappearing as still-actionable, which is what the
  // "no Start button left" check below actually rules out.)
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 })
  await expectNoHorizontalScroll(page)
  await expect(page.getByRole('button', { name: 'Start' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Partially completed' })).toBeVisible()

  const partialRows = await page.locator('.this-week-card__partial li').allInnerTexts()
  expect(partialRows).toContain(workoutName)

  const scheduleRows = await page.locator('.this-week-card__schedule li').allInnerTexts()
  const ownRow = scheduleRows.find((row) => row.includes(workoutName))
  expect(ownRow).toBeTruthy()
  expect(ownRow).toContain('(partiallyCompleted)')
  expect(ownRow).not.toContain('(completed)')

  await expect(page.getByText(/Essential sessions completed: 0 of/)).toBeVisible()
  await expect(page.getByText('Total sessions completed: 0')).toBeVisible()
})
