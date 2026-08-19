/**
 * Radial — how does this compare across axes?
 *
 * Every axis is **normalised to the dataset's range for that measure**, which
 * is not cosmetic. Revenue runs to hundreds of thousands and satisfaction to
 * five; plotted raw on a shared radius, satisfaction is a dot at the centre and
 * the shape says nothing. Normalising makes the chart mean "where does this sit
 * relative to the others", which is the only question a radar can answer.
 *
 * The tooltip and axis labels carry the real values, so the normalisation
 * never hides the numbers.
 */

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart as RechartsRadar,
  Tooltip,
} from 'recharts'
import {
  AXIS_TICK,
  GRID_STROKE,
  Legend,
  TOOLTIP_ITEM_STYLE,
  TOOLTIP_STYLE,
  VizFrame,
  colorFor,
  type SeriesSpec,
} from './shared'
import { formatValue } from '../format'
import type { Row, ValueFormat } from '../../data/types'

/** Comparing more than a few shapes on one radar turns it into a scribble. */
const MAX_SHAPES = 3

export interface RadarChartProps {
  data: readonly Row[]
  /** Dimension naming each shape — one polygon per selected entity. */
  xKey: string
  /** Measures forming the axes. Three minimum; a radar with two is a line. */
  series: SeriesSpec[]
  /** Which entities to plot. Defaults to the first few rows. */
  entities?: string[]
  format?: ValueFormat
  showLegend?: boolean
  height?: number
  className?: string
}

export function RadarChart({
  data,
  xKey,
  series,
  entities,
  format = 'number',
  showLegend = true,
  height,
  className,
}: RadarChartProps) {
  // No data draws nothing. Axes and gridlines around an empty set read as a
  // broken chart, and whatever wraps this — a card, a page — is better placed
  // to say why it is empty.
  if (data.length === 0) return null

  const chosen = (entities ?? data.slice(0, MAX_SHAPES).map((row) => String(row[xKey]))).slice(
    0,
    MAX_SHAPES,
  )

  // One extent per measure, taken across the whole dataset rather than the
  // chosen rows — otherwise the shape changes meaning when the selection does.
  const extents = new Map(
    series.map((spec) => {
      const values = data.map((row) => Number(row[spec.key] ?? 0))
      return [spec.key, { min: Math.min(...values), max: Math.max(...values) }]
    }),
  )

  const normalise = (key: string, value: number) => {
    const extent = extents.get(key)
    if (!extent || extent.max === extent.min) return 0.5
    return (value - extent.min) / (extent.max - extent.min)
  }

  // Recharts wants one row per axis, with a column per shape.
  const plotted = series.map((spec) => {
    const point: Record<string, string | number> = { axis: spec.label ?? spec.key }
    for (const entity of chosen) {
      const row = data.find((candidate) => String(candidate[xKey]) === entity)
      const raw = Number(row?.[spec.key] ?? 0)
      point[entity] = Number(normalise(spec.key, raw).toFixed(4))
      point[`${entity}__raw`] = raw
    }
    return point
  })

  const shapes: SeriesSpec[] = chosen.map((entity, index) => ({
    key: entity,
    color: colorFor({ key: entity }, index),
  }))

  return (
    <VizFrame
      height={height}
      className={className}
      legend={showLegend ? <Legend series={shapes} /> : undefined}
    >
      {({ width, height: plotHeight }) => (
        <RechartsRadar
          width={width}
          height={plotHeight}
          data={plotted}
          outerRadius="72%"
          margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        >
          <PolarGrid stroke={GRID_STROKE} />
          <PolarAngleAxis dataKey="axis" tick={AXIS_TICK} />
          {/* The radial scale is normalised, so its ticks would be meaningless. */}
          <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 1]} />

          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            itemStyle={TOOLTIP_ITEM_STYLE}
            formatter={(_value: unknown, name: unknown, entry: unknown) => {
              // Show the real figure, not the normalised one.
              const payload = (entry as { payload?: Record<string, number> })?.payload
              const raw = payload?.[`${String(name)}__raw`]
              return [formatValue(raw, format), String(name)]
            }}
          />

          {chosen.map((entity, index) => (
            <Radar
              key={entity}
              dataKey={entity}
              name={entity}
              stroke={colorFor({ key: entity }, index)}
              fill={colorFor({ key: entity }, index)}
              fillOpacity={chosen.length > 1 ? 0.14 : 0.24}
              strokeWidth={2}
              isAnimationActive={false}
            />
          ))}
        </RechartsRadar>
      )}
    </VizFrame>
  )
}
