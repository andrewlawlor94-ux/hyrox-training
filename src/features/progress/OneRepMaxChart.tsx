import type { FC } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartTable } from './ChartTable'
import type { OneRepMaxVM } from './strengthViewModel'
import { AXIS_TICK_FONT_SIZE, CHART_HEIGHT, CHART_MARGIN, ONE_RM_TABLE_DECIMALS, Y_AXIS_WIDTH } from './constants'

interface OneRepMaxChartProps {
  exerciseName: string
  vm: OneRepMaxVM
}

/**
 * The estimated one-rep-max trend (§17) — gated on `hasEnough1RMData`
 * (`ONE_RM_MIN_SESSIONS`, currently 3): below that, a trend line is noise,
 * not signal, so an explanatory message replaces the chart entirely rather
 * than showing a thin or single-point line. Every rendering of the value —
 * heading, series name, table column — says "estimated", never a bare "1RM",
 * since Epley's formula is an estimate, not a measurement.
 */
export const OneRepMaxChart: FC<OneRepMaxChartProps> = ({ exerciseName, vm }) => {
  if (!vm.hasEnough) {
    return (
      <div className="chart-card">
        <h3>Estimated one-rep max</h3>
        <p className="chart-card__note">
          Not enough qualifying sessions yet for an estimated one-rep-max trend — this needs at least three sessions
          with a usable weight and rep count. Keep logging sets and this will fill in.
        </p>
      </div>
    )
  }

  return (
    <div className="chart-card">
      <h3>Estimated one-rep max</h3>
      <div className="chart-card__scroll">
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={vm.points} margin={CHART_MARGIN}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="date" tick={{ fontSize: AXIS_TICK_FONT_SIZE }} />
            <YAxis tick={{ fontSize: AXIS_TICK_FONT_SIZE }} width={Y_AXIS_WIDTH} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="estimated1RM"
              name={`${exerciseName} estimated 1RM`}
              stroke="var(--green)"
              strokeWidth={2}
              dot
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ChartTable
        summary={`Estimated one-rep max for ${exerciseName} by session date`}
        rows={vm.points}
        columns={[
          { key: 'date', label: 'Date', render: (row) => row.date },
          { key: 'value', label: 'Estimated 1RM', render: (row) => row.estimated1RM.toFixed(ONE_RM_TABLE_DECIMALS) },
        ]}
      />
    </div>
  )
}
