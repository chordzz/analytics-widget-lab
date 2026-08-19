/**
 * Tabular — "What are the individual records?"
 * Data Shape: one or more Dimensions and/or Measures.
 *
 * Sorting here is presentation only: it reorders the rows already retrieved.
 * A Viewer reordering a table must never be able to reach records the
 * retrieval did not return (FR-DA-12), so this deliberately does not re-query.
 * Server-side ordering belongs to the Author's configured sorts (FR-VZ-06).
 *
 * Column visibility uses container queries: in a narrow container only the
 * leading columns survive, without the page knowing anything about it.
 */

import { useState } from 'react'
import { fieldLabel, formatFull } from './shared'
import type { RendererProps } from '../widget-runtime/renderer'
import type { DatasetRow } from '../domain/query'

const PAGE_SIZE = 8

export function TabularRenderer({ rows, dataset, mapping }: RendererProps) {
  const columns = mapping.columns?.length
    ? mapping.columns
    : Object.keys(rows[0] ?? {})

  const [sort, setSort] = useState<{ field: string; ascending: boolean } | null>(null)
  const [page, setPage] = useState(0)

  if (columns.length === 0) throw new Error('A Tabular Widget needs at least one column.')

  const ordered = sort ? sortRows(rows, sort.field, sort.ascending) : rows
  const pageCount = Math.ceil(ordered.length / PAGE_SIZE)
  const visible = ordered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  const toggleSort = (field: string) => {
    setPage(0)
    setSort((current) =>
      current?.field === field
        ? { field, ascending: !current.ascending }
        : { field, ascending: true },
    )
  }

  return (
    <div className="h-full flex flex-col gap-2">
      <div className="flex-1 min-h-0 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-[var(--analytics-text-muted)]">
              {columns.map((column, index) => (
                <th
                  key={column}
                  // Beyond the second column, only show when the container allows.
                  className={[
                    'font-normal py-1 pr-3 whitespace-nowrap',
                    index > 1 ? 'hidden @sm:table-cell' : '',
                    index > 3 ? '@sm:hidden @lg:table-cell' : '',
                  ].join(' ')}
                >
                  <button
                    onClick={() => toggleSort(column)}
                    className="inline-flex items-center gap-1 hover:text-[var(--analytics-text)]"
                    aria-sort={
                      sort?.field === column
                        ? sort.ascending
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    {fieldLabel(dataset, column)}
                    {sort?.field === column && (
                      <span aria-hidden="true">{sort.ascending ? '↑' : '↓'}</span>
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="text-[var(--analytics-text-secondary)]">
            {visible.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-[var(--analytics-border)]">
                {columns.map((column, index) => (
                  <td
                    key={column}
                    className={[
                      'py-1 pr-3 whitespace-nowrap',
                      index === 0 ? 'text-[var(--analytics-text)]' : '',
                      index > 1 ? 'hidden @sm:table-cell' : '',
                      index > 3 ? '@sm:hidden @lg:table-cell' : '',
                    ].join(' ')}
                  >
                    {formatFull(row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between text-xs text-[var(--analytics-text-muted)]">
          <span>
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, ordered.length)} of{' '}
            {ordered.length}
          </span>
          <span className="flex gap-1">
            <PageButton onClick={() => setPage((p) => p - 1)} disabled={page === 0}>
              Previous
            </PageButton>
            <PageButton
              onClick={() => setPage((p) => p + 1)}
              disabled={page >= pageCount - 1}
            >
              Next
            </PageButton>
          </span>
        </div>
      )}
    </div>
  )
}

function PageButton({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled: boolean
  children: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded border border-[var(--analytics-border)] px-2 py-0.5 disabled:opacity-40 enabled:hover:text-[var(--analytics-text)]"
    >
      {children}
    </button>
  )
}

function sortRows(rows: readonly DatasetRow[], field: string, ascending: boolean): DatasetRow[] {
  const sign = ascending ? 1 : -1
  return [...rows].sort((a, b) => {
    const left = a[field]
    const right = b[field]
    if (typeof left === 'number' && typeof right === 'number') return sign * (left - right)
    return sign * String(left ?? '').localeCompare(String(right ?? ''))
  })
}
