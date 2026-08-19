/**
 * Trend — "How has this changed over time?"
 * Data Shape: one Time Dimension + one or more Measures.
 *
 * Covers four Visualization Types that differ only in stroke and fill
 * treatment: line, area, spline and step. They share a Family, therefore a Data
 * Shape, therefore a renderer — which is the classification model paying off.
 */

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AXIS_STYLE, TOOLTIP_STYLE, fieldLabel, formatCompact, seriesColour } from './shared'
import type { RendererProps } from '../widget-runtime/renderer'

type Curve = 'linear' | 'monotone' | 'step'

function trendRenderer(variant: 'line' | 'area', curve: Curve) {
  return function TrendRenderer({ rows, dataset, mapping }: RendererProps) {
    const timeField = mapping.timeDimension
    const measures = mapping.measures ?? []

    if (!timeField || measures.length === 0) {
      throw new Error('A Trend Widget needs a Time Dimension and at least one Measure.')
    }

    return (
      <div className="h-full min-h-40">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows as object[]} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="var(--analytics-grid)" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey={timeField} tick={AXIS_STYLE} stroke="var(--analytics-grid)" />
            <YAxis
              tick={AXIS_STYLE}
              stroke="var(--analytics-grid)"
              width={44}
              tickFormatter={formatCompact}
            />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ stroke: 'var(--analytics-grid)' }} />
            {measures.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}

            {measures.map((measure, index) =>
              variant === 'area' ? (
                <Area
                  key={measure.field}
                  type={curve}
                  dataKey={measure.field}
                  name={fieldLabel(dataset, measure.field)}
                  stroke={seriesColour(index)}
                  fill={seriesColour(index)}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={measure.field}
                  type={curve}
                  dataKey={measure.field}
                  name={fieldLabel(dataset, measure.field)}
                  stroke={seriesColour(index)}
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    )
  }
}

export const LineChartRenderer = trendRenderer('line', 'linear')
export const AreaChartRenderer = trendRenderer('area', 'linear')
export const SplineChartRenderer = trendRenderer('line', 'monotone')
export const StepChartRenderer = trendRenderer('line', 'step')
