import type { FC } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Chip } from '@/components'
import type { ChipTone } from '@/components'
import { formatDistanceM, SEC_PER_MIN } from '@/domain/units/format'
import { ChartTable } from './ChartTable'
import type { WeeklyVolumeRow } from './runningViewModel'
import { AXIS_TICK_FONT_SIZE, CHART_HEIGHT, CHART_MARGIN, Y_AXIS_WIDTH } from './constants'

const KM_TO_M = 1000

interface VolumeCategoryMeta {
  key: keyof Pick<WeeklyVolumeRow, 'plannedKm' | 'completedKm' | 'missedKm' | 'droppedKm'>
  label: string
  color: string
  tone: ChipTone
}

/** The four categories §17 requires (planned/completed/missed/dropped),
 * never distinguished by colour alone: each has its own always-visible text
 * label, both as a `Chip` in `.volume-legend` and as a `Bar`'s `name` (which
 * Recharts' own legend/tooltip render as text next to the colour swatch). */
const CATEGORIES: readonly VolumeCategoryMeta[] = [
  { key: 'plannedKm', label: 'Planned', color: 'var(--text-muted)', tone: 'neutral' },
  { key: 'completedKm', label: 'Completed', color: 'var(--green)', tone: 'green' },
  { key: 'missedKm', label: 'Missed', color: 'var(--caution)', tone: 'caution' },
  { key: 'droppedKm', label: 'Dropped', color: 'var(--elevated)', tone: 'elevated' },
]

interface WeeklyVolumeChartProps {
  rows: WeeklyVolumeRow[]
}

function formatKm(km: number): string {
  return formatDistanceM(Math.round(km * KM_TO_M))
}

/**
 * A week's planned volume, honestly: many seeded runs are prescribed by
 * duration rather than distance (an easy run's "30 min", not "5 km"), so
 * `plannedKm` alone can read as a genuine zero for a week that in fact asked
 * for real training time. Rather than inventing a pace to convert minutes
 * into km (which would fabricate data no different from recording an effort
 * rating the athlete never gave), both units are shown, each only when
 * non-zero — "82 min", "8 km", or "75 min + 8 km" for a mixed week — so an
 * athlete can never read a duration-prescribed week as "ahead of plan"
 * purely because its minutes were counted as zero km.
 */
function formatPlannedVolume(row: WeeklyVolumeRow): string {
  const parts: string[] = []
  if (row.plannedDurationSec > 0) parts.push(`${String(Math.round(row.plannedDurationSec / SEC_PER_MIN))} min`)
  if (row.plannedKm > 0) parts.push(formatKm(row.plannedKm))
  return parts.length > 0 ? parts.join(' + ') : formatKm(0)
}

/**
 * Names the weeks whose plan is partly or wholly in minutes.
 *
 * The note and the table already reported both units honestly, but the CHART
 * plots `plannedKm` alone — so a week prescribed entirely by duration drew a
 * zero Planned bar beside a real Completed bar and read as dramatically ahead of
 * plan, which is the opposite of the truth. The bars cannot be fixed by
 * converting minutes to km without inventing a pace (fabricating data the
 * athlete never gave), so the chart says out loud which weeks its Planned bar
 * cannot fully represent. A phone has no reliable hover, so this is a caption
 * rather than only a tooltip.
 */
function durationOnlyWeeks(rows: readonly WeeklyVolumeRow[]): number[] {
  return rows.filter((row) => row.plannedDurationSec > 0).map((row) => row.weekNumber)
}

/**
 * Weekly running volume (§17): planned, completed, missed, and dropped
 * distance as four independent bars per week — never one stacked
 * percentage. The most recent week's completed-vs-planned values are also
 * called out as plain text above the chart, since "did 80% of the plan"
 * would hide exactly the two raw numbers the brief asks to keep visible.
 */
export const WeeklyVolumeChart: FC<WeeklyVolumeChartProps> = ({ rows }) => {
  const latest = rows[rows.length - 1]
  const timeBasedWeeks = durationOnlyWeeks(rows)

  return (
    <div className="chart-card">
      <h3>Weekly running volume</h3>
      {latest && (
        <p className="chart-card__note">
          This week: {formatKm(latest.completedKm)} completed of {formatPlannedVolume(latest)} planned.
        </p>
      )}
      <div className="volume-legend">
        {CATEGORIES.map((cat) => <Chip key={cat.key} tone={cat.tone}>{cat.label}</Chip>)}
      </div>
      {timeBasedWeeks.length > 0 && (
        <p className="chart-card__caveat">
          {timeBasedWeeks.length === 1 ? 'Week' : 'Weeks'} {timeBasedWeeks.join(', ')}{' '}
          {timeBasedWeeks.length === 1 ? 'prescribes' : 'prescribe'} running by time, not distance, so the Planned bar
          understates {timeBasedWeeks.length === 1 ? 'it' : 'them'} — the table below gives the minutes.
        </p>
      )}
      <div className="chart-card__scroll">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart data={rows} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="weekNumber" tick={{ fontSize: AXIS_TICK_FONT_SIZE }} />
            <YAxis tick={{ fontSize: AXIS_TICK_FONT_SIZE }} width={Y_AXIS_WIDTH} />
            {/* The Planned entry reports both units, so hovering a week whose
                bar reads zero still shows the minutes it actually asked for. */}
            <Tooltip
              formatter={(value, name, item) => {
                if (name !== 'Planned') return formatKm(Number(value))
                const row = (item as { payload?: WeeklyVolumeRow }).payload
                return row ? formatPlannedVolume(row) : formatKm(Number(value))
              }}
            />
            {CATEGORIES.map((cat) => (
              <Bar key={cat.key} dataKey={cat.key} name={cat.label} fill={cat.color} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartTable
        summary="Weekly running volume: planned, completed, missed, and dropped distance"
        rows={rows}
        columns={[
          { key: 'week', label: 'Week', render: (row) => String(row.weekNumber) },
          { key: 'planned', label: 'Planned', render: (row) => formatPlannedVolume(row) },
          { key: 'completed', label: 'Completed', render: (row) => formatKm(row.completedKm) },
          { key: 'missed', label: 'Missed', render: (row) => formatKm(row.missedKm) },
          { key: 'dropped', label: 'Dropped', render: (row) => formatKm(row.droppedKm) },
        ]}
      />
    </div>
  )
}
