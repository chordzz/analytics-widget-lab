/**
 * Ranking & flow — where is the drop-off?
 *
 * The drop-off is the point of a funnel, so it is labelled rather than left to
 * be inferred from the taper. A funnel where you have to eyeball the slope is
 * just a badly-sorted bar chart.
 *
 * One hue, stepped through the sequential ramp. Stages are an ordered sequence,
 * not distinct entities, so the categorical palette would imply a difference in
 * kind that isn't there.
 */

import { VizFrame, truncateToWidth } from './shared'
import { formatValue } from '../format'
import { sequentialFor } from '../../theme/tokens'
import type { Row, ValueFormat } from '../../data/types'

/** Gap between the label column and the bars. */
const LABEL_GAP = 10

/** Stage names sit at this size; the value beneath is a step smaller. */
const LABEL_SIZE = 12

export interface FunnelChartProps {
  data: readonly Row[]
  /** Dimension naming each stage, in order. */
  xKey: string
  /** Measure giving each stage its width. */
  valueKey: string
  format?: ValueFormat
  height?: number
  className?: string
}

export function FunnelChart({
  data,
  xKey,
  valueKey,
  format = 'number',
  height,
  className,
}: FunnelChartProps) {
  const stages = data.map((row) => ({
    label: String(row[xKey]),
    value: Math.max(0, Number(row[valueKey] ?? 0)),
  }))

  if (stages.length === 0) return null

  const top = stages[0].value || 1

  return (
    <VizFrame height={height} className={className}>
      {({ width, height: plotHeight }) => {
        const labelWidth = Math.min(150, Math.max(96, width * 0.28))
        const plotWidth = Math.max(0, width - labelWidth - 8)
        // The label column has a floor, so on a narrow card a long stage name
        // is wider than the space for it and runs off the left edge of the SVG
        // — silently, because nothing clips it. Truncate to what fits; the full
        // name stays in the tooltip.
        const labelBudget = labelWidth - LABEL_GAP
        const bandHeight = plotHeight / stages.length
        const barHeight = Math.max(10, Math.min(30, bandHeight - 12))

        return (
          <svg width={width} height={plotHeight} role="img" aria-label="Funnel">
            {stages.map((stage, index) => {
              const fraction = stage.value / top
              const barWidth = Math.max(2, fraction * plotWidth)
              const y = index * bandHeight
              const centre = y + bandHeight / 2
              // Centred, so the taper reads as a funnel rather than a bar chart.
              const x = labelWidth + (plotWidth - barWidth) / 2

              const previous = index > 0 ? stages[index - 1].value : stage.value
              const drop = previous === 0 ? 0 : 1 - stage.value / previous

              return (
                <g key={stage.label}>
                  <text
                    x={labelWidth - LABEL_GAP}
                    y={centre - 2}
                    textAnchor="end"
                    style={{ fontSize: LABEL_SIZE, fill: 'var(--a-text)' }}
                  >
                    {truncateToWidth(stage.label, labelBudget, LABEL_SIZE)}
                  </text>
                  <text
                    x={labelWidth - LABEL_GAP}
                    y={centre + 12}
                    textAnchor="end"
                    style={{
                      fontSize: 11,
                      fill: 'var(--a-text-muted)',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatValue(stage.value, format)}
                  </text>

                  <rect
                    x={x}
                    y={centre - barHeight / 2}
                    width={barWidth}
                    height={barHeight}
                    rx={3}
                    fill={sequentialFor(1 - index / Math.max(1, stages.length - 1))}
                  />

                  {/*
                   * The drop-off sits on the bar it describes.
                   *
                   * It used to float in the gap above, at the top of the band —
                   * equidistant from the bar above and the bar below, and so
                   * attached to neither. Centred on its own bar and immediately
                   * to the right of it, there is nothing to work out: this stage
                   * lost this much. The taper guarantees the room, because the
                   * space to the right grows exactly as the bars narrow.
                   */}
                  {index > 0 && drop > 0.001 && (
                    <text
                      x={Math.min(x + barWidth + 8, labelWidth + plotWidth)}
                      y={centre + 4}
                      textAnchor="start"
                      style={{
                        fontSize: 10,
                        // Muted, not critical. A funnel that did not lose anyone
                        // between stages would not be a funnel — this is the
                        // subject of the chart, not an alarm about it, and the
                        // status colours are reserved for actual status.
                        fill: 'var(--a-text-muted)',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      −{formatValue(drop, 'percent')}
                    </text>
                  )}

                  <title>
                    {`${stage.label}: ${formatValue(stage.value, format)}` +
                      (index > 0 ? ` · ${formatValue(drop, 'percent')} lost from ${stages[index - 1].label}` : '')}
                  </title>
                </g>
              )
            })}
          </svg>
        )
      }}
    </VizFrame>
  )
}
