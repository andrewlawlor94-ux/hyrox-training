import type { ReactElement } from 'react'

export interface ChartTableColumn<T> {
  key: string
  label: string
  render: (row: T) => string
}

interface ChartTableProps<T> {
  /** Caption text for screen-reader users — visually hidden, describes what
   * the table (and the chart it backs) shows. */
  summary: string
  columns: ChartTableColumn<T>[]
  rows: T[]
}

/**
 * The accessible tabular fallback every chart in Progress renders alongside
 * itself, with exactly the same data the chart plots — a chart alone is not
 * accessible (§17). Collapsed inside a `<details>` so it's available on
 * demand without competing with the chart for a small screen's attention.
 */
export function ChartTable<T>({ summary, columns, rows }: ChartTableProps<T>): ReactElement {
  return (
    <details className="chart-table">
      <summary>Table view</summary>
      <div className="chart-table__scroll">
        <table>
          <caption className="visually-hidden">{summary}</caption>
          <thead>
            <tr>
              {columns.map((col) => <th key={col.key} scope="col">{col.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((col) => <td key={col.key}>{col.render(row)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}
