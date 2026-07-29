import { readFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { completeOnboarding, exerciseCard, readStore } from './helpers'

interface StrengthSetRow {
  id: string
  exerciseId: string
  setIndex: number
  weight?: number
  reps?: number
  isCompleted: boolean
}

interface WorkoutInstanceRow {
  id: string
  status: string
  frozen: boolean
}

/** A deliberately unparsable file — `validateBackup`'s very first check
 * (`JSON.parse`) is what this is meant to fail. */
const CORRUPTED_BACKUP = '{ this is not valid json'

async function findBackSquatSet(page: Page): Promise<StrengthSetRow | undefined> {
  const rows = await readStore<StrengthSetRow>(page, 'strengthSets')
  return rows.filter((row) => row.exerciseId === 'ex_back_squat').sort((a, b) => a.setIndex - b.setIndex)[0]
}

test('a captured backup restores a completed session exactly, and a corrupted file changes nothing', async ({ page }) => {
  await completeOnboarding(page)

  // Log a real set, then finish the whole session as Completed so its
  // instance is frozen — the strongest fidelity check the round trip can get.
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page).toHaveURL(/\/workout\//)
  const instanceId = new URL(page.url()).pathname.split('/').filter(Boolean).pop()
  expect(instanceId).toBeTruthy()

  await expect(page.getByRole('heading', { name: 'Back squat' })).toBeVisible()
  const backSquat = exerciseCard(page, 'Back squat')
  await backSquat.getByRole('button', { name: 'Complete set 1' }).click()
  await expect(backSquat.getByRole('button', { name: 'Undo set 1' })).toBeVisible()
  await page.getByRole('button', { name: 'Completed', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 10_000 })

  const originalSet = await findBackSquatSet(page)
  expect(originalSet).toBeDefined()
  expect(originalSet?.isCompleted).toBe(true)
  expect(originalSet?.weight).toBeDefined()
  expect(originalSet?.reps).toBeDefined()

  const instancesBeforeReset = await readStore<WorkoutInstanceRow>(page, 'workoutInstances')
  const originalInstance = instancesBeforeReset.find((row) => row.id === instanceId)
  expect(originalInstance).toBeDefined()
  expect(originalInstance?.frozen).toBe(true)
  expect(originalInstance?.status).toBe('completed')

  // Export, and capture the real downloaded file (a genuine Blob + <a
  // download> click, not a mocked one).
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'Export backup' }).click(),
  ])
  const downloadPath = await download.path()
  expect(downloadPath).toBeTruthy()
  const exportedJson = readFileSync(downloadPath ?? '', 'utf-8')
  expect(exportedJson).toContain('hyrox-training-backup')

  // Reset all data through the real confirmation flow.
  await page.getByLabel('Type DELETE to confirm').fill('DELETE')
  await page.getByRole('button', { name: 'Reset application data' }).click()

  // The reload lands back at onboarding — proof the device is genuinely empty.
  await expect(page.getByRole('heading', { name: 'Race date' })).toBeVisible({ timeout: 20_000 })
  const emptySets = await readStore<StrengthSetRow>(page, 'strengthSets')
  expect(emptySets).toHaveLength(0)

  // Import via onboarding's OWN restore entry point — the path a fresh phone
  // actually uses, before any onboarding step is filled in.
  await page.getByLabel('Restore backup').setInputFiles({
    name: 'hyrox-training-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(exportedJson, 'utf-8'),
  })

  // C1: a valid file is staged behind a confirmation showing current-vs-file
  // record counts rather than imported the instant it's selected — nothing
  // is written to the (currently empty, freshly reset) device until this
  // real tap confirms the replacement.
  await expect(page.getByRole('heading', { name: 'Replace all data on this device?' })).toBeVisible()
  const emptySetsBeforeConfirm = await readStore<StrengthSetRow>(page, 'strengthSets')
  expect(emptySetsBeforeConfirm).toHaveLength(0)
  await page.getByRole('button', { name: 'Import and replace' }).click()

  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible({ timeout: 20_000 })

  const restoredSet = await findBackSquatSet(page)
  expect(restoredSet).toBeDefined()
  expect(restoredSet?.id).toBe(originalSet?.id)
  expect(restoredSet?.isCompleted).toBe(true)
  expect(restoredSet?.weight).toBe(originalSet?.weight)
  expect(restoredSet?.reps).toBe(originalSet?.reps)

  const instancesAfterRestore = await readStore<WorkoutInstanceRow>(page, 'workoutInstances')
  const restoredInstance = instancesAfterRestore.find((row) => row.id === instanceId)
  expect(restoredInstance).toBeDefined()
  expect(restoredInstance?.frozen).toBe(true)
  expect(restoredInstance?.status).toBe('completed')

  // A deliberately corrupted file: a specific error, and zero writes.
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.getByLabel('Import backup').setInputFiles({
    name: 'corrupted.json',
    mimeType: 'application/json',
    buffer: Buffer.from(CORRUPTED_BACKUP, 'utf-8'),
  })
  await expect(page.getByText(/not valid json/i)).toBeVisible()

  const setAfterBadImport = await findBackSquatSet(page)
  expect(setAfterBadImport?.id).toBe(originalSet?.id)
  expect(setAfterBadImport?.weight).toBe(originalSet?.weight)
  expect(setAfterBadImport?.reps).toBe(originalSet?.reps)

  const instancesAfterBadImport = await readStore<WorkoutInstanceRow>(page, 'workoutInstances')
  const instanceAfterBadImport = instancesAfterBadImport.find((row) => row.id === instanceId)
  expect(instanceAfterBadImport?.frozen).toBe(true)
  expect(instanceAfterBadImport?.status).toBe('completed')
})
