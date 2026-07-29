import type { FC } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Chip } from '@/components'
import type { ChipTone } from '@/components'
import { formatDistanceM } from '@/domain/units/format'
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
 * Weekly running volume (§17): planned, completed, missed, and dropped
 * distance as four independent bars per week — never one stacked
 * percentage. The most recent week's completed-vs-planned values are also
 * called out as plain text above the chart, since "did 80% of the plan"
 * would hide exactly the two raw numbers the brief asks to keep visible.
 */
export const WeeklyVolumeChart: FC<WeeklyVolumeChartProps> = ({ rows }) => {
  const latest = rows[rows.length - 1]

  return (
    <div className="chart-card">
      <h3>Weekly running volume</h3>
      {latest && (
        <p className="chart-card__note">
          This week: {formatKm(latest.completedKm)} completed of {formatKm(latest.plannedKm)} planned.
        </p>
      )}
      <div className="volume-legend">
        {CATEGORIES.map((cat) => <Chip key={cat.key} tone={cat.tone}>{cat.label}</Chip>)}
      </div>
      <div className="chart-card__scroll">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart data={rows} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="weekNumber" tick={{ fontSize: AXIS_TICK_FONT_SIZE }} />
            <YAxis tick={{ fontSize: AXIS_TICK_FONT_SIZE }} width={Y_AXIS_WIDTH} />
            <Tooltip />
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
          { key: 'planned', label: 'Planned', render: (row) => formatKm(row.plannedKm) },
          { key: 'completed', label: 'Completed', render: (row) => formatKm(row.completedKm) },
          { key: 'missed', label: 'Missed', render: (row) => formatKm(row.missedKm) },
          { key: 'dropped', label: 'Dropped', render: (row) => formatKm(row.droppedKm) },
        ]}
      />
    </div>
  )
}
