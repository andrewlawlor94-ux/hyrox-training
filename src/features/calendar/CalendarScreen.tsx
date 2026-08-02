import type { FC } from 'react'
import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Button, Card, EmptyState } from '@/components'
import { useToday } from '@/hooks/useToday'
import { SessionPreviewSheet } from '@/features/home/SessionPreviewSheet'
import { STATUS_LABEL } from '@/features/plan/planConstants'
import { loadCalendar } from './calendarData'
import type { CalendarDay } from './calendarData'

/** Monday-first, matching the plan's own week and the `startOfIsoWeek` the data
 * layer uses. Single letters so seven columns fit at 375px. */
const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

/** Statuses that mean the session happened. Drives the dot style, always
 * alongside a text label in the day's own accessible name — never colour alone. */
const ATTENDED: readonly string[] = ['completed', 'partiallyCompleted']
const MISSED: readonly string[] = ['skipped', 'autoDropped']

function dayNumber(date: string): string {
  return String(Number(date.split('-')[2] ?? '0'))
}

function entryDotClass(status: string): string {
  if (ATTENDED.includes(status)) return 'calendar-dot calendar-dot--done'
  if (MISSED.includes(status)) return 'calendar-dot calendar-dot--missed'
  return 'calendar-dot calendar-dot--planned'
}

/** What a screen reader reads for one day, so the dots are never the only
 * carrier of meaning. */
function dayAccessibleName(day: CalendarDay): string {
  const parts = [dayNumber(day.date)]
  if (day.isToday) parts.push('today')
  if (day.isRaceDay) parts.push('race day')
  if (day.entries.length === 0) parts.push('nothing scheduled')
  for (const entry of day.entries) {
    parts.push(`${entry.name}: ${STATUS_LABEL[entry.status]}`)
  }
  return parts.join(', ')
}

/**
 * The whole plan as month grids — completed training behind, everything still to
 * come ahead, and race day marked (athlete: "Build a calendar view tab with the
 * workouts leading up to race day also show workouts completed historically").
 *
 * One month at a time rather than a continuous scroll: at 375px a seven-column
 * grid with legible day numbers is already the full width, and paging keeps each
 * month's rows tall enough to show session names rather than bare dots.
 *
 * Tapping a day with sessions opens the same `SessionPreviewSheet` Home uses, so
 * "what is planned" and "do today" work identically wherever the athlete taps a
 * session. Reused rather than reimplemented — a second preview would be a second
 * place for the conflict warning to go missing.
 */
export const CalendarScreen: FC = () => {
  const today = useToday()
  const data = useLiveQuery(() => loadCalendar(today), [today])
  const [monthIndex, setMonthIndex] = useState<number | null>(null)
  const [previewInstanceId, setPreviewInstanceId] = useState<string | null>(null)

  // Open on the month containing today, once, without pinning the view there
  // afterwards (the athlete may be paging deliberately).
  useEffect(() => {
    if (data === undefined || monthIndex !== null) return
    setMonthIndex(data.todayMonthIndex)
  }, [data, monthIndex])

  if (data === undefined) return <p className="calendar-screen__loading">Loading…</p>

  if (data.months.length === 0) {
    return (
      <div className="calendar-screen">
        <h1 className="calendar-screen__heading">Calendar</h1>
        <EmptyState title="Nothing scheduled yet" description="Install a plan to see your training here." />
      </div>
    )
  }

  const index = Math.min(Math.max(monthIndex ?? data.todayMonthIndex, 0), data.months.length - 1)
  const month = data.months[index]
  if (!month) return null

  return (
    <div className="calendar-screen">
      <h1 className="calendar-screen__heading">Calendar</h1>

      <div className="calendar-nav">
        <Button
          variant="secondary" size="sm" disabled={index === 0}
          onClick={() => { setMonthIndex(index - 1) }}
        >
          Previous
        </Button>
        <p className="calendar-nav__label" aria-live="polite">{month.label}</p>
        <Button
          variant="secondary" size="sm" disabled={index === data.months.length - 1}
          onClick={() => { setMonthIndex(index + 1) }}
        >
          Next
        </Button>
      </div>

      <Card as="section" className="calendar-grid-card">
        <div className="calendar-weekdays" aria-hidden="true">
          {WEEKDAY_INITIALS.map((initial, i) => (
            <span key={`${initial}-${String(i)}`} className="calendar-weekdays__cell">{initial}</span>
          ))}
        </div>

        {month.weeks.map((week) => (
          <div key={week[0]?.date ?? ''} className="calendar-week">
            {week.map((day) => {
              const classes = ['calendar-day']
              if (day.isOutsideMonth) classes.push('calendar-day--outside')
              if (day.isToday) classes.push('calendar-day--today')
              if (day.isRaceDay) classes.push('calendar-day--race')
              const hasSessions = day.entries.length > 0

              // A day with nothing on it is not a control: an empty button is a
              // tap target that does nothing, which is worse than plain text.
              if (!hasSessions) {
                return (
                  <div key={day.date} className={classes.join(' ')}>
                    <span className="calendar-day__number">{dayNumber(day.date)}</span>
                    {day.isRaceDay && <span className="calendar-day__race-tag">Race</span>}
                  </div>
                )
              }

              return (
                <button
                  key={day.date}
                  type="button"
                  className={[...classes, 'calendar-day--button'].join(' ')}
                  aria-label={dayAccessibleName(day)}
                  onClick={() => { setPreviewInstanceId(day.entries[0]?.instanceId ?? null) }}
                >
                  <span className="calendar-day__number" aria-hidden="true">{dayNumber(day.date)}</span>
                  {day.isRaceDay && <span className="calendar-day__race-tag" aria-hidden="true">Race</span>}
                  <span className="calendar-day__dots" aria-hidden="true">
                    {day.entries.map((entry) => (
                      <span key={entry.instanceId} className={entryDotClass(entry.status)} />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
        ))}
      </Card>

      {/* Text, not colour alone — the same rule the rest of the app follows. */}
      <div className="calendar-legend">
        <span className="calendar-legend__item"><span className="calendar-dot calendar-dot--done" aria-hidden="true" />Done</span>
        <span className="calendar-legend__item"><span className="calendar-dot calendar-dot--planned" aria-hidden="true" />Planned</span>
        <span className="calendar-legend__item"><span className="calendar-dot calendar-dot--missed" aria-hidden="true" />Skipped or dropped</span>
      </div>

      <SessionPreviewSheet
        instanceId={previewInstanceId}
        today={today}
        onClose={() => { setPreviewInstanceId(null) }}
      />
    </div>
  )
}
