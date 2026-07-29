import type { FC } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { EmptyState } from '@/components'
import { exerciseHistory } from '@/data/repositories'
import { formatLoad } from '@/domain/units/format'

interface ExerciseHistoryListProps {
  exerciseId: string
}

/**
 * Every completed, non-warmup session for one exercise, oldest first (see
 * `exerciseRepo.exerciseHistory`'s own contract). Read-only: this never
 * writes, so it's safe wherever it's rendered, including inside a
 * `useLiveQuery`-backed parent.
 */
export const ExerciseHistoryList: FC<ExerciseHistoryListProps> = ({ exerciseId }) => {
  const sessions = useLiveQuery(() => exerciseHistory(exerciseId), [exerciseId])

  if (sessions === undefined) return <p className="library-field__note">Loading…</p>

  if (sessions.length === 0) {
    return (
      <EmptyState
        title="No history yet"
        description="Once a session with this exercise is completed, its sets will show up here."
      />
    )
  }

  return (
    <ul className="exercise-history-list">
      {sessions.map((session) => (
        <li key={session.date} className="exercise-history-list__row">
          <p className="exercise-history-list__date">{session.date}</p>
          <p className="exercise-history-list__sets">
            {session.sets.map((set, index) => (
              <span key={index}>
                {`${formatLoad({ value: set.weight, unit: set.unit })} x ${String(set.reps)}`}
                {index < session.sets.length - 1 ? ', ' : ''}
              </span>
            ))}
          </p>
        </li>
      ))}
    </ul>
  )
}
