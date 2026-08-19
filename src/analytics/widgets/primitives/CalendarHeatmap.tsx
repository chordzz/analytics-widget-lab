/**
 * Temporal pattern — what is the pattern across days?
 *
 * A contribution grid: one cell per day, a column per week, shaded by value.
 * It answers a question a line chart cannot — *when* within the week or month
 * activity happens — because the weekly cycle becomes an axis instead of noise
 * on a single line.
 *
 * Sequential ramp, one hue light to dark. This encodes magnitude, so a
 * categorical palette or a rainbow would invent distinctions between values
 * that differ only in size.
 */

import { VizFrame } from './shared'
import { formatValue } from '../format'
import { sequentialFor, token } from '../../theme/tokens'
import type { Row, ValueFormat } from '../../data/types'

const DAY_LABELS = ['Mon', '', 'Wed', '', 'Fri', '', '']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export interface CalendarHeatmapProps {
  data: readonly Row[]
  /** Field holding an ISO date, `YYYY-MM-DD`. */
  xKey: string
  /** Measure shading each cell. */
  valueKey: string
  format?: ValueFormat
  height?: number
  className?: string
}

export function CalendarHeatmap({
  data,
  xKey,
  valueKey,
  format = 'number',
  height,
  className,
}: CalendarHeatmapProps) {
  const points = data
    .map((row) => ({ date: String(row[xKey]), value: Number(row[valueKey] ?? 0) }))
    .filter((point) => /^\d{4}-\d{2}-\d{2}$/.test(point.date))
    .sort((a, b) => a.date.localeCompare(b.date))

  if (points.length === 0) return null

  const values = points.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1

  // Monday-first columns: offset the first week so the grid starts on the
  // right weekday rather than always at row zero.
  const first = new Date(`${points[0].date}T00:00:00Z`)
  const firstWeekday = (first.getUTCDay() + 6) % 7

  return (
    <VizFrame height={height} className={className}>
      {({ width, height: plotHeight }) => {
        const labelColumn = 26
        const monthRow = 14
        const weeks = Math.ceil((points.length + firstWeekday) / 7)

        // Size the cell from whichever axis is tighter. Taking height alone
        // overflows a narrow card and clips the most recent weeks — the ones
        // anyone actually wants to see.
        const fromHeight = Math.floor((plotHeight - monthRow) / 7) - 2
        const fromWidth = Math.floor((width - labelColumn) / weeks) - 2
        const cell = Math.max(3, Math.min(14, fromHeight, fromWidth))
        const step = cell + 2
        const gridWidth = weeks * step

        // Right-aligned when the year does not fill the width, so the most
        // recent day sits at the edge where the eye starts.
        const originX = Math.max(labelColumn, width - gridWidth)

        /*
         * Centred vertically.
         *
         * The cell size is nearly always limited by width — 53 columns against
         * 7 rows — so there is usually height left over. Top-aligned, all of it
         * pools under the grid and reads as a card that failed to fill itself.
         * Split evenly it just looks like padding.
         */
        const gridHeight = monthRow + 7 * step
        const originY = Math.max(0, (plotHeight - gridHeight) / 2)

        let lastMonth = -1

        return (
          <svg width={width} height={plotHeight} role="img" aria-label="Calendar heatmap">
            {DAY_LABELS.map((label, index) =>
              label ? (
                <text
                  key={index}
                  x={originX - 6}
                  y={originY + monthRow + index * step + cell - 1}
                  textAnchor="end"
                  style={{ fontSize: 9, fill: token('textMuted') }}
                >
                  {label}
                </text>
              ) : null,
            )}

            {points.map((point, index) => {
              const slot = index + firstWeekday
              const week = Math.floor(slot / 7)
              const weekday = slot % 7
              const date = new Date(`${point.date}T00:00:00Z`)
              const month = date.getUTCMonth()

              // One month label per month, at the week it starts.
              let monthLabel = null
              if (month !== lastMonth && weekday <= 3) {
                lastMonth = month
                monthLabel = (
                  <text
                    x={originX + week * step}
                    y={originY + 9}
                    style={{ fontSize: 9, fill: token('textMuted') }}
                  >
                    {MONTHS[month]}
                  </text>
                )
              }

              return (
                <g key={point.date}>
                  {monthLabel}
                  <rect
                    x={originX + week * step}
                    y={originY + monthRow + weekday * step}
                    width={cell}
                    height={cell}
                    rx={2}
                    fill={sequentialFor((point.value - min) / span)}
                  >
                    <title>{`${point.date}: ${formatValue(point.value, format)}`}</title>
                  </rect>
                </g>
              )
            })}
          </svg>
        )
      }}
    </VizFrame>
  )
}
