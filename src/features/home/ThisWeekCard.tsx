import type { FC } from 'react'
import { Card, Chip } from '@/components'
import type { ChipTone } from '@/components'
import { WEEKLY_SESSION_MINIMUM } from './constants'
import type { ThisWeekVM } from './types'

interface ThisWeekCardProps {
  vm: ThisWeekVM
}

/** Purely presentational — every number and row comes straight off `vm`, no
 * "streak"/guilt language anywhere in this file (a missed or skipped session
 * is shown as a scheduling fact, in `skippedOrDropped`, never as a failure). */
export const ThisWeekCard: FC<ThisWeekCardProps> = ({ vm }) => {
  const minimumTone: ChipTone = vm.fourSessionMinimumMet ? 'green' : 'accent'

  return (
    <Card as="section" className="this-week-card">
      <h2>This week</h2>
      <p className="this-week-card__phase">{vm.phaseLabel} · Week {vm.weekNumber}</p>

      <p className="this-week-card__essential">
        Essential sessions completed: {vm.essentialCompletedCount} of {vm.essentialTotalCount}
      </p>
      <p className="this-week-card__total">Total sessions completed: {vm.totalCompletedCount}</p>
      <p className="this-week-card__minimum">
        <Chip tone={minimumTone}>
          {vm.sessionCount} of {WEEKLY_SESSION_MINIMUM} sessions this week
        </Chip>
      </p>

      {vm.partiallyCompleted.length > 0 && (
        <div className="this-week-card__partial">
          <h3>Partially completed</h3>
          <ul>
            {vm.partiallyCompleted.map((row) => <li key={row.id}>{row.name}</li>)}
          </ul>
        </div>
      )}

      {vm.skippedOrDropped.length > 0 && (
        <div className="this-week-card__skipped">
          <h3>Skipped or dropped</h3>
          <ul>
            {vm.skippedOrDropped.map((row) => <li key={row.id}>{row.name}</li>)}
          </ul>
        </div>
      )}

      <div className="this-week-card__schedule">
        <h3>Current recommended schedule</h3>
        <ul>
          {vm.schedule.map((row) => (
            <li key={row.id}>
              {row.name} — {row.scheduledDate} ({row.status})
            </li>
          ))}
        </ul>
      </div>

      {vm.movedRows.length > 0 && (
        <div className="this-week-card__moved">
          <h3>Originally planned for</h3>
          <ul>
            {vm.movedRows.map(({ row, originalDate }) => (
              <li key={row.id}>{row.name} was originally planned for {originalDate}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="this-week-card__next-action">{vm.nextBestAction}</p>
    </Card>
  )
}
