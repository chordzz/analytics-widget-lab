/**
 * Temporal pattern — how do cohorts behave over elapsed time?
 *
 * Cohorts down, periods across. The triangular shape is correct and not a
 * rendering bug: a cohort that started three months ago has three months of
 * history, so later columns are genuinely empty rather than zero. Drawing them
 * as zero would read as total churn.
 *
 * Sequential ramp again — retention is magnitude. Cells carry their value as
 * text as well as shade, which is the relief that lets the lighter steps stay
 * light rather than being darkened for contrast they do not need.
 */

import { formatValue } from '../format'
import { sequentialFor, token } from '../../theme/tokens'
import type { Row, ValueFormat } from '../../data/types'

export interface CohortGridProps {
  data: readonly Row[]
  /** Field naming each cohort — one row per distinct value. */
  cohortKey: string
  /** Field holding the elapsed period index — one column per distinct value. */
  periodKey: string
  /** Measure filling each cell. */
  valueKey: string
  format?: ValueFormat
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

export function CohortGrid({
  data,
  cohortKey,
  periodKey,
  valueKey,
  format = 'percent',
  height,
  className,
}: CohortGridProps) {
  // No data draws nothing. Axes and gridlines around an empty set read as a
  // broken chart, and whatever wraps this — a card, a page — is better placed
  // to say why it is empty.
  if (data.length === 0) return null

  const cohorts = [...new Set(data.map((row) => String(row[cohortKey])))]
  const periods = [...new Set(data.map((row) => Number(row[periodKey] ?? 0)))].sort((a, b) => a - b)

  const cell = new Map(
    data.map((row) => [`${row[cohortKey]}|${row[periodKey]}`, Number(row[valueKey] ?? 0)]),
  )

  const values = [...cell.values()]
  const max = Math.max(...values, 0) || 1

  return (
    <div className={className} style={{ overflow: 'auto', minHeight: 0, height }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 2, fontSize: 'var(--a-text-xs)' }}>
        <thead>
          <tr>
            <th
              style={{
                position: 'sticky',
                left: 0,
                background: 'var(--a-surface)',
                textAlign: 'left',
                fontWeight: 500,
                color: token('textMuted'),
                padding: '0 8px 4px 0',
              }}
            >
              Cohort
            </th>
            {periods.map((period) => (
              <th
                key={period}
                style={{
                  fontWeight: 500,
                  color: token('textMuted'),
                  padding: '0 0 4px',
                  minWidth: 38,
                }}
              >
                {period === 0 ? 'M0' : `M${period}`}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {cohorts.map((cohort) => (
            <tr key={cohort}>
              <th
                scope="row"
                style={{
                  position: 'sticky',
                  left: 0,
                  background: 'var(--a-surface)',
                  textAlign: 'left',
                  fontWeight: 400,
                  color: token('text'),
                  padding: '0 8px 0 0',
                  whiteSpace: 'nowrap',
                }}
              >
                {cohort}
              </th>

              {periods.map((period) => {
                const value = cell.get(`${cohort}|${period}`)

                // Absent, not zero — this cohort has not lived that long yet.
                if (value === undefined) {
                  return <td key={period} style={{ padding: 0 }} />
                }

                const intensity = value / max
                return (
                  <td key={period} style={{ padding: 0 }}>
                    <div
                      className="a-tabular"
                      title={`${cohort} · M${period}: ${formatValue(value, format)}`}
                      style={{
                        background: sequentialFor(intensity),
                        // Ink flips once the shade is dark enough to need it.
                        color: intensity > 0.55 ? 'var(--a-text-inverse)' : 'var(--a-text)',
                        borderRadius: 3,
                        padding: '5px 4px',
                        textAlign: 'center',
                        minWidth: 38,
                      }}
                    >
                      {formatValue(value, format)}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
