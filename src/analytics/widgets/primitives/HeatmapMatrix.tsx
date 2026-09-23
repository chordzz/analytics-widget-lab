/**
 * Correlation — pairwise Measure relationships as colour intensity.
 *
 * A scatter plot answers "do these two move together?" for one pair. With six
 * Measures there are fifteen pairs, and fifteen scatter plots is not an answer.
 * The matrix trades the detail of each pair for the ability to see all of them
 * at once, which is how you find the pair worth plotting properly.
 *
 * Two things it deliberately does not do. It never claims causation — the
 * caption says "move together", not "drives". And it does not hide a weak
 * correlation behind a strong colour: the scale is fixed at ±1 rather than
 * normalised to whatever the strongest pair happens to be, so a matrix of
 * nothing-much looks like nothing-much instead of being stretched into a
 * pattern.
 */

import { VizFrame, truncateToWidth } from './shared'
import { token } from '../../theme/tokens'
import type { Field, Row } from '../../data/types'

/**
 * Pearson's r over the rows where *both* Measures are present.
 *
 * Pairwise rather than listwise: dropping every row missing any Measure would
 * let one sparse column decide the sample for all fifteen pairs. Returns
 * undefined rather than a number when it cannot be computed — fewer than three
 * shared points, or a Measure that never varies (a constant has no correlation
 * with anything, and the formula divides by its zero deviation).
 */
export function correlation(
  rows: readonly Row[],
  a: string,
  b: string,
): number | undefined {
  const pairs: [number, number][] = []
  for (const row of rows) {
    const left = row[a]
    const right = row[b]
    if (typeof left === 'number' && Number.isFinite(left) &&
        typeof right === 'number' && Number.isFinite(right)) {
      pairs.push([left, right])
    }
  }

  if (pairs.length < 3) return undefined

  const n = pairs.length
  const meanA = pairs.reduce((sum, [x]) => sum + x, 0) / n
  const meanB = pairs.reduce((sum, [, y]) => sum + y, 0) / n

  let covariance = 0
  let varianceA = 0
  let varianceB = 0
  for (const [x, y] of pairs) {
    const dx = x - meanA
    const dy = y - meanB
    covariance += dx * dy
    varianceA += dx * dx
    varianceB += dy * dy
  }

  const denominator = Math.sqrt(varianceA * varianceB)
  if (denominator === 0) return undefined

  // Floating-point error can push a perfect correlation a hair past 1, which
  // would then colour off the end of the scale.
  return Math.max(-1, Math.min(1, covariance / denominator))
}

export interface HeatmapMatrixProps {
  data: readonly Row[]
  /** The Measures to correlate, in display order. */
  measures: Field[]
  height?: number
  className?: string
}

/** Blue for together, amber for opposed, and the surface colour for neither. */
function cellFill(r: number | undefined): string {
  if (r === undefined) return 'var(--a-surface-sunken)'
  const strength = Math.abs(r)
  const hue = r >= 0 ? 'var(--a-series-1)' : 'var(--a-series-3)'
  return `color-mix(in srgb, ${hue} ${String(Math.round(strength * 100))}%, var(--a-surface))`
}

export function HeatmapMatrix({ data, measures, height, className }: HeatmapMatrixProps) {
  if (measures.length < 2 || data.length === 0) return null

  const cells = measures.map((down) =>
    measures.map((across) =>
      down.key === across.key ? 1 : correlation(data, down.key, across.key),
    ),
  )

  return (
    <VizFrame height={height} className={className}>
      {({ width, height: plotHeight }) => {
        /*
         * The row labels need real width or they truncate to nothing, and the
         * cells need to stay square-ish or the matrix reads as a bar chart.
         * The gutter takes a third of the width at most, and the grid takes
         * whichever of the two remaining dimensions is smaller.
         */
        const gutter = Math.min(width / 3, 96)
        const headerHeight = 18
        const grid = Math.min(width - gutter, plotHeight - headerHeight)
        const cell = grid / measures.length
        if (cell <= 0) return null

        /*
         * The columns are numbered, not named.
         *
         * Naming them was the obvious thing and it does not fit: a cell is
         * around 36px in a third-width card, and five Measure names truncated
         * to that width came out as "R…", "", "R…", "S…", "S…" — two pairs
         * indistinguishable and one label gone entirely. Wider truncation
         * budgets only moved the problem, because the headings then collided
         * with each other and the last ran off the card.
         *
         * The matrix is symmetric, so column *i* is row *i*. Numbering the
         * columns and prefixing the same number to each row name says that
         * exactly, in one character, at any card size — the convention a
         * printed correlation table has used for as long as there have been
         * printed correlation tables. Full names stay in the gutter, where
         * there is room for them, and in every cell's tooltip.
         */
        const LABEL_SIZE = 10
        const rowLabel = (label: string, index: number) =>
          truncateToWidth(`${String(index + 1)} ${label}`, gutter - 10, LABEL_SIZE)

        return (
          <svg
            width={width}
            height={plotHeight}
            role="img"
            aria-label="Correlation matrix"
          >
            {measures.map((across, column) => (
              <text
                key={across.key}
                x={gutter + column * cell + cell / 2}
                y={headerHeight - 6}
                textAnchor="middle"
                style={{ fontSize: LABEL_SIZE, fill: 'var(--a-axis)' }}
              >
                {String(column + 1)}
              </text>
            ))}

            {measures.map((down, row) => (
              <g key={down.key}>
                <text
                  x={gutter - 6}
                  y={headerHeight + row * cell + cell / 2 + 3}
                  textAnchor="end"
                  style={{ fontSize: LABEL_SIZE, fill: 'var(--a-axis)' }}
                >
                  {rowLabel(down.label, row)}
                </text>

                {measures.map((across, column) => {
                  const r = cells[row][column]
                  const diagonal = row === column
                  return (
                    <g key={across.key}>
                      <title>
                        {diagonal
                          ? `${down.label} against itself`
                          : r === undefined
                            ? `${down.label} and ${across.label} — too few shared records to say`
                            : `${down.label} and ${across.label} — r ${r.toFixed(2)}`}
                      </title>
                      <rect
                        x={gutter + column * cell}
                        y={headerHeight + row * cell}
                        width={Math.max(0, cell - 2)}
                        height={Math.max(0, cell - 2)}
                        rx={2}
                        fill={diagonal ? 'var(--a-surface-sunken)' : cellFill(r)}
                        stroke="var(--a-border)"
                        strokeWidth={0.5}
                      />
                      {/* The number as well as the colour. Colour alone is
                          unreadable for a colour-blind viewer and imprecise for
                          everyone — and 0.61 versus 0.72 is exactly the
                          distinction the chart is asked to make. */}
                      {!diagonal && cell >= 34 && (
                        <text
                          x={gutter + column * cell + (cell - 2) / 2}
                          y={headerHeight + row * cell + (cell - 2) / 2 + 3}
                          textAnchor="middle"
                          style={{
                            fontSize: 9,
                            fill: token('text'),
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {r === undefined ? '—' : r.toFixed(2)}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            ))}
          </svg>
        )
      }}
    </VizFrame>
  )
}
