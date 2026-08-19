/**
 * Ranking — what is the order?
 *
 * Not a chart. A ranked list reads better as a list, costs no charting library,
 * and stays legible at widths where a bar chart's labels would collide. The bar
 * behind each row is proportional, so the shape of the distribution is still
 * visible at a glance.
 *
 * One hue rather than the categorical palette: rank is magnitude, not identity,
 * and colouring each row differently would imply the rows are different kinds
 * of thing.
 */

import { formatValue } from '../format'
import { token } from '../../theme/tokens'
import type { Row, ValueFormat } from '../../data/types'

export interface RankedListProps {
  data: readonly Row[]
  /** Field naming each entry. */
  xKey: string
  /** Measure to rank by. */
  valueKey: string
  format?: ValueFormat
  /** @default 8 */
  limit?: number
  /** Show movement against the row above. Leaderboard behaviour. */
  showMovement?: boolean
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

export function RankedList({
  data,
  xKey,
  valueKey,
  format = 'number',
  limit = 8,
  showMovement = false,
  height,
  className,
}: RankedListProps) {
  // No data draws nothing. Axes and gridlines around an empty set read as a
  // broken chart, and whatever wraps this — a card, a page — is better placed
  // to say why it is empty.
  if (data.length === 0) return null

  const ranked = [...data]
    .sort((a, b) => Number(b[valueKey] ?? 0) - Number(a[valueKey] ?? 0))
    .slice(0, limit)

  const peak = Math.max(...ranked.map((row) => Math.abs(Number(row[valueKey] ?? 0))), 1)

  return (
    <ol
      className={className}
      style={{ listStyle: 'none', margin: 0, padding: 0, overflow: 'auto', minHeight: 0, height }}
    >
      {ranked.map((row, index) => {
        const value = Number(row[valueKey] ?? 0)
        const previous = index > 0 ? Number(ranked[index - 1][valueKey] ?? 0) : value
        const drop = previous === 0 ? 0 : 1 - value / previous

        return (
          <li key={String(row[xKey] ?? index)} style={{ padding: '6px 0' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 'var(--a-space-2)',
                fontSize: 'var(--a-text-sm)',
              }}
            >
              <span
                className="a-tabular"
                style={{ width: 18, flexShrink: 0, color: token('textMuted') }}
              >
                {index + 1}
              </span>

              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: token('text'),
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {String(row[xKey])}
              </span>

              {showMovement && index > 0 && (
                <span
                  className="a-tabular"
                  style={{ fontSize: 'var(--a-text-xs)', color: token('textMuted') }}
                >
                  −{formatValue(drop, 'percent')}
                </span>
              )}

              {/* Direct label on every row — the relief that lets the bar stay
                  a low-contrast fill rather than shouting. */}
              <span
                className="a-tabular"
                style={{ flexShrink: 0, color: token('text'), fontWeight: 500 }}
              >
                {formatValue(value, format)}
              </span>
            </div>

            <div
              aria-hidden="true"
              style={{
                marginTop: 5,
                height: 4,
                borderRadius: 2,
                background: 'var(--a-series-1)',
                opacity: 0.85,
                width: `${Math.max((Math.abs(value) / peak) * 100, 1.5)}%`,
              }}
            />
          </li>
        )
      })}
    </ol>
  )
}
