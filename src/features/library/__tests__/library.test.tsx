import { beforeEach, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { db, resetDatabase } from '@/data/db'
import { archiveExercise, createExercise, updateSettings } from '@/data/repositories'
import { renderApp } from '@/test/renderApp'
import { seedTestDb } from '@/test/seedTestDb'

const NOW = '2026-01-05T08:00:00.000Z'
const CUSTOM_REST_SEC = 60

async function onboard(): Promise<void> {
  await updateSettings({ onboardingCompletedAt: NOW })
}

async function renderLibrary(): Promise<void> {
  renderApp({ route: '/library' })
  await screen.findByRole('heading', { level: 1, name: /exercise library/i })
}

beforeEach(async () => {
  await resetDatabase()
})

describe('Library entry point', () => {
  it('is reachable from Settings, not a bottom-nav tab', async () => {
    await seedTestDb()
    await onboard()
    renderApp({ route: '/settings' })
    await screen.findByRole('heading', { level: 1, name: /settings/i })

    const nav = screen.getByRole('navigation')
    expect(within(nav).queryByRole('link', { name: /library/i })).toBeNull()

    await userEvent.click(screen.getByRole('link', { name: /exercise library/i }))
    await screen.findByRole('heading', { level: 1, name: /exercise library/i })
  })
})

describe('LibraryScreen: list, search, and filter', () => {
  it('lists every non-archived seeded exercise, and the list is non-empty', async () => {
    await seedTestDb()
    await onboard()
    await renderLibrary()

    const rows = await screen.findAllByRole('button', { name: /squat|press|run|erg/i })
    expect(rows.length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /back squat/i })).toBeInTheDocument()
    expect(screen.queryByText(/no exercises found/i)).toBeNull()
  })

  it('excludes archived exercises by default, and shows them once "Show archived" is checked', async () => {
    await seedTestDb()
    await onboard()
    await archiveExercise('ex_back_squat', NOW)
    await renderLibrary()

    await screen.findByRole('button', { name: /bench press/i })
    expect(screen.queryByRole('button', { name: /back squat/i })).toBeNull()

    await userEvent.click(screen.getByLabelText(/show archived/i))
    await screen.findByRole('button', { name: /back squat/i })
  })

  it('searches by name', async () => {
    await seedTestDb()
    await onboard()
    await renderLibrary()
    await screen.findByRole('button', { name: /bench press/i })

    await userEvent.type(screen.getByLabelText(/^search/i), 'squat')

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /bench press/i })).toBeNull()
    })
    expect(screen.getByRole('button', { name: /back squat/i })).toBeInTheDocument()
  })

  it('filters by category, and search and category combine', async () => {
    await seedTestDb()
    await onboard()
    await renderLibrary()
    await screen.findByRole('button', { name: /bench press/i })

    await userEvent.selectOptions(screen.getByLabelText(/^category/i), 'press')
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /back squat/i })).toBeNull()
    })
    expect(screen.getByRole('button', { name: /bench press/i })).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/^search/i), 'bench')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /bench press/i })).toBeInTheDocument()
    })

    await userEvent.clear(screen.getByLabelText(/^search/i))
    await userEvent.type(screen.getByLabelText(/^search/i), 'squat')
    await waitFor(() => {
      // "press" category + "squat" search combine to nothing.
      expect(screen.queryByRole('button', { name: /back squat/i })).toBeNull()
      expect(screen.queryByRole('button', { name: /bench press/i })).toBeNull()
    })
  })
})

