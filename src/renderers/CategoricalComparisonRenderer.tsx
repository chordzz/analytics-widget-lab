/**
 * Categorical Comparison — "How do these categories compare?"
 * Data Shape: one Dimension + one or more Measures.
 *
 * Covers vertical, horizontal, grouped and stacked bars. Grouped and stacked
 * differ only in whether the Measures share a stack id, which is why they are
 * one renderer with a presentation option rather than four.
 */

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { AXIS_STYLE, TOOLTIP_STYLE, fieldLabel, formatCompact, seriesColour } from './shared'
import type { RendererProps } from '../widget-runtime/renderer'
import type { DatasetRow } from '../domain/query'

/**
 * Recast values as percentages.
 *
 * Stacked, each category is expressed as shares of its own total, which is what
 * "100% stacked" means. Unstacked, each bar is a share of the grand total
 * across categories — the only reading that makes a single-Measure bar chart
 * meaningful as a percentage.
 *
 * This is presentation, not aggregation: it works on rows already returned, so
 * a Viewer flipping the toggle costs no retrieval.
 */
function asPercentages(
  rows: readonly DatasetRow[],
  fields: string[],
  stacked: boolean,
): DatasetRow[] {
  const grandTotals = Object.fromEntries(
    fields.map((field) => [
      field,
      rows.reduce((sum, row) => sum + Math.abs(Number(row[field] ?? 0)), 0),
    ]),
  )

  return rows.map((row) => {
    const rowTotal = fields.reduce((sum, field) => sum + Math.abs(Number(row[field] ?? 0)), 0)
    const recast: DatasetRow = { ...row }

    for (const field of fields) {
      const divisor = stacked ? rowTotal : grandTotals[field]
      recast[field] = divisor === 0 ? 0 : (Number(row[field] ?? 0) / divisor) * 100
    }
    return recast
  })
}

function barRenderer(orientation: 'vertical' | 'horizontal', stacked: boolean) {
  return function CategoricalComparisonRenderer({
    rows,
    dataset,
    mapping,
    presentation,
  }: RendererProps) {
    const dimension = mapping.dimensions?.[0]
    const measures = mapping.measures ?? []

    if (!dimension || measures.length === 0) {
      throw new Error('A Categorical Comparison Widget needs a Dimension and at least one Measure.')
    }

    // FR-CO-06 via a presentation toggle (Finding 6) — the Dataset is irrelevant
    // to whether this is meaningful; the Visualization Type is what matters.
    const asPercentage = presentation.valueMode === 'percentage'
    const plotted = asPercentage
      ? asPercentages(rows, measures.map((m) => m.field), stacked)
      : rows
    const formatValue = asPercentage
      ? (value: unknown) => (typeof value === 'number' ? `${value.toFixed(0)}%` : String(value))
      : formatCompact

    // recharts calls the bars-run-sideways case `layout="vertical"`, which is
    // the opposite of what the Visualization Type calls it.
    const layout = orientation === 'horizontal' ? 'vertical' : 'horizontal'
    const categoryAxis = { dataKey: dimension, tick: AXIS_STYLE, stroke: 'var(--analytics-grid)' }
    const valueAxis = {
      tick: AXIS_STYLE,
      stroke: 'var(--analytics-grid)',
      tickFormatter: formatValue,
    }

    return (
      <div className="h-full min-h-40">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={plotted as object[]}
            layout={layout}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid
              stroke="var(--analytics-grid)"
              strokeDasharray="3 3"
              vertical={layout === 'vertical'}
              horizontal={layout === 'horizontal'}
            />
            {layout === 'horizontal' ? (
              <>
                <XAxis type="category" {...categoryAxis} />
                <YAxis type="number" width={44} {...valueAxis} />
              </>
            ) : (
              <>
                <XAxis type="number" {...valueAxis} />
                <YAxis type="category" width={96} {...categoryAxis} />
              </>
            )}
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: 'var(--analytics-surface-hover)' }}
              formatter={formatValue}
            />
            {measures.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} />}

            {measures.map((measure, index) => (
              <Bar
                key={measure.field}
                dataKey={measure.field}
                name={fieldLabel(dataset, measure.field)}
                fill={seriesColour(index)}
                stackId={stacked ? 'stack' : undefined}
                radius={2}
                isAnimationActive={false}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    )
  }
}

export const VerticalBarRenderer = barRenderer('vertical', false)
export const HorizontalBarRenderer = barRenderer('horizontal', false)
export const GroupedBarRenderer = barRenderer('vertical', false)
export const StackedBarRenderer = barRenderer('vertical', true)
