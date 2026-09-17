/**
 * Tabular — side-by-side entities across fixed metrics.
 *
 * The transpose of the data table, and the transpose is the whole point. A data
 * table puts records down the page and asks "what happened?"; this puts a
 * handful of entities across the top and asks "which of these is better?" —
 * three regions, five metrics, and the comparison read across a row rather than
 * assembled by eye down a column.
 *
 * So the metric is the row and the entity is the column, which is why this is
 * not a `DataTable` with different props. Rows are a fixed short list the Author
 * chose; columns grow with the data and are capped, because a comparison across
 * forty entities is not a comparison.
 */

import { formatValue } from '../format'
import { token } from '../../theme/tokens'
import type { Field, Row } from '../../data/types'

export interface ComparisonTableProps {
  data: readonly Row[]
  /** Dimension naming each entity — becomes the columns. */
  entityKey: string
  /** Measures compared — become the rows, in this order. */
  metrics: Field[]
  /**
   * Most entities worth putting side by side. Beyond this the table stops being
   * readable across and the extras are reported rather than silently dropped.
   *
   * @default 8
   */
  limit?: number
  /**
   * Mark the leading entity per metric.
   *
   * Off by default and deliberately so: "best" is not a property of a number.
   * Highest is best for revenue and worst for latency, and nothing in the
   * declaration says which — see the note on `higherIsBetter`.
   */
  showLeaders?: boolean
  /**
   * Per-metric direction, keyed by Field key. Only consulted when `showLeaders`
   * is on. A metric absent from this map gets no mark rather than an assumed
   * direction.
   */
  higherIsBetter?: Readonly<Record<string, boolean>>
  height?: number
  className?: string
}

export function ComparisonTable({
  data,
  entityKey,
  metrics,
  limit = 8,
  showLeaders = false,
  higherIsBetter,
  height,
  className,
}: ComparisonTableProps) {
  if (data.length === 0 || metrics.length === 0) return null

  /*
   * One column per entity. A Dataset grained finer than the entity sends
   * several rows per name — four daily rows for one corridor — and taking the
   * first would silently show one day as the corridor. Numeric metrics are
   * summed across them, which is the only combination the declaration
   * sanctions; non-numeric ones keep the first value, since summing text is
   * meaningless and averaging it impossible.
   */
  const byEntity = new Map<string, Row>()
  for (const row of data) {
    const name = String(row[entityKey] ?? '')
    if (name === '') continue

    const existing = byEntity.get(name)
    if (!existing) {
      byEntity.set(name, { ...row })
      continue
    }
    for (const metric of metrics) {
      const left = existing[metric.key]
      const right = row[metric.key]
      if (typeof left === 'number' && typeof right === 'number') {
        existing[metric.key] = left + right
      }
    }
  }

  const entities = [...byEntity.entries()].slice(0, limit)
  const hidden = byEntity.size - entities.length

  const leaderFor = (metric: Field): string | undefined => {
    if (!showLeaders) return undefined
    const direction = higherIsBetter?.[metric.key]
    if (direction === undefined) return undefined

    let best: { name: string; value: number } | undefined
    for (const [name, row] of entities) {
      const value = row[metric.key]
      if (typeof value !== 'number' || !Number.isFinite(value)) continue
      if (
        best === undefined ||
        (direction ? value > best.value : value < best.value)
      ) {
        best = { name, value }
      }
    }
    return best?.name
  }

  return (
    <div
      className={className}
      style={{
        height: height === undefined ? undefined : `${String(height)}px`,
        overflow: 'auto',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: 'var(--a-text-xs)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <thead>
          <tr>
            <th
              scope="col"
              style={{
                position: 'sticky',
                top: 0,
                textAlign: 'left',
                padding: '6px 10px 6px 0',
                background: 'var(--a-surface)',
                color: token('textMuted'),
                fontWeight: 500,
                borderBottom: '1px solid var(--a-border)',
              }}
            >
              Metric
            </th>
            {entities.map(([name]) => (
              <th
                key={name}
                scope="col"
                style={{
                  position: 'sticky',
                  top: 0,
                  textAlign: 'right',
                  padding: '6px 10px',
                  background: 'var(--a-surface)',
                  color: token('text'),
                  fontWeight: 600,
                  borderBottom: '1px solid var(--a-border)',
                  whiteSpace: 'nowrap',
                }}
              >
                {name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((metric) => {
            const leader = leaderFor(metric)
            return (
              <tr key={metric.key}>
                <th
                  scope="row"
                  style={{
                    textAlign: 'left',
                    padding: '7px 10px 7px 0',
                    color: token('textMuted'),
                    fontWeight: 400,
                    borderBottom: '1px solid var(--a-border)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {metric.label}
                </th>
                {entities.map(([name, row]) => {
                  const leading = leader === name
                  return (
                    <td
                      key={name}
                      style={{
                        textAlign: 'right',
                        padding: '7px 10px',
                        color: leading ? 'var(--a-series-1)' : token('text'),
                        fontWeight: leading ? 600 : 400,
                        borderBottom: '1px solid var(--a-border)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {formatValue(row[metric.key], metric.format)}
                      {/* The colour is not the only carrier — it fails for a
                          colour-blind reader and in a greyscale print. */}
                      {leading && <span aria-label=" (leading)"> ▲</span>}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>

      {hidden > 0 && (
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 'var(--a-text-xs)',
            color: token('textMuted'),
          }}
        >
          {`${String(hidden)} more ${hidden === 1 ? 'entity' : 'entities'} not shown — a comparison ` +
            `across ${String(byEntity.size)} does not read side by side.`}
        </p>
      )}
    </div>
  )
}
