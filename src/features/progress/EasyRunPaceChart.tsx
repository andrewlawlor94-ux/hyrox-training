import type { FC } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatPace } from '@/domain/units/format'
import { ChartTable } from './ChartTable'
import type { EasyRunPacePoint } from './runningViewModel'
import { AXIS_TICK_FONT_SIZE, CHART_HEIGHT, CHART_MARGIN, Y_AXIS_WIDTH } from './constants'

interface EasyRunPaceChartProps {
  points: EasyRunPacePoint[]
}

/** Easy-run pace trend over time (§17) — the plan's own recovery-pace
 * barometer, distinct from the average-by-type comparison. */
export const EasyRunPaceChart: FC<EasyRunPaceChartProps> = ({ points }) => (
  <div className="chart-card">
    <h3>Easy-run pace trend</h3>
    <div className="chart-card__scroll">
      <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
        <LineChart data={points} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="date" tick={{ fontSize: AXIS_TICK_FONT_SIZE }} />
          <YAxis tick={{ fontSize: AXIS_TICK_FONT_SIZE }} width={Y_AXIS_WIDTH} />
          <Tooltip />
          <Line type="monotone" dataKey="paceSecPerKm" name="Easy-run pace" stroke="var(--accent)" strokeWidth={2} dot />
        </LineChart>
      </ResponsiveContainer>
    </div>
    <ChartTable
      summary="Easy-run pace by run date"
      rows={points}
      columns={[
        { key: 'date', label: 'Date', render: (row) => row.date },
        { key: 'pace', label: 'Pace', render: (row) => formatPace(row.paceSecPerKm) },
      ]}
    />
  </div>
)
