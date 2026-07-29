import type { FC, ReactElement } from 'react'
import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card, EmptyState } from '@/components'
import { useToday } from '@/hooks/useToday'
import type { ISODate } from '@/data/types'
import { formatLoad } from '@/domain/units/format'
import type { StrengthRecommendation } from '@/domain/recommendations/strengthTarget'
import { buildRecommendationForExercise, loadExercisesWithHistory } from './strengthData'
import type { ExerciseWithHistory } from './strengthData'
import { buildStrengthDetailVM } from './strengthViewModel'
import type { StrengthDetailVM } from './strengthViewModel'
import { WorkingWeightChart } from './WorkingWeightChart'
import { OneRepMaxChart } from './OneRepMaxChart'
import { RecentSessionsList } from './RecentSessionsList'
import { PersonalBestsCard } from './PersonalBestsCard'

interface StrengthProgressData {
  list: ExerciseWithHistory[]
  detail: StrengthDetailVM | null
}

async function loadData(selectedId: string | null, today: ISODate): Promise<StrengthProgressData> {
  const list = await loadExercisesWithHistory()
  const target = list.find((item) => item.exercise.id === selectedId) ?? list[0]
  if (!target) return { list, detail: null }

  const recommendation = await buildRecommendationForExercise(target.exercise, target.sessions, today)
  return { list, detail: buildStrengthDetailVM(target.exercise, target.sessions, recommendation) }
}

/** Previous weight, the current recommended target, and why (§17) — the
 * recommendation engine's own `reason` string, never a paragraph invented
 * here. */
function RecommendationCard({ vm }: { vm: StrengthDetailVM }): ReactElement {
  const rec: StrengthRecommendation = vm.recommendation
  return (
    <Card as="section" className="strength-recommendation-card">
      <h3>Target vs. previous</h3>
      <p className="strength-recommendation-card__previous">
        Previous weight: {rec.previous ? `${formatLoad(rec.previous.load)} x ${String(rec.previous.reps)}` : 'No prior session'}
      </p>
      <p className="strength-recommendation-card__target">
        Current recommended target: {formatLoad(rec.target)}
        {rec.isOptionalAim ? ' (optional aim)' : ''}
      </p>
      <p className="strength-recommendation-card__reason">{rec.reason}</p>
    </Card>
  )
}

/**
 * Strength progress (Task 25, §17): an exercise picker over every
 * non-archived exercise with logged history, then working weight over time,
 * the estimated-1RM trend (gated on `hasEnough1RMData`), personal bests,
 * recent sessions, and the current target vs. previous weight — all
 * composed from already-tested pure domain functions, nothing reimplemented
 * here.
 */
export const StrengthProgress: FC = () => {
  const today = useToday()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const data = useLiveQuery(() => loadData(selectedId, today), [selectedId, today])

  if (data === undefined) return <p className="progress-screen__loading">Loading…</p>

  if (data.list.length === 0) {
    return (
      <EmptyState
        title="No strength history yet"
        description="Log a strength session and it will show up here: working weight over time, personal bests, and how you're tracking against the recommended target."
      />
    )
  }

  const detail = data.detail
  const selectedValue = detail?.exercise.id ?? data.list[0]?.exercise.id ?? ''

  return (
    <div className="strength-progress">
      <div className="strength-progress__picker">
        <label htmlFor="strength-progress-exercise" className="strength-progress__picker-label">Exercise</label>
        <select
          id="strength-progress-exercise"
          className="strength-progress__picker-select"
          value={selectedValue}
          onChange={(event) => { setSelectedId(event.target.value) }}
        >
          {data.list.map((item) => (
            <option key={item.exercise.id} value={item.exercise.id}>{item.exercise.name}</option>
          ))}
        </select>
      </div>

      {detail && (
        <>
          <WorkingWeightChart exerciseName={detail.exercise.name} points={detail.workingWeight} />
          <OneRepMaxChart exerciseName={detail.exercise.name} vm={detail.oneRM} />
          <RecommendationCard vm={detail} />
          <PersonalBestsCard bests={detail.personalBests} />
          <RecentSessionsList sessions={detail.recentSessions} />
        </>
      )}
    </div>
  )
}
