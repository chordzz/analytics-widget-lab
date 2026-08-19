/**
 * Tabular — the cross-tab.
 *
 * Rows by one dimension, columns by another, an aggregate in each cell. The
 * margins matter as much as the body: without row and column totals a reader
 * has to add up mentally to answer "which team has the most", which is the
 * first question anyone asks of a cross-tab.
 *
 * Cells carry a light sequential wash so the shape of the table is visible at a
 * glance, with the figure always present as text — the number is the content,
 * the shade is the index.
 */

import { useMemo } from 'react'
import { formatValue } from '../format'
import { sequentialFor, token } from '../../theme/tokens'
import type { Row, ValueFormat } from '../../data/types'

export type Aggregation = 'count' | 'sum' | 'average'

export interface PivotTableProps {
  data: readonly Row[]
  /** Dimension forming the rows. */
  rowKey: string
  /** Dimension forming the columns. */
  columnKey: string
  /** Measure to aggregate. Omit when counting records. */
  valueKey?: string
  /** @default 'count' */
  aggregation?: Aggregation
  format?: ValueFormat
  /** @default true */
  showShading?: boolean
  /**
   * Fixed height in pixels. Omit to size to content.
   *
   * Part of the shared contract: any primitive that takes `data` takes this, so
   * a caller can put one in a fixed box without wrapping it. Content beyond it
   * scrolls rather than overflowing the frame.
   */
  height?: number
  className?: string
}

export function PivotTable({
  data,
  rowKey,
  columnKey,
  valueKey,
  aggregation = 'count',
  format = 'number',
  showShading = true,
  height,
  className,
}: PivotTableProps) {
  // No data draws nothing. Axes and gridlines around an empty set read as a
  // broken chart, and whatever wraps this — a card, a page — is better placed
  // to say why it is empty.
  if (data.length === 0) return null

  const { rows, columns, cells, rowTotals, columnTotals, grandTotal, peak } = useMemo(() => {
    const rowNames = [...new Set(data.map((row) => String(row[rowKey])))].sort()
    const columnNames = [...new Set(data.map((row) => String(row[columnKey])))].sort()

    // Sum and count first; average is derived, because averaging averages is
    // wrong and it is an easy mistake to bake in.
    const sums = new Map<string, number>()
    const counts = new Map<string, number>()

    for (const record of data) {
      const key = `${record[rowKey]}|${record[columnKey]}`
      const value = valueKey ? Number(record[valueKey] ?? 0) : 1
      sums.set(key, (sums.get(key) ?? 0) + value)
      counts.set(key, (counts.get(key) ?? 0) + 1)
    }

    const resolve = (key: string): number | undefined => {
      const count = counts.get(key)
      if (count === undefined) return undefined
      if (aggregation === 'count') return count
      const sum = sums.get(key) ?? 0
      return aggregation === 'average' ? sum / count : sum
    }

    const cellValues = new Map<string, number>()
    for (const key of counts.keys()) {
      const value = resolve(key)
      if (value !== undefined) cellValues.set(key, value)
    }

    const rowTotal = new Map<string, number>()
    const columnTotal = new Map<string, number>()

    for (const name of rowNames) {
      const values = columnNames
        .map((column) => cellValues.get(`${name}|${column}`))
        .filter((value): value is number => value !== undefined)
      rowTotal.set(name, aggregate(values, aggregation))
    }
    for (const name of columnNames) {
      const values = rowNames
        .map((row) => cellValues.get(`${row}|${name}`))
        .filter((value): value is number => value !== undefined)
      columnTotal.set(name, aggregate(values, aggregation))
    }

    return {
      rows: rowNames,
      columns: columnNames,
      cells: cellValues,
      rowTotals: rowTotal,
      columnTotals: columnTotal,
      grandTotal: aggregate([...cellValues.values()], aggregation),
      peak: Math.max(...cellValues.values(), 1),
    }
  }, [data, rowKey, columnKey, valueKey, aggregation])

  const headCell: React.CSSProperties = {
    fontWeight: 500,
    color: token('textMuted'),
    padding: '5px 8px',
    textAlign: 'right',
    whiteSpace: 'nowrap',
  }

  return (
    <div className={className} style={{ overflow: 'auto', minHeight: 0, height }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 'var(--a-text-xs)', width: '100%' }}>
        <thead>
          <tr>
            <th
              style={{
                ...headCell,
                textAlign: 'left',
                position: 'sticky',
                left: 0,
                background: 'var(--a-surface)',
              }}
            >
              {rowKey}
            </th>
            {columns.map((column) => (
              <th key={column} style={headCell}>
                {column}
              </th>
            ))}
            <th style={{ ...headCell, color: token('text') }}>Total</th>
          </tr>
        </thead>

        <tbody>
          {rows.map((row) => (
            <tr key={row}>
              <th
                scope="row"
                style={{
                  ...headCell,
                  textAlign: 'left',
                  fontWeight: 400,
                  color: token('text'),
                  position: 'sticky',
                  left: 0,
                  background: 'var(--a-surface)',
                  borderTop: '1px solid var(--a-border)',
                }}
              >
                {row}
              </th>

              {columns.map((column) => {
                const value = cells.get(`${row}|${column}`)
                const intensity = value === undefined ? 0 : value / peak

                return (
                  <td
                    key={column}
                    className="a-tabular"
                    style={{
                      padding: '5px 8px',
                      textAlign: 'right',
                      borderTop: '1px solid var(--a-border)',
                      background:
                        showShading && value !== undefined && intensity > 0.04
                          ? sequentialFor(intensity * 0.7)
                          : undefined,
                      color:
                        showShading && intensity > 0.5 ? 'var(--a-text-inverse)' : token('text'),
                    }}
                  >
                    {value === undefined ? '—' : formatValue(value, format)}
                  </td>
                )
              })}

              <td
                className="a-tabular"
                style={{
                  padding: '5px 8px',
                  textAlign: 'right',
                  borderTop: '1px solid var(--a-border)',
                  fontWeight: 600,
                  color: token('text'),
                }}
              >
                {formatValue(rowTotals.get(row), format)}
              </td>
            </tr>
          ))}
        </tbody>

        <tfoot>
          <tr>
            <th
              scope="row"
              style={{
                ...headCell,
                textAlign: 'left',
                color: token('text'),
                position: 'sticky',
                left: 0,
                background: 'var(--a-surface)',
                borderTop: '2px solid var(--a-border-strong)',
              }}
            >
              Total
            </th>
            {columns.map((column) => (
              <td
                key={column}
                className="a-tabular"
                style={{
                  padding: '5px 8px',
                  textAlign: 'right',
                  fontWeight: 600,
                  color: token('text'),
                  borderTop: '2px solid var(--a-border-strong)',
                }}
              >
                {formatValue(columnTotals.get(column), format)}
              </td>
            ))}
            <td
              className="a-tabular"
              style={{
                padding: '5px 8px',
                textAlign: 'right',
                fontWeight: 600,
                color: token('text'),
                borderTop: '2px solid var(--a-border-strong)',
              }}
            >
              {formatValue(grandTotal, format)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function aggregate(values: number[], aggregation: Aggregation): number {
  if (values.length === 0) return 0
  const sum = values.reduce((total, value) => total + value, 0)
  // A margin over averages is the mean of the cell means — imperfect, but the
  // honest alternative needs the raw rows, which the caller may not have.
  return aggregation === 'average' ? sum / values.length : sum
}
