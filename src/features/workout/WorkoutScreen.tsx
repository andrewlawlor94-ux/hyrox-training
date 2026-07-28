import type { FC } from 'react'
import { useParams } from 'react-router-dom'
import { EmptyState } from '@/components'
import { useToday } from '@/hooks/useToday'
import { ExerciseCard } from './ExerciseCard'
import { useWorkout } from './useWorkout'
import { WorkoutFooter } from './WorkoutFooter'

/**
 * The whole workout, one vertically scrolling screen, every exercise
 * expanded by default (§8) — no accordions, no per-card interaction needed
 * before its target/set rows are visible. `useWorkout` owns both the
 * read-side assembly (recommendations, existing sets/logs) and the two
 * mount-time side effects (marking the instance in progress, materializing
 * empty set rows for a prescription that has none yet).
 */
export const WorkoutScreen: FC = () => {
  const params = useParams<{ id: string }>()
  const today = useToday()
  const data = useWorkout(params.id ?? '', today)

  if (data === undefined) return <p className="workout-screen__loading">Loading…</p>

  return (
    <div className="workout-screen">
      <div className="workout-screen__header">
        {data.templateName && <p className="workout-screen__name">{data.templateName}</p>}
        <h1 className="workout-screen__heading">{`Week ${String(data.instance.weekNumber)} · Session ${String(data.instance.sessionSlot)}`}</h1>
      </div>
      {data.exercises.length === 0 ? (
        <EmptyState
          title="Nothing prescribed"
          description="This session has no exercises to log yet."
        />
      ) : (
        <div className="workout-screen__exercises">
          {data.exercises.map((item) => (
            <ExerciseCard key={item.prescription.id} item={item} />
          ))}
        </div>
      )}
      <WorkoutFooter instance={data.instance} today={today} />
    </div>
  )
}
