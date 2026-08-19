/**
 * Chronological — "What happened, in order?"
 * Data Shape: time-ordered records.
 *
 * The Family that needs no Measure: a feed lists events rather than aggregating
 * them. That is also what separates it from Trend, which shares the same Time
 * Dimension requirement but adds a Measure.
 */

import { fieldLabel } from './shared'
import type { DatasetRow } from '../domain/query'
import type { RendererProps } from '../widget-runtime/renderer'

function describe(row: DatasetRow, columns: string[]): string {
  return columns
    .map((key) => row[key])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .join(' · ')
}

function chronologicalRenderer(variant: 'feed' | 'log') {
  return function ChronologicalRenderer({ rows, dataset, mapping }: RendererProps) {
    const time = mapping.timeDimension
    if (!time) throw new Error('A Chronological Widget needs a Time Dimension to order by.')

    // Most recent first — a feed read oldest-first would bury what matters.
    const ordered = [...rows].sort((a, b) =>
      String(b[time] ?? '').localeCompare(String(a[time] ?? '')),
    )

    const columns = (mapping.columns ?? dataset.fields.map((f) => f.key)).filter(
      (key) => key !== time,
    )

    if (ordered.length === 0) {
      return (
        <p className="text-xs text-[var(--analytics-text-muted)] m-0">
          No events in this period.
        </p>
      )
    }

    if (variant === 'log') {
      return (
        <div className="h-full overflow-auto">
          <table className="w-full text-xs border-collapse font-mono">
            <tbody className="text-[var(--analytics-text-secondary)]">
              {ordered.map((row, index) => (
                <tr key={index} className="border-b border-[var(--analytics-border)]">
                  <td className="py-1 pr-3 whitespace-nowrap text-[var(--analytics-text-muted)] align-top">
                    {String(row[time] ?? '')}
                  </td>
                  <td className="py-1 text-[var(--analytics-text)]">{describe(row, columns)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    return (
      <div className="h-full overflow-auto">
        <ol className="list-none p-0 m-0">
          {ordered.map((row, index) => (
            <li key={index} className="relative pl-4 pb-3 last:pb-0">
              {/* The rail is what makes a list read as a sequence. */}
              {index < ordered.length - 1 && (
                <span
                  aria-hidden="true"
                  className="absolute left-[3px] top-2 bottom-0 w-px"
                  style={{ background: 'var(--analytics-border)' }}
                />
              )}
              <span
                aria-hidden="true"
                className="absolute left-0 top-1 rounded-full"
                style={{ width: 7, height: 7, background: 'var(--analytics-series-1)' }}
              />
              <p className="text-xs text-[var(--analytics-text)] m-0">{describe(row, columns)}</p>
              <p className="text-xs text-[var(--analytics-text-muted)] m-0 mt-0.5">
                {fieldLabel(dataset, time)}: {String(row[time] ?? '')}
              </p>
            </li>
          ))}
        </ol>
      </div>
    )
  }
}

export const ActivityFeedRenderer = chronologicalRenderer('feed')
export const EventLogRenderer = chronologicalRenderer('log')