describe('Create', () => {
  it('creates a new exercise exposing every definition field, and it appears in the list', async () => {
    await seedTestDb()
    await onboard()
    await renderLibrary()
    await screen.findByRole('button', { name: /bench press/i })

    await userEvent.click(screen.getByRole('button', { name: /new exercise/i }))
    const dialog = screen.getByRole('dialog')

    await userEvent.type(within(dialog).getByLabelText(/^name/i), 'Custom Curl')
    await userEvent.selectOptions(within(dialog).getByLabelText(/^category/i), 'accessory')
    await userEvent.selectOptions(within(dialog).getByLabelText(/measurement type/i), 'strengthSets')
    await userEvent.selectOptions(within(dialog).getByLabelText(/load style/i), 'perDumbbell')
    await userEvent.selectOptions(within(dialog).getByLabelText(/default unit/i), 'lb')

    const restInput = within(dialog).getByLabelText(/default rest/i)
    await userEvent.clear(restInput)
    await userEvent.type(restInput, String(CUSTOM_REST_SEC))

    const notesInput = within(dialog).getByLabelText(/technique notes/i)
    await userEvent.type(notesInput, 'Elbows pinned to the torso.')

    await userEvent.click(within(dialog).getByRole('button', { name: /^create$/i }))

    await screen.findByRole('button', { name: /custom curl/i })
    const created = (await db.exercises.toArray()).find((e) => e.name === 'Custom Curl')
    expect(created).toBeDefined()
    expect(created?.isSeeded).toBe(false)
    expect(created?.defaultRestSec).toBe(CUSTOM_REST_SEC)
    expect(created?.loadStyle).toBe('perDumbbell')
    expect(created?.techniqueNotes).toBe('Elbows pinned to the torso.')
  })

  it('a newly created custom exercise retains its rest default when viewed again later', async () => {
    await seedTestDb()
    await onboard()
    await createExercise({
      name: 'Custom Curl', category: 'accessory', measurementType: 'strengthSets', loadStyle: 'perDumbbell',
      defaultUnit: 'lb', defaultRestSec: CUSTOM_REST_SEC, progressionIncrement: 5, incrementUnit: 'lb',
      defaultSets: 3, repMin: 8, repMax: 12, techniqueNotes: '', isArchived: false,
    }, NOW)
    await renderLibrary()

    await userEvent.click(await screen.findByRole('button', { name: /custom curl/i }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(new RegExp(`${CUSTOM_REST_SEC} sec`))).toBeInTheDocument()
  })
})

describe('Edit', () => {
  it('edits an exercise definition without altering an existing InstancePrescription or completed StrengthSet', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()

    const existingPrescription = await db.instancePrescriptions.where('exerciseId').equals('ex_back_squat').first()
    if (!existingPrescription) throw new Error('expected a seeded instance prescription for back squat')
    const originalRestSec = existingPrescription.restSec
    const existingSet = await db.strengthSets.where('exerciseId').equals('ex_back_squat').first()
    if (!existingSet) throw new Error('expected a completed back squat set from the history fixture')
    const originalWeight = existingSet.weight

    await renderLibrary()
    await userEvent.click(await screen.findByRole('button', { name: /back squat/i }))
    const detailDialog = await screen.findByRole('dialog')
    await userEvent.click(within(detailDialog).getByRole('button', { name: /^edit$/i }))

    const dialog = screen.getByRole('dialog')
    const restInput = within(dialog).getByLabelText(/default rest/i)
    await userEvent.clear(restInput)
    // A clock, not raw seconds: '320' is 3:20, i.e. 200s.
    await userEvent.type(restInput, '320')
    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }))

    await waitFor(async () => {
      const updated = await db.exercises.get('ex_back_squat')
      expect(updated?.defaultRestSec).toBe(200)
    })

    const prescriptionAfter = await db.instancePrescriptions.get(existingPrescription.id)
    expect(prescriptionAfter?.restSec).toBe(originalRestSec)
    const setAfter = await db.strengthSets.get(existingSet.id)
    expect(setAfter?.weight).toBe(originalWeight)
  })

  it('permits editing a seeded exercise and marks it as user-modified', async () => {
    await seedTestDb()
    await onboard()
    await renderLibrary()

    await userEvent.click(await screen.findByRole('button', { name: /back squat/i }))
    const detailDialog = await screen.findByRole('dialog')
    expect(within(detailDialog).getByText(/seeded/i)).toBeInTheDocument()
    expect(within(detailDialog).queryByText(/^edited$/i)).toBeNull()

    await userEvent.click(within(detailDialog).getByRole('button', { name: /^edit$/i }))
    const notesInput = within(screen.getByRole('dialog')).getByLabelText(/technique notes/i)
    await userEvent.type(notesInput, ' Updated cue.')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /save changes/i }))

    await within(screen.getByRole('dialog')).findByText(/^edited$/i)
    // Lets `ExerciseHistoryList` (remounted once the form closes) settle its
    // own async read before the test ends, rather than leaving that update
    // to land after this test has already finished.
    await within(screen.getByRole('dialog')).findByText(/no history yet/i)

    const updated = await db.exercises.get('ex_back_squat')
    expect(updated?.techniqueNotes).toContain('Updated cue.')
    expect(updated?.isSeeded).toBe(true)
    expect(updated?.updatedAt).not.toBe(updated?.createdAt)
  })

  it('does not silently change a station\'s zero progression increment', async () => {
    await seedTestDb()
    await onboard()
    await renderLibrary()

    await userEvent.click(await screen.findByRole('button', { name: /sled push/i }))
    const detailDialog = await screen.findByRole('dialog')
    await userEvent.click(within(detailDialog).getByRole('button', { name: /^edit$/i }))

    const dialog = screen.getByRole('dialog')
    const incrementInput = within(dialog).getByLabelText<HTMLInputElement>(/progression increment/i)
    expect(incrementInput.value).toBe('0')

    await userEvent.click(within(dialog).getByRole('button', { name: /save changes/i }))
    await waitFor(async () => {
      const updated = await db.exercises.get('ex_sled_push')
      expect(updated?.progressionIncrement).toBe(0)
    })
  })
})

