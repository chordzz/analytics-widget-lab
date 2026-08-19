/**
 * Trend — change over time.
 *
 * One component for line, area, spline and step: they differ only in the curve
 * type and whether the area beneath is filled. Four separate components would
 * be four places to fix the same axis bug.
 */

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  AXIS_LINE,
  AXIS_TICK,
  VizFrame,
  GRID_STROKE,
  Legend,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
  colorFor,
  seriesLabel,
  type ChartProps,
} from './shared'
import { formatAxis, formatTimeLabel, formatValue } from '../format'

export type TrendVariant = 'line' | 'area' | 'spline' | 'step'

export interface TrendChartProps extends ChartProps {
  /** @default 'line' */
  variant?: TrendVariant
}

const CURVE = {
  line: 'linear',
  area: 'monotone',
  spline: 'monotone',
  step: 'stepAfter',
} as const

export function TrendChart({
  data,
  xKey,
  series,
  variant = 'line',
  format = 'number',
  showGrid = true,
  showLegend = true,
  height,
  className,
}: TrendChartProps) {
  // No data draws nothing. Axes and gridlines around an empty set read as a
  // broken chart, and whatever wraps this — a card, a page — is better placed
  // to say why it is empty.
  if (data.length === 0) return null

  const filled = variant === 'area'
  const curve = CURVE[variant]

  return (
    <VizFrame
      height={height}
      className={className}
      legend={showLegend ? <Legend series={series} /> : undefined}
    >
      {({ width, height: plotHeight }) => (
          <ComposedChart width={width} height={plotHeight} data={data as object[]} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            {showGrid && <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" vertical={false} />}

            <XAxis
              dataKey={xKey}
              tick={AXIS_TICK}
              axisLine={AXIS_LINE}
              tickLine={false}
              tickMargin={8}
              minTickGap={28}
              tickFormatter={formatTimeLabel}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={46}
              tickFormatter={(value) => formatAxis(value, format)}
            />

            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              cursor={{ stroke: GRID_STROKE, strokeWidth: 1 }}
              labelFormatter={formatTimeLabel}
              formatter={(value: unknown, name: unknown) => [
                formatValue(value, format),
                String(name),
              ]}
            />

            {series.map((spec, index) => {
              const colour = colorFor(spec, index)
              const shared = {
                dataKey: spec.key,
                name: seriesLabel(spec),
                stroke: colour,
                strokeWidth: 2,
                dot: false,
                activeDot: { r: 4, strokeWidth: 0 },
                isAnimationActive: false,
                type: curve,
              } as const

              // Area only makes sense for a single series — stacked fills of
              // several measures hide the ones behind. Extra series stay lines.
              return filled && index === 0 ? (
                <Area key={spec.key} {...shared} fill={colour} fillOpacity={0.12} />
              ) : (
                <Line key={spec.key} {...shared} />
              )
            })}
          </ComposedChart>
      )}
    </VizFrame>
  )
}

/**
 * A trend stripped to its line — no axes, no grid, no interaction.
 * For embedding inside a stat tile, where the shape is the point and the
 * numbers come from the tile itself.
 */
export function Sparkline({
  data,
  seriesKey,
  color,
  height = 32,
}: {
  data: readonly Record<string, unknown>[]
  seriesKey: string
  color?: string
  height?: number
}) {
  return (
    <div style={{ height, minHeight: height }} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data as object[]} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <Area
            type="monotone"
            dataKey={seriesKey}
            stroke={color ?? 'var(--a-series-1)'}
            strokeWidth={1.75}
            fill={color ?? 'var(--a-series-1)'}
            fillOpacity={0.14}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
