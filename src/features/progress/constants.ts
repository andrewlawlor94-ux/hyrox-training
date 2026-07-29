/**
 * Fixed pixel height for every Recharts `ResponsiveContainer` on the Progress
 * screens (§17): tall enough to read a trend on a 375px phone, short enough
 * that two or three charts still fit one scroll. Never percentage-based —
 * a percentage height needs a sized ancestor, which these screens don't
 * otherwise have.
 */
export const CHART_HEIGHT = 210

/** Shared chart margin: a little breathing room on the right for the last
 * data point's label, none on the left (the Y axis already reserves its own
 * width via `Y_AXIS_WIDTH`). */
export const CHART_MARGIN = { top: 8, right: 12, left: 0, bottom: 0 }

/** Axis tick label size — smaller than body copy so dense date/number labels
 * don't crowd a 375px-wide chart. */
export const AXIS_TICK_FONT_SIZE = 11

/** Reserved width for the Y axis' own tick labels. */
export const Y_AXIS_WIDTH = 40

/** How many of the most recent sessions `RecentSessionsList` shows — enough
 * to see a short pattern without turning into an unbounded scroll of every
 * session ever logged. */
export const RECENT_SESSIONS_LIMIT = 8

/** How many elapsed plan weeks `WeeklyVolumeChart` shows at once — enough to
 * see a trend, few enough that bar groups stay legible at 375px. */
export const WEEKS_WINDOW = 8

/** Decimal precision for a displayed estimated-1RM value in a `ChartTable`. */
export const ONE_RM_TABLE_DECIMALS = 1
