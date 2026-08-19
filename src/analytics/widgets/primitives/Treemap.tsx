/**
 * Composition — parts of a whole, as nested rectangles.
 *
 * A treemap beats a pie once there are more slices than a pie can carry, and
 * it keeps small parts visible where a pie turns them into slivers. Same cap
 * and "Other" fold as the donut: past eight the categorical palette would have
 * to cycle.
 *
 * Hand-rolled rather than recharts' Treemap — the squarified layout is thirty
 * lines and doing it here means the labels, the surface gaps and the small-cell
 * behaviour are ours rather than the library's.
 */

import { VizFrame } from './shared'
import { formatValue } from '../format'
import { seriesColor } from '../../theme/tokens'
import type { Row, ValueFormat } from '../../data/types'

const MAX_CELLS = 8

interface Cell {
  label: string
  value: number
  x: number
  y: number
  width: number
  height: number
}

/**
 * Squarified treemap: lay rows along the shorter side, closing a row when
 * adding another cell would make its aspect ratios worse. Keeps cells nearer
 * square, which is what makes areas comparable by eye.
 */
function squarify(
  items: { label: string; value: number }[],
  x: number,
  y: number,
  width: number,
  height: number,
): Cell[] {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  if (total <= 0 || items.length === 0) return []

  const cells: Cell[] = []
  let remaining = [...items]
  let area = { x, y, width, height }
  let remainingValue = total

  while (remaining.length > 0) {
    const vertical = area.width >= area.height
    const side = vertical ? area.height : area.width
    const scale = (vertical ? area.width : area.height) / remainingValue

    // Grow the row while the worst aspect ratio keeps improving.
    const row: typeof remaining = []
    let worst = Infinity

    for (const item of remaining) {
      const candidate = [...row, item]
      const sum = candidate.reduce((s, i) => s + i.value, 0)
      const thickness = sum * scale
      const candidateWorst = Math.max(
        ...candidate.map((i) => {
          const length = (i.value / sum) * side
          return Math.max(thickness / length, length / thickness)
        }),
      )
      if (row.length > 0 && candidateWorst > worst) break
      row.push(item)
      worst = candidateWorst
    }

    const rowValue = row.reduce((s, i) => s + i.value, 0)
    const thickness = rowValue * scale
    let offset = 0

    for (const item of row) {
      const length = (item.value / rowValue) * side
      cells.push(
        vertical
          ? { label: item.label, value: item.value, x: area.x, y: area.y + offset, width: thickness, height: length }
          : { label: item.label, value: item.value, x: area.x + offset, y: area.y, width: length, height: thickness },
      )
      offset += length
    }

    remaining = remaining.slice(row.length)
    remainingValue -= rowValue
    area = vertical
      ? { x: area.x + thickness, y: area.y, width: area.width - thickness, height: area.height }
      : { x: area.x, y: area.y + thickness, width: area.width, height: area.height - thickness }
  }

  return cells
}

export interface TreemapProps {
  data: readonly Row[]
  /** Dimension naming each rectangle. */
  xKey: string
  /** Measure giving each rectangle its area. */
  valueKey: string
  format?: ValueFormat
  height?: number
  className?: string
}

export function Treemap({ data, xKey, valueKey, format = 'number', height, className }: TreemapProps) {
  // The squarify pass already returns no cells for an empty set, but it does so
  // from inside the frame — leaving an empty `<svg>` where the caller expects
  // nothing at all. Same contract as every other primitive: no data, no output.
  if (data.length === 0) return null

  const sorted = [...data]
    .map((row) => ({ label: String(row[xKey]), value: Math.max(0, Number(row[valueKey] ?? 0)) }))
    .sort((a, b) => b.value - a.value)

  const items =
    sorted.length <= MAX_CELLS
      ? sorted
      : [
          ...sorted.slice(0, MAX_CELLS - 1),
          {
            label: 'Other',
            value: sorted.slice(MAX_CELLS - 1).reduce((sum, item) => sum + item.value, 0),
          },
        ]

  const total = items.reduce((sum, item) => sum + item.value, 0)

  return (
    <VizFrame height={height} className={className}>
      {({ width, height: plotHeight }) => {
        const cells = squarify(items, 0, 0, width, plotHeight)

        return (
          <svg width={width} height={plotHeight} role="img" aria-label="Treemap">
            {cells.map((cell, index) => {
              // Only label a cell that can actually hold the text — a clipped
              // label is worse than none, and the tooltip carries the rest.
              const roomy = cell.width > 66 && cell.height > 34

              return (
                <g key={cell.label}>
                  <title>{`${cell.label}: ${formatValue(cell.value, format)}`}</title>
                  <rect
                    x={cell.x}
                    y={cell.y}
                    width={Math.max(0, cell.width - 2)}
                    height={Math.max(0, cell.height - 2)}
                    rx={4}
                    fill={seriesColor(index)}
                  />
                  {roomy && (
                    <>
                      <text
                        x={cell.x + 9}
                        y={cell.y + 20}
                        style={{ fontSize: 12, fontWeight: 600, fill: 'var(--a-text-inverse)' }}
                      >
                        {cell.label}
                      </text>
                      <text
                        x={cell.x + 9}
                        y={cell.y + 36}
                        style={{ fontSize: 11, fill: 'var(--a-text-inverse)', opacity: 0.85 }}
                      >
                        {formatValue(total === 0 ? 0 : cell.value / total, 'percent')}
                      </text>
                    </>
                  )}
                </g>
              )
            })}
          </svg>
        )
      }}
    </VizFrame>
  )
}
