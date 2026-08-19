/**
 * Composition — parts of a whole.
 *
 * Pie and donut are the same component; the donut simply has a hole, which is
 * worth having because the middle can carry the total. A 2px surface ring
 * separates adjacent slices so boundaries survive similar neighbouring hues.
 *
 * Caps at eight slices and folds the tail into "Other". Past eight the
 * categorical palette would have to cycle, and two different things would take
 * the same colour — worse than an honest "Other".
 */

import { Cell, Pie, PieChart, Tooltip } from 'recharts'
import { TOOLTIP_ITEM_STYLE, TOOLTIP_STYLE, VizFrame } from './shared'
import { formatValue } from '../format'
import { seriesColor, token } from '../../theme/tokens'
import type { Row, ValueFormat } from '../../data/types'

const MAX_SLICES = 8

export interface DonutChartProps {
  data: readonly Row[]
  /** The Dimension naming each slice. */
  xKey: string
  /** The Measure giving each slice its size. */
  valueKey: string
  /** @default 'donut' */
  variant?: 'pie' | 'donut'
  format?: ValueFormat
  /** Shown in the hole. Donut only. */
  centerLabel?: string
  showLegend?: boolean
  height?: number
  className?: string
}

export function DonutChart({
  data,
  xKey,
  valueKey,
  variant = 'donut',
  format = 'number',
  centerLabel,
  showLegend = true,
  height,
  className,
}: DonutChartProps) {
  // No data draws nothing. Axes and gridlines around an empty set read as a
  // broken chart, and whatever wraps this — a card, a page — is better placed
  // to say why it is empty.
  if (data.length === 0) return null

  const sorted = [...data].sort((a, b) => Number(b[valueKey] ?? 0) - Number(a[valueKey] ?? 0))

  const slices =
    sorted.length <= MAX_SLICES
      ? sorted
      : [
          ...sorted.slice(0, MAX_SLICES - 1),
          {
            [xKey]: 'Other',
            [valueKey]: sorted
              .slice(MAX_SLICES - 1)
              .reduce((sum, row) => sum + Number(row[valueKey] ?? 0), 0),
          } as Row,
        ]

  const total = slices.reduce((sum, row) => sum + Number(row[valueKey] ?? 0), 0)

  const legend = showLegend ? (
    <ul className="a-legend" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {slices.map((row, index) => (
        <li key={String(row[xKey])} className="a-legend__item">
          <span className="a-legend__swatch" style={{ background: seriesColor(index) }} />
          {String(row[xKey])}
          <span className="a-tabular" style={{ color: token('textMuted') }}>
            {formatValue(total === 0 ? 0 : Number(row[valueKey] ?? 0) / total, 'percent')}
          </span>
        </li>
      ))}
    </ul>
  ) : undefined

  return (
    <VizFrame height={height} className={className} legend={legend}>
      {({ width, height: plotHeight }) => (
        <div style={{ position: 'relative', width, height: plotHeight }}>
          <PieChart width={width} height={plotHeight}>
              <Pie
                data={slices as object[]}
                dataKey={valueKey}
                nameKey={xKey}
                innerRadius={variant === 'donut' ? '58%' : 0}
                outerRadius="86%"
                paddingAngle={0}
                stroke="var(--a-surface)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {slices.map((_, index) => (
                  <Cell key={index} fill={seriesColor(index)} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                itemStyle={TOOLTIP_ITEM_STYLE}
                formatter={(value: unknown, name: unknown) => [
                  `${formatValue(value, format)} · ${formatValue(
                    total === 0 ? 0 : Number(value) / total,
                    'percent',
                  )}`,
                  String(name),
                ]}
              />
          </PieChart>

          {variant === 'donut' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'grid',
                placeItems: 'center',
                pointerEvents: 'none',
                textAlign: 'center',
              }}
            >
              <div>
                <div
                  className="a-tabular"
                  style={{ fontSize: 'var(--a-text-lg)', fontWeight: 600, color: token('text') }}
                >
                  {formatValue(total, format)}
                </div>
                <div style={{ fontSize: 'var(--a-text-xs)', color: token('textSecondary') }}>
                  {centerLabel ?? 'Total'}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </VizFrame>
  )
}
