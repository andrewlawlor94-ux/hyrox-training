import type { ChangeEvent, FC } from 'react'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Chip, EmptyState, Sheet } from '@/components'
import { db } from '@/data/db'
import { createExercise, listExercises } from '@/data/repositories'
import type { Exercise, ExerciseCategory } from '@/data/types'
import { CATEGORY_LABEL, CATEGORY_OPTIONS } from './constants'
import { ExerciseDetail } from './ExerciseDetail'
import { ExerciseForm } from './ExerciseForm'
import { EMPTY_EXERCISE_FORM_VALUES, toExerciseInput } from './formValues'
import type { ExerciseFormValues } from './formValues'

type CategoryFilter = ExerciseCategory | 'all'

async function loadExercises(search: string, category: CategoryFilter, includeArchived: boolean): Promise<Exercise[]> {
  return listExercises({
    includeArchived,
    ...(category !== 'all' ? { category } : {}),
    ...(search.trim().length > 0 ? { search: search.trim() } : {}),
  })
}

/**
 * The exercise library (§13): search, category filter, a compact list (name
 * + category chip, not a paragraph per row -- the athlete has already said
 * the app is too text-heavy), and sheets for creating, viewing, and editing
 * a definition. Reached from Settings (see `SettingsScreen`'s "Exercise
 * library" link) rather than a fourth bottom-nav tab or a Plan tab that
 * doesn't exist yet -- see the Task 28 report for why.
 *
 * `listExercises` never writes, so `useLiveQuery` here is safe per this
 * project's read-that-writes rule.
 */
export const LibraryScreen: FC = () => {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState<CategoryFilter>('all')
  const [includeArchived, setIncludeArchived] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const exercises = useLiveQuery(
    () => loadExercises(search, category, includeArchived),
    [search, category, includeArchived],
  )

  // Read directly by id, independent of the filtered list above -- looking
  // the selection up inside `exercises` instead would close this sheet the
  // moment the athlete archives the very exercise they're viewing (it drops
  // out of the default, non-archived list), making "Archive" then "Restore"
  // from the same detail view impossible.
  const selected = useLiveQuery(
    () => (selectedId ? db.exercises.get(selectedId) : undefined),
    [selectedId],
  )

  async function handleCreate(values: ExerciseFormValues): Promise<void> {
    await createExercise(toExerciseInput(values), new Date().toISOString())
    setIsCreating(false)
  }

  return (
    <div className="library-screen">
      <h1 className="library-screen__heading">Exercise library</h1>

      <div className="library-screen__controls">
        <div className="library-field">
          <label htmlFor="library-search" className="library-field__label">Search</label>
          <input
            id="library-search"
            type="text"
            className="library-field__input"
            value={search}
            onChange={(event: ChangeEvent<HTMLInputElement>) => { setSearch(event.target.value) }}
            placeholder="Exercise name"
          />
        </div>
        <div className="library-field">
          <label htmlFor="library-category-filter" className="library-field__label">Category</label>
          <select
            id="library-category-filter"
            className="library-field__select"
            value={category}
            onChange={(event) => { setCategory(event.target.value as CategoryFilter) }}
          >
            <option value="all">All categories</option>
            {CATEGORY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
        <label className="library-screen__archived-toggle">
          <input type="checkbox" checked={includeArchived} onChange={(event) => { setIncludeArchived(event.target.checked) }} />
          Show archived
        </label>
      </div>

      <Button onClick={() => { setIsCreating(true) }}>New exercise</Button>

      {exercises === undefined && <p className="library-field__note">Loading…</p>}

      {exercises !== undefined && exercises.length === 0 && (
        <EmptyState
          title="No exercises found"
          description="Try a different search or category, or create a new exercise."
        />
      )}

      {exercises !== undefined && exercises.length > 0 && (
        <ul className="library-screen__list">
          {exercises.map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                className="library-screen__row"
                onClick={() => { setSelectedId(exercise.id) }}
              >
                <span className="library-screen__row-name">{exercise.name}</span>
                <span className="library-screen__row-chips">
                  <Chip tone="neutral">{CATEGORY_LABEL[exercise.category]}</Chip>
                  {exercise.isArchived && <Chip tone="caution">Archived</Chip>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet open={isCreating} onClose={() => { setIsCreating(false) }} title="New exercise">
        <ExerciseForm
          initial={EMPTY_EXERCISE_FORM_VALUES}
          submitLabel="Create"
          onSave={handleCreate}
          onCancel={() => { setIsCreating(false) }}
        />
      </Sheet>

      <Sheet open={selected !== undefined} onClose={() => { setSelectedId(null) }} title={selected?.name ?? 'Exercise'}>
        {selected && (
          <ExerciseDetail
            exercise={selected}
            onSelect={setSelectedId}
            onClose={() => { setSelectedId(null) }}
          />
        )}
      </Sheet>
    </div>
  )
}
