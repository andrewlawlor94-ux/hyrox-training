import type { FC } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { formatPace } from '@/domain/units/format'
import { ChartTable } from './ChartTable'
import { paceTick, paceTooltipValue } from './paceAxis'
import type { PaceByTypeRow } from './runningViewModel'
import { AXIS_TICK_FONT_SIZE, CHART_HEIGHT, CHART_MARGIN, Y_AXIS_WIDTH } from './constants'

const RUN_TYPE_LABEL: Record<PaceByTypeRow['runType'], string> = {
  easy: 'Easy', long: 'Long', tempo: 'Tempo', intervals: 'Intervals',
  compromised: 'Compromised', benchmark: 'Benchmark', race: 'Race',
}

interface PaceByTypeChartProps {
  rows: PaceByTypeRow[]
}

/**
 * Average pace grouped by run type (§17) — a bar per type actually logged.
 *
 * Axis and tooltip both read as mm:ss. They used to print raw seconds per
 * kilometre, on the reasoning that Recharts' default numeric formatting was
 * enough and the accessible `ChartTable` below carried the readable form. The
 * athlete found the hole in that: the chart is the part you actually look at,
 * and "382" is not a pace anyone recognises.
 */
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
            <YAxis tick={{ fontSize: AXIS_TICK_FONT_SIZE }} width={Y_AXIS_WIDTH} tickFormatter={paceTick} />
            <Tooltip formatter={(value) => paceTooltipValue(value)} />
            <Bar dataKey="meanPaceSecPerKm" name="Average pace" fill="var(--accent)" />
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
