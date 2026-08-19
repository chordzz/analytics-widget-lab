/**
 * Tabular — the individual records.
 *
 * Sortable, with a sticky header and its own scroll region so a long table
 * never stretches the widget. Numeric columns are right-aligned and tabular-
 * figured, so digits line up column-wise and magnitudes stay comparable by eye.
 *
 * The table is also the accessible fallback for every other widget: when a
 * chart's palette carries a contrast warning, "a table view exists" is what
 * discharges it.
 */

import { useMemo, useState } from 'react'
import { formatValue } from '../format'
import { token } from '../../theme/tokens'
import type { Field, Row } from '../../data/types'

export interface DataTableProps {
  data: readonly Row[]
  /** Column definitions, in display order. */
  columns: Field[]
  /** @default 50 */
  limit?: number
  /** @default true */
  sortable?: boolean
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

type SortState = { key: string; direction: 'asc' | 'desc' } | null

export function DataTable({
  data,
  columns,
  limit = 50,
  sortable = true,
  height,
  className,
}: DataTableProps) {
  const [sort, setSort] = useState<SortState>(null)

  const rows = useMemo(() => {
    const visible = [...data]

    if (sort) {
      visible.sort((a, b) => {
        const left = a[sort.key]
        const right = b[sort.key]
        if (typeof left === 'number' && typeof right === 'number') {
          return sort.direction === 'asc' ? left - right : right - left
        }
        const comparison = String(left ?? '').localeCompare(String(right ?? ''))
        return sort.direction === 'asc' ? comparison : -comparison
      })
    }

    return visible.slice(0, limit)
  }, [data, sort, limit])

  const toggle = (key: string) =>
    setSort((current) =>
      current?.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' },
    )

  return (
    <div className={className} style={{ overflow: 'auto', minHeight: 0, height }}>
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 'var(--a-text-xs)',
        }}
      >
        <thead>
          <tr>
            {columns.map((column) => {
              const numeric = column.kind === 'measure'
              const active = sort?.key === column.key

              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={
                    active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  style={{
                    position: 'sticky',
                    top: 0,
                    zIndex: 1,
                    background: 'var(--a-surface)',
                    borderBottom: '1px solid var(--a-border)',
                    padding: '6px 8px',
                    textAlign: numeric ? 'right' : 'left',
                    fontWeight: 500,
                    color: token('textSecondary'),
                    whiteSpace: 'nowrap',
                  }}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => toggle(column.key)}
                      style={{
                        all: 'unset',
                        cursor: 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 4,
                        color: active ? token('text') : 'inherit',
                      }}
                    >
                      {column.label}
                      {active && <span aria-hidden="true">{sort.direction === 'asc' ? '↑' : '↓'}</span>}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              )
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => {
                const numeric = column.kind === 'measure'
                return (
                  <td
                    key={column.key}
                    className={numeric ? 'a-tabular' : undefined}
                    style={{
                      borderBottom: '1px solid var(--a-border)',
                      padding: '6px 8px',
                      textAlign: numeric ? 'right' : 'left',
                      color: token('text'),
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {formatValue(row[column.key], column.format ?? (numeric ? 'number' : 'text'))}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {data.length > rows.length && (
        <p style={{ margin: '8px 0 0', fontSize: 'var(--a-text-xs)', color: token('textMuted') }}>
          Showing {rows.length} of {data.length.toLocaleString()} rows
        </p>
      )}
    </div>
  )
}
