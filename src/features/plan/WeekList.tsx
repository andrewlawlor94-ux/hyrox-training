import type { FC } from 'react'
import { Chip } from '@/components'
import type { WeekSummary } from './planData'
import { weekProgress } from './planConstants'

interface WeekListProps {
  weeks: WeekSummary[]
  currentWeekNumber: number | null
  onSelect: (weekNumber: number) => void
}

const PROGRESS_LABEL: Record<ReturnType<typeof weekProgress>, string> = {
  completed: 'Done', dropped: 'Not needed', inProgress: 'In progress', upcoming: 'Upcoming',
}
/** `dropped` is deliberately NOT green: nothing in the week happened. Neutral
 * rather than a warning tone too — a week dropped because the race moved closer
 * is a scheduling fact, not the athlete's failure (the same no-guilt rule the
 * rest of the app follows). */
const PROGRESS_TONE: Record<ReturnType<typeof weekProgress>, 'green' | 'accent' | 'neutral'> = {
  completed: 'green', dropped: 'neutral', inProgress: 'accent', upcoming: 'neutral',
}

function doneCount(sessions: WeekSummary['sessions']): number {
  return sessions.filter((s) => s.status === 'completed' || s.status === 'partiallyCompleted').length
}

/**
 * A compact, scannable week-by-week list (the athlete has said the app is
 * too text-heavy — one line per week, not a paragraph): week number, phase,
 * a "done X/Y" count, a progress chip, and a "This week" marker for whichever
 * week contains `currentWeekNumber`. Tapping a row selects it for
 * `WeekDetail`.
 */
export const WeekList: FC<WeekListProps> = ({ weeks, currentWeekNumber, onSelect }) => (
  <ul className="week-list">
    {weeks.map((week) => {
      const progress = weekProgress(week.sessions.map((s) => s.status))
      const isCurrent = week.weekNumber === currentWeekNumber
      return (
        <li key={week.planWeekId}>
          <button type="button" className="week-list__row" onClick={() => { onSelect(week.weekNumber) }}>
            <span className="week-list__heading">
              <span className="week-list__number">Week {week.weekNumber}</span>
              <span className="week-list__phase">{week.phaseName}</span>
              {isCurrent && <Chip tone="accent">This week</Chip>}
            </span>
            <span className="week-list__meta">
              <span className="week-list__count">{doneCount(week.sessions)}/{week.sessions.length} done</span>
              <Chip tone={PROGRESS_TONE[progress]}>{PROGRESS_LABEL[progress]}</Chip>
            </span>
          </button>
        </li>
      )
    })}
  </ul>
)
