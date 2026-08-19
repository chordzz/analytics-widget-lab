/**
 * Correlation — do these move together?
 *
 * Scatter and bubble are one component; the bubble simply binds a third
 * measure to point area. Two measures on two axes is the one chart form where
 * a second scale is legitimate — they are different quantities by definition,
 * not the same quantity twice.
 */

import {
  CartesianGrid,
  Scatter,
  ScatterChart as RechartsScatter,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import {
  AXIS_LINE,
  AXIS_TICK,
  GRID_STROKE,
  Legend,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_LABEL_STYLE,
  TOOLTIP_STYLE,
  VizFrame,
  colorFor,
  seriesLabel,
  type SeriesSpec,
} from './shared'
import { formatAxis, formatValue } from '../format'
import type { Row, ValueFormat } from '../../data/types'

/**
 * Scatter and bubble put every pair of series on screen at once, so the
 * palette's all-pairs limit applies rather than the adjacent-pairs one. Past
 * three, hues that are distinguishable side by side stop being distinguishable
 * scattered among each other.
 */
const MAX_SCATTER_SERIES = 3

export interface ScatterChartProps {
  data: readonly Row[]
  /** Measure on the horizontal axis. */
  xKey: string
  /** Measure on the vertical axis. */
  yKey: string
  /** Measure bound to point area. Bubble only. */
  sizeKey?: string
  /** Splits points into series. Omit for one undifferentiated cloud. */
  groupKey?: string
  xFormat?: ValueFormat
  yFormat?: ValueFormat
  showGrid?: boolean
  showLegend?: boolean
  height?: number
  className?: string
}

export function ScatterChart({
  data,
  xKey,
  yKey,
  sizeKey,
  groupKey,
  xFormat = 'number',
  yFormat = 'number',
  showGrid = true,
  showLegend = true,
  height,
  className,
}: ScatterChartProps) {
  // No data draws nothing. Axes and gridlines around an empty set read as a
  // broken chart, and whatever wraps this — a card, a page — is better placed
  // to say why it is empty.
  if (data.length === 0) return null

  const groups = groupKey
    ? [...new Set(data.map((row) => String(row[groupKey])))].slice(0, MAX_SCATTER_SERIES)
    : [null]

  const series: SeriesSpec[] = groups.map((group, index) => ({
    key: group ?? yKey,
    label: group ?? undefined,
    color: colorFor({ key: group ?? yKey }, index),
  }))

  return (
    <VizFrame
      height={height}
      className={className}
      legend={showLegend && groupKey ? <Legend series={series} /> : undefined}
    >
      {({ width, height: plotHeight }) => (
        <RechartsScatter
          width={width}
          height={plotHeight}
          margin={{ top: 8, right: 10, bottom: 0, left: 0 }}
        >
          {showGrid && <CartesianGrid stroke={GRID_STROKE} strokeDasharray="2 4" />}

          <XAxis
            type="number"
            dataKey={xKey}
            name={xKey}
            tick={AXIS_TICK}
            axisLine={AXIS_LINE}
            tickLine={false}
            tickMargin={8}
            tickFormatter={(value) => formatAxis(value, xFormat)}
          />
          <YAxis
            type="number"
            dataKey={yKey}
            name={yKey}
            width={46}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
            tickFormatter={(value) => formatAxis(value, yFormat)}
          />
          {sizeKey && <ZAxis type="number" dataKey={sizeKey} range={[36, 420]} />}

          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelStyle={TOOLTIP_LABEL_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            cursor={{ strokeDasharray: '2 4', stroke: GRID_STROKE }}
            formatter={(value: unknown, name: unknown) => [
              formatValue(value, String(name) === yKey ? yFormat : xFormat),
              String(name),
            ]}
            labelFormatter={() => ''}
          />

          {groups.map((group, index) => (
            <Scatter
              key={group ?? 'all'}
              name={group ?? seriesLabel(series[index])}
              data={
                (group === null
                  ? data
                  : data.filter((row) => String(row[groupKey!]) === group)) as object[]
              }
              fill={colorFor({ key: group ?? yKey }, index)}
              fillOpacity={0.75}
              // A 2px surface ring keeps overlapping points readable as
              // separate marks rather than one dark blob.
              stroke="var(--a-surface)"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          ))}
        </RechartsScatter>
      )}
    </VizFrame>
  )
}

export function BubbleChart(props: ScatterChartProps) {
  return <ScatterChart {...props} />
}
