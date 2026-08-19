/**
 * Correlation — "Do these move together?"
 * Data Shape: two or more Measures.
 *
 * The one Family whose eligibility a Dataset can fail on Measure *count* alone,
 * which is what UC-02 turns on: a settlements Dataset with a single Measure is
 * never offered a scatter plot.
 */

import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { AXIS_STYLE, TOOLTIP_STYLE, fieldLabel, formatCompact, seriesColour } from './shared'
import type { RendererProps } from '../widget-runtime/renderer'

function scatterRenderer(sized: boolean) {
  return function CorrelationRenderer({ rows, dataset, mapping }: RendererProps) {
    const measures = mapping.measures ?? []
    if (measures.length < 2) {
      throw new Error('A Correlation Widget needs at least two Measures.')
    }

    const [x, y, size] = measures
    const label = (key: string) => fieldLabel(dataset, key)

    return (
      <div className="h-full min-h-40">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke="var(--analytics-grid)" strokeDasharray="3 3" />
            <XAxis
              type="number"
              dataKey={x.field}
              name={label(x.field)}
              tick={AXIS_STYLE}
              stroke="var(--analytics-grid)"
              tickFormatter={formatCompact}
            />
            <YAxis
              type="number"
              dataKey={y.field}
              name={label(y.field)}
              width={48}
              tick={AXIS_STYLE}
              stroke="var(--analytics-grid)"
              tickFormatter={formatCompact}
            />
            {/* A bubble chart is a scatter plot with a third Measure on radius. */}
            {sized && size && <ZAxis type="number" dataKey={size.field} range={[40, 400]} />}
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ strokeDasharray: '3 3' }}
              formatter={formatCompact}
            />
            <Scatter
              data={rows as object[]}
              fill={seriesColour(0)}
              fillOpacity={0.7}
              isAnimationActive={false}
            />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    )
  }
}

export const ScatterPlotRenderer = scatterRenderer(false)
export const BubbleChartRenderer = scatterRenderer(true)
