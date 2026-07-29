import type { FC } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatPace } from '@/domain/units/format'
import { ChartTable } from './ChartTable'
import type { PaceByTypeRow } from './runningViewModel'
import { AXIS_TICK_FONT_SIZE, CHART_HEIGHT, CHART_MARGIN, Y_AXIS_WIDTH } from './constants'

const RUN_TYPE_LABEL: Record<PaceByTypeRow['runType'], string> = {
  easy: 'Easy', long: 'Long', tempo: 'Tempo', intervals: 'Intervals',
  compromised: 'Compromised', benchmark: 'Benchmark', race: 'Race',
}

interface PaceByTypeChartProps {
  rows: PaceByTypeRow[]
}

/** Average pace grouped by run type (§17) — a bar per type actually logged,
 * y-axis in seconds/km so `Tooltip`'s default numeric formatting still makes
 * sense; the accessible `ChartTable` is what actually renders `formatPace`'s
 * mm:ss form. */
export const PaceByTypeChart: FC<PaceByTypeChartProps> = ({ rows }) => {
  const data = rows.map((row) => ({ ...row, label: RUN_TYPE_LABEL[row.runType] }))

  return (
    <div className="chart-card">
      <h3>Average pace by run type</h3>
      <div className="chart-card__scroll">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <BarChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: AXIS_TICK_FONT_SIZE }} />
            <YAxis tick={{ fontSize: AXIS_TICK_FONT_SIZE }} width={Y_AXIS_WIDTH} />
            <Tooltip />
            <Bar dataKey="meanPaceSecPerKm" name="Average pace (sec/km)" fill="var(--accent)" />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <ChartTable
        summary="Average pace by run type"
        rows={rows}
        columns={[
          { key: 'type', label: 'Run type', render: (row) => RUN_TYPE_LABEL[row.runType] },
          { key: 'pace', label: 'Average pace', render: (row) => formatPace(row.meanPaceSecPerKm) },
          { key: 'count', label: 'Runs', render: (row) => String(row.runCount) },
        ]}
      />
    </div>
  )
}
