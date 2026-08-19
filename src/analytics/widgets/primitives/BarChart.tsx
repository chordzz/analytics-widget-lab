/**
 * Categorical comparison — how categories compare.
 *
 * Vertical, horizontal, grouped and stacked are one component: they differ in
 * axis orientation and whether series share a stack. A 2px surface-coloured gap
 * separates stacked segments and adjacent bars, so boundaries read without
 * relying on the colours being different enough.
 */

import {
  Bar,
  BarChart as RechartsBar,
  CartesianGrid,
  Cell,
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
  measureText,
  seriesLabel,
  truncateToWidth,
  type ChartProps,
} from './shared'
import { formatAxis, formatValue } from '../format'
import { seriesColor } from '../../theme/tokens'

export type BarVariant = 'vertical' | 'horizontal' | 'grouped' | 'stacked'

export interface BarChartProps extends ChartProps {
  /** @default 'vertical' */
  variant?: BarVariant
  /**
   * Colour each bar from the categorical palette rather than by series.
   * Only legitimate for a single series, where the category *is* the identity.
   */
  colorByCategory?: boolean
}

/**
 * Category labels tilt only when they have to.
 *
 * Horizontal is easier to read, so it is the default and stays the default
 * whenever the names fit their band. They frequently do not: six regions in a
 * quarter-width card leave a 42px band for names measuring up to 76px, and
 * recharts happily draws them straight through each other.
 *
 * The two obvious escapes are both bad. Dropping alternate ticks hides
 * categories. Truncating to the band gives "West Af…" and "East Af…", which is
 * worse than overlapping — the label exists to identify the bar, and a
 * truncation that collides two names has destroyed the only thing it does.
 *
 * Tilting keeps every name whole. The geometry is forgiving: parallel labels
 * offset by one band sit `band · sin(angle)` apart perpendicular to their
 * baseline, so at 30° a 42px band gives 21px of clearance for an 11px line —
 * they cannot collide with each other however long they get. Length only
 * decides how much height the axis needs, which is what `TILT` bounds.
 */
const TILT = {
  angle: -30,
  /** sin(30°) — how much of a label's length becomes axis height. */
  rise: 0.5,
  /** Never surrender more than this share of the plot to the axis. */
  maxShare: 0.32,
  size: 11,
} as const

export interface CategoryAxisLayout {
  /** Whether labels are drawn at an angle rather than flat. */
  tilted: boolean
  /** Height to reserve for the axis, in pixels. */
  height: number
  /** Widest a single label may be before it is truncated. */
  budget: number
}

/**
 * Decide how the bottom category axis should present its labels.
 *
 * Pure geometry, exported so the rule can be tested without a browser — the
 * interesting cases are a plot too narrow to lay labels flat and a plot so short
 * that even tilted ones have to give way, and neither is convenient to stage by
 * hand at a specific pixel width.
 */
export function categoryAxisLayout(
  labelWidths: readonly number[],
  plotWidth: number,
  plotHeight: number,
): CategoryAxisLayout {
  const band = plotWidth / Math.max(1, labelWidths.length)
  const widest = labelWidths.reduce((most, width) => Math.max(most, width), 0)

  // 8px of breathing room, or neighbours touch at exactly the fitting width.
  if (widest + 8 <= band) return { tilted: false, height: 24, budget: band }

  const ceiling = Math.max(28, plotHeight * TILT.maxShare)
  const budget = ceiling / TILT.rise
  const rise = Math.min(widest, budget) * TILT.rise
  /*
   * `rise` is how far the *baseline* drops. The glyphs hang below it, and the
   * tick's own offset from the axis sits underneath that — together about
   * twenty pixels that a baseline calculation does not see. Measured: without
   * this, the longest label overhangs the frame by three pixels.
   */
  return { tilted: true, height: Math.ceil(rise) + 20, budget }
}

function AngledTick({
  x,
  y,
  payload,
  budget,
}: {
  x?: number
  y?: number
  payload?: { value?: unknown }
  budget: number
}) {
  const label = String(payload?.value ?? '')
  return (
    <text
      x={x}
      y={y}
      dy={10}
      textAnchor="end"
      transform={`rotate(${TILT.angle}, ${x}, ${y})`}
      style={{ fontSize: TILT.size, fill: 'var(--a-axis)' }}
    >
      {truncateToWidth(label, budget, TILT.size)}
    </text>
  )
}

