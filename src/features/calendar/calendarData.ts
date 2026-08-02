import { db } from '@/data/db'
import { readSettings } from '@/data/repositories'
import type { ISODate, Priority, WorkoutStatus } from '@/data/types'
import { addDays, compareDates, startOfIsoWeek } from '@/domain/dates'

/** Sessions land Monday-Saturday, but a calendar month grid still needs all
 * seven columns. */
const DAYS_PER_WEEK = 7
/** December, after which the month counter rolls into the next year. */
const LAST_MONTH = 12
/** Zero-padding width for a month number in an ISO date. */
const MONTH_PAD = 2

export interface CalendarEntry {
  instanceId: string
  name: string
  status: WorkoutStatus
  priority: Priority
  /** True once the session is completed history and cannot be rescheduled. */
  frozen: boolean
}

export interface CalendarDay {
  date: ISODate
  /** Sessions on this day, in the order the plan runs them. */
  entries: CalendarEntry[]
  isToday: boolean
  isRaceDay: boolean
  /** Outside the month being shown — rendered muted so the grid stays a
   * rectangle without pretending those days belong to this month. */
  isOutsideMonth: boolean
}

export interface CalendarMonth {
  /** First of the month, e.g. '2026-08-01'. */
  monthStart: ISODate
  label: string
  /** Whole weeks, Monday-first, covering every day of the month. */
  weeks: CalendarDay[][]
}

export interface CalendarData {
  months: CalendarMonth[]
  raceDate: ISODate | null
  /** The month index in `months` that contains today, or 0 when today falls
   * outside the range entirely. */
  todayMonthIndex: number
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const

/** 'YYYY-MM-DD' -> 'August 2026'. Hand-rolled rather than
 * `toLocaleDateString`, which is locale- and environment-dependent and would
 * make the rendered label non-deterministic across machines — the same reason
 * `explain.ts` and `TargetHeader` roll their own. */
function monthLabel(date: ISODate): string {
  const [year, month] = date.split('-')
  return `${MONTH_NAMES[Number(month) - 1] ?? ''} ${year ?? ''}`
}

function firstOfMonth(date: ISODate): ISODate {
  const [year, month] = date.split('-')
  return `${year ?? ''}-${month ?? ''}-01`
}

/** The first of the month after `date`, without constructing a Date. */
function nextMonthStart(date: ISODate): ISODate {
  const [yearText, monthText] = date.split('-')
  const year = Number(yearText)
  const month = Number(monthText)
  return month === LAST_MONTH
    ? `${String(year + 1)}-01-01`
    : `${String(year)}-${String(month + 1).padStart(MONTH_PAD, '0')}-01`
}

/**
 * Every session the athlete has done or still has to do, laid out as month
 * grids from the earliest thing in the plan through race day.
 *
 * Deliberately spans BOTH directions from today: the athlete asked for "the
 * workouts leading up to race day" and to "also show workouts completed
 * historically", so the range runs from the earliest session date (or plan
 * start) to the later of race day and the last scheduled session — a race that
 * has passed still shows the training that led to it.
 *
 * Skipped and auto-dropped sessions are included rather than hidden. A calendar
 * that quietly omitted them would misrepresent the week, and their status chips
 * already say what happened.
 *
 * A pure read, safe inside `useLiveQuery`.
 */
export async function loadCalendar(today: ISODate): Promise<CalendarData | undefined> {
  const settings = await readSettings()
  const plan = await db.plans.get(settings.activePlanId)
  if (!plan) return undefined

  const [instances, templates, goal] = await Promise.all([
    db.workoutInstances.where('planId').equals(plan.id).toArray(),
    db.workoutTemplates.where('planId').equals(plan.id).toArray(),
    db.raceGoals.filter((g) => g.isActive).first(),
  ])
  const templateNameById = new Map(templates.map((t) => [t.id, t.name]))
  const raceDate = goal?.raceDate ?? null

  // A completed session belongs on the day it was actually done, not the day it
  // was planned for — that is the whole point of showing history.
  const entriesByDate = new Map<ISODate, CalendarEntry[]>()
  const dated = instances
    .map((instance) => ({
      instance,
      date: instance.completedForDate ?? instance.scheduledDate,
    }))
    .filter((row) => row.date !== null && row.date !== '')
    .sort((a, b) => compareDates(a.date, b.date) || a.instance.sequence - b.instance.sequence)

  for (const { instance, date } of dated) {
    const list = entriesByDate.get(date) ?? []
    list.push({
      instanceId: instance.id,
      name: templateNameById.get(instance.templateId) ?? '',
      status: instance.status,
      priority: instance.priority,
      frozen: instance.frozen,
    })
    entriesByDate.set(date, list)
  }

  // Range: earliest session (or plan start) through the later of race day and
  // the last session, so nothing the athlete can see in the plan is cut off.
  const dates = dated.map((row) => row.date)
  const earliest = dates.length > 0 ? dates[0] as ISODate : plan.startDate
  const latestSession = dates.length > 0 ? dates[dates.length - 1] as ISODate : plan.startDate
  const rangeStart = compareDates(earliest, plan.startDate) <= 0 ? earliest : plan.startDate
  const rangeEnd = raceDate !== null && compareDates(raceDate, latestSession) > 0 ? raceDate : latestSession

  const months: CalendarMonth[] = []
  let monthCursor = firstOfMonth(rangeStart)
  const lastMonth = firstOfMonth(rangeEnd)

  while (compareDates(monthCursor, lastMonth) <= 0) {
    const monthEnd = addDays(nextMonthStart(monthCursor), -1)
    // Monday-first whole weeks covering the month.
    let dayCursor = startOfIsoWeek(monthCursor)
    const weeks: CalendarDay[][] = []
    while (compareDates(dayCursor, monthEnd) <= 0) {
      const week: CalendarDay[] = []
      for (let offset = 0; offset < DAYS_PER_WEEK; offset += 1) {
        const date = addDays(dayCursor, offset)
        week.push({
          date,
          entries: entriesByDate.get(date) ?? [],
          isToday: date === today,
          isRaceDay: raceDate !== null && date === raceDate,
          isOutsideMonth: firstOfMonth(date) !== monthCursor,
        })
      }
      weeks.push(week)
      dayCursor = addDays(dayCursor, DAYS_PER_WEEK)
    }
    months.push({ monthStart: monthCursor, label: monthLabel(monthCursor), weeks })
    monthCursor = nextMonthStart(monthCursor)
  }

  const todayMonthIndex = Math.max(0, months.findIndex((m) => m.monthStart === firstOfMonth(today)))
  return { months, raceDate, todayMonthIndex }
}