describe('Duplicate', () => {
  it('duplicates an exercise, appending " (copy)" and keeping it usable independently', async () => {
    await seedTestDb()
    await onboard()
    await renderLibrary()

    await userEvent.click(await screen.findByRole('button', { name: /bench press/i }))
    const detailDialog = await screen.findByRole('dialog')
    await userEvent.click(within(detailDialog).getByRole('button', { name: /duplicate/i }))

    await waitFor(() => {
      expect(within(screen.getByRole('dialog')).getByText(/bench press \(copy\)/i)).toBeInTheDocument()
    })
    const copy = (await db.exercises.toArray()).find((e) => e.name === 'Bench press (copy)')
    expect(copy).toBeDefined()
    expect(copy?.isSeeded).toBe(false)
    expect(copy?.id).not.toBe('ex_bench_press')
  })
})

describe('Archive and restore', () => {
  it('archives without deleting history, and restore brings it back to the default list', async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    const historicSet = await db.strengthSets.where('exerciseId').equals('ex_back_squat').first()

    await renderLibrary()
    await userEvent.click(await screen.findByRole('button', { name: /back squat/i }))
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(await within(dialog).findByRole('button', { name: /^archive$/i }))

    // Wait for the DOM (not just the DB) to reflect the toggle before
    // continuing -- otherwise the next click can race the re-render that
    // swaps "Archive" for "Restore".
    const restoreButton = await within(dialog).findByRole('button', { name: /^restore$/i })
    expect((await db.exercises.get('ex_back_squat'))?.isArchived).toBe(true)
    expect(await db.strengthSets.get(historicSet?.id ?? '')).toEqual(historicSet)

    await userEvent.click(restoreButton)
    await within(dialog).findByRole('button', { name: /^archive$/i })
    expect((await db.exercises.get('ex_back_squat'))?.isArchived).toBe(false)
  })

  it('allows archiving an exercise a scheduled workout still prescribes, and leaves that prescription intact', async () => {
    await seedTestDb()
    await onboard()

    const prescription = await db.instancePrescriptions.where('exerciseId').equals('ex_back_squat').first()
    if (!prescription) throw new Error('expected a seeded, not-yet-completed back squat prescription')
    const instance = await db.workoutInstances.get(prescription.instanceId)
    expect(instance?.frozen).toBe(false) // Confirms this fixture is genuinely still-scheduled, not history.

    await renderLibrary()
    await userEvent.click(await screen.findByRole('button', { name: /back squat/i }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText(/still prescribed in/i)

    await userEvent.click(within(dialog).getByRole('button', { name: /^archive$/i }))
    await within(dialog).findByRole('button', { name: /^restore$/i })
    expect((await db.exercises.get('ex_back_squat'))?.isArchived).toBe(true)

    const prescriptionAfter = await db.instancePrescriptions.get(prescription.id)
    expect(prescriptionAfter).toEqual(prescription)
    // Archived, but still resolvable by id -- exactly what the still-scheduled workout needs.
    expect((await db.exercises.get('ex_back_squat'))?.name).toBe('Back squat')
  })
})

describe('History', () => {
  it("shows an exercise's logged session history", async () => {
    await seedTestDb({ withHistory: true })
    await onboard()
    await renderLibrary()

    await userEvent.click(await screen.findByRole('button', { name: /back squat/i }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText(/175 lb x 5/i)
  })

  it('shows an empty-history message for an exercise with no logged sessions', async () => {
    await seedTestDb()
    await onboard()
    await renderLibrary()

    await userEvent.click(await screen.findByRole('button', { name: /back squat/i }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText(/no history yet/i)
  })
})