export function BarChart({
  data,
  xKey,
  series,
  variant = 'vertical',
  format = 'number',
  showGrid = true,
  showLegend = true,
  colorByCategory = false,
  height,
  className,
}: BarChartProps) {
  // No data draws nothing. Axes and gridlines around an empty set read as a
  // broken chart, and whatever wraps this — a card, a page — is better placed
  // to say why it is empty.
  if (data.length === 0) return null

  const stacked = variant === 'stacked'
  // Recharts calls bars-running-sideways `layout="vertical"`, which is the
  // opposite of what the visualisation is called.
  const sideways = variant === 'horizontal'
  const perCategory = colorByCategory && series.length === 1

  const categoryAxis = {
    dataKey: xKey,
    tick: AXIS_TICK,
    axisLine: AXIS_LINE,
    tickLine: false,
    tickMargin: 8,
    // Every category gets a label. Left to itself recharts drops alternate
    // ticks when they crowd, which hides categories rather than shrinking them.
    interval: 0 as const,
  } as const

  const labelWidths = data.map((row) => measureText(String(row[xKey] ?? ''), TILT.size))

  const valueAxis = {
    tick: AXIS_TICK,
    axisLine: false,
    tickLine: false,
    tickFormatter: (value: unknown) => formatAxis(value, format),
  } as const

  return (
    <VizFrame
      height={height}
      className={className}
      legend={showLegend && !perCategory ? <Legend series={series} /> : undefined}
    >
      {({ width, height: plotHeight }) => {
        // Mirrors the space recharts gives the plot: the value axis on the left
        // and the chart's own right margin.
        const axis = categoryAxisLayout(labelWidths, Math.max(0, width - 46 - 8), plotHeight)

        return (
          <RechartsBar
            width={width}
            height={plotHeight}
            data={data as object[]}
            layout={sideways ? 'vertical' : 'horizontal'}
            margin={{ top: 6, right: 8, bottom: 0, left: 0 }}
            barGap={2}
            barCategoryGap="22%"
          >
            {showGrid && (
              <CartesianGrid
                stroke={GRID_STROKE}
                strokeDasharray="2 4"
                vertical={sideways}
                horizontal={!sideways}
              />
            )}

            {sideways ? (
              <>
                <XAxis type="number" {...valueAxis} />
                <YAxis type="category" width={110} {...categoryAxis} />
              </>
            ) : (
              <>
                <XAxis
                  type="category"
                  {...categoryAxis}
                  height={axis.height}
                  {...(axis.tilted
                    ? { tick: <AngledTick budget={axis.budget} />, tickMargin: 0 }
                    : {})}
                />
                <YAxis type="number" width={46} {...valueAxis} />
              </>
            )}

            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelStyle={TOOLTIP_LABEL_STYLE}
              itemStyle={TOOLTIP_ITEM_STYLE}
              cursor={{ fill: 'var(--a-surface-hover)', opacity: 0.6 }}
              formatter={(value: unknown, name: unknown) => [
                formatValue(value, format),
                String(name),
              ]}
            />

            {series.map((spec, index) => (
              <Bar
                key={spec.key}
                dataKey={spec.key}
                name={seriesLabel(spec)}
                fill={colorFor(spec, index)}
                stackId={stacked ? 'stack' : undefined}
                // A 2px surface stroke is the gap between stacked segments.
                stroke={stacked ? 'var(--a-surface)' : undefined}
                strokeWidth={stacked ? 2 : 0}
                radius={stacked ? 0 : sideways ? [0, 4, 4, 0] : [4, 4, 0, 0]}
                isAnimationActive={false}
              >
                {perCategory &&
                  data.map((_, rowIndex) => (
                    <Cell key={rowIndex} fill={seriesColor(rowIndex)} />
                  ))}
              </Bar>
            ))}
          </RechartsBar>
        )
      }}
    </VizFrame>
  )
}
