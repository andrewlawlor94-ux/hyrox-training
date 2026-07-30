import type { FC } from 'react'
import { Card, Chip } from '@/components'
import type { ChipTone } from '@/components'
import { shortDate, weekdayName } from '@/domain/queue/explain'
import { STATUS_LABEL, STATUS_TONE } from '@/features/plan/planConstants'
import { WEEKLY_SESSION_MINIMUM } from './constants'
import type { ScheduleRow, ThisWeekVM } from './types'

interface ThisWeekCardProps {
  vm: ThisWeekVM
}

const PERCENT = 100
/** Guards the bar's arithmetic: a week with no essential sessions must not
 * divide by zero and render a NaN width (which paints as a full bar). */
const MIN_DENOMINATOR = 1
/** "Mon", not "Monday": three letters keeps the day column narrow enough that
 * the session name keeps the width it needs at 375px. */
const WEEKDAY_ABBREV_LENGTH = 3

function essentialPercent(done: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((Math.min(done, total) / Math.max(MIN_DENOMINATOR, total)) * PERCENT)
}

/** First three letters of the weekday plus the day-of-month — "Mon 27" — so a
 * row is placeable at a glance. A raw `2026-08-17` makes the athlete work out
 * which day of their week that is. */
function dayLabel(date: string): string {
  return `${weekdayName(date).slice(0, WEEKDAY_ABBREV_LENGTH)} ${shortDate(date).split(' ')[0] ?? ''}`
}

/**
 * Purely presentational — every number and row comes straight off `vm`, no
 * "streak"/guilt language anywhere in this file (a missed or skipped session
 * is shown as a scheduling fact, via its own status chip, never as a failure).
 *
 * Restructured to be SCANNED rather than read (athlete feedback: "the UI right
 * now is just text/bullets"). The change that removed the most text was not
 * cosmetic: `vm.partiallyCompleted`, `vm.skippedOrDropped` and `vm.movedRows`
 * are all strict SUBSETS of `vm.schedule` (see `buildThisWeekVM` — schedule is
 * every instance in the week), so the old card printed the same session's name
 * two or three times under different headings. Each session is now one row
 * carrying its own status chip, with "moved from ..." inline on the rows that
 * moved. No information is lost; the duplication is.
 *
 * The view model is deliberately unchanged — those fields are still the honest
 * derivation and other callers/tests use them. This is a presentation change.
 */
export const ThisWeekCard: FC<ThisWeekCardProps> = ({ vm }) => {
  const minimumTone: ChipTone = vm.fourSessionMinimumMet ? 'green' : 'accent'
  const percent = essentialPercent(vm.essentialCompletedCount, vm.essentialTotalCount)
  const movedDateById = new Map(vm.movedRows.map(({ row, originalDate }) => [row.id, originalDate]))

  return (
    <Card as="section" className="this-week-card">
      <h2>This week</h2>
      <p className="this-week-card__phase">{vm.phaseLabel} · Week {vm.weekNumber}</p>

      <div className="week-progress">
        <p className="week-progress__label">
          {vm.essentialCompletedCount} of {vm.essentialTotalCount} essential sessions done
        </p>
        <div
          className="week-progress__track"
          role="progressbar"
          aria-valuenow={percent}
          aria-valuemin={0}
          aria-valuemax={PERCENT}
          aria-label={`Essential sessions: ${String(vm.essentialCompletedCount)} of ${String(vm.essentialTotalCount)} done`}
        >
          <div className="week-progress__fill" style={{ width: `${String(percent)}%` }} />
        </div>
        <div className="week-progress__chips">
          <Chip tone={minimumTone}>{vm.sessionCount} of {WEEKLY_SESSION_MINIMUM} sessions this week</Chip>
          <Chip tone="neutral">{vm.totalCompletedCount} completed</Chip>
        </div>
      </div>

      <div className="this-week-card__schedule">
        {/* Just "Sessions": inside a card already titled "This week", the
            longer "This week's sessions" repeats the heading above it — and it
            made `getByRole('heading', { name: 'This week' })` ambiguous with the
            card's own h2, which is a real accessibility smell, not only a test
            problem. */}
        <h3>Sessions</h3>
        <ul>
          {vm.schedule.map((row: ScheduleRow) => {
            const movedFrom = movedDateById.get(row.id)
            return (
              <li key={row.id} className="week-row">
                <span className="week-row__day">{dayLabel(row.scheduledDate)}</span>
                <span className="week-row__name">
                  {row.name}
                  {movedFrom !== undefined && (
                    <span className="week-row__moved">moved from {dayLabel(movedFrom)}</span>
                  )}
                </span>
                <Chip tone={STATUS_TONE[row.status]}>{STATUS_LABEL[row.status]}</Chip>
              </li>
            )
          })}
        </ul>
      </div>

      <p className="this-week-card__next-action">{vm.nextBestAction}</p>
    </Card>
  )
}
