import type { FC } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatLoad } from '@/domain/units/format'
import { ChartTable } from './ChartTable'
import type { WorkingWeightPoint } from './strengthViewModel'
import { AXIS_TICK_FONT_SIZE, CHART_HEIGHT, CHART_MARGIN, Y_AXIS_WIDTH } from './constants'

interface WorkingWeightChartProps {
  exerciseName: string
  points: WorkingWeightPoint[]
}

/**
 * Working weight (the first completed set of each session — see
 * `strengthViewModel`'s doc comment) over time. One series, fixed height, a
 * `ChartTable` fallback with the exact same points.
 */
export const WorkingWeightChart: FC<WorkingWeightChartProps> = ({ exerciseName, points }) => (
  <div className="chart-card">
    <h3>Working weight over time</h3>
    <div className="chart-card__scroll">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={points} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: AXIS_TICK_FONT_SIZE }} />
          <YAxis tick={{ fontSize: AXIS_TICK_FONT_SIZE }} width={Y_AXIS_WIDTH} />
          <Tooltip />
          <Line type="monotone" dataKey="weight" name={`${exerciseName} working weight`} stroke="var(--accent)" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <ChartTable
      summary={`Working weight for ${exerciseName} by session date`}
      rows={points}
      columns={[
        { key: 'date', label: 'Date', render: (row) => row.date },
        { key: 'weight', label: 'Weight', render: (row) => formatLoad({ value: row.weight, unit: row.unit }) },
      ]}
    />
  </div>
)
