/**
 * Single Value — "What is the number right now?"
 * Data Shape: one Measure, optionally one Time Dimension for trend or comparison.
 *
 * The optional Time Dimension is what separates the four Types. Without one the
 * Widget can only state a number; with one it can also say which way that
 * number is moving. The renderer reads which it has from the rows it is given
 * rather than being told, so a stat card upgrades itself to a delta the moment
 * an Author maps a Time Dimension.
 *
 * These use container queries: the same Widget lays out stacked in a narrow
 * column and side by side when given room, without knowing the page width.
 */

import { Area, AreaChart, ResponsiveContainer } from 'recharts'
import { fieldLabel, formatCompact, formatFull, seriesColour } from './shared'
import type { RendererProps } from '../widget-runtime/renderer'

type Variant = 'plain' | 'sparkline' | 'progress' | 'delta'

interface Reading {
  current: number
  previous?: number
  series: { value: number }[]
  label: string
}

function read({ rows, dataset, mapping }: RendererProps): Reading {
  const measure = mapping.measures?.[0]
  if (!measure) throw new Error('A Single Value Widget needs one Measure.')

  const values = rows.map((row) => Number(row[measure.field] ?? 0))
  if (values.length === 0) throw new Error('No value to present.')

  return {
    current: values[values.length - 1],
    previous: values.length > 1 ? values[values.length - 2] : undefined,
    series: values.map((value) => ({ value })),
    label: fieldLabel(dataset, measure.field),
  }
}

function DeltaBadge({ current, previous }: { current: number; previous: number }) {
  if (previous === 0) return null

  const change = ((current - previous) / Math.abs(previous)) * 100
  const rising = change >= 0
  const tone = rising ? 'var(--analytics-status-positive)' : 'var(--analytics-status-negative)'

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium" style={{ color: tone }}>
      <span aria-hidden="true">{rising ? '▲' : '▼'}</span>
      {Math.abs(change).toFixed(1)}%
      <span className="sr-only">
        {rising ? 'increase' : 'decrease'} against the previous period
      </span>
    </span>
  )
}

function singleValueRenderer(variant: Variant) {
  return function SingleValueRenderer(props: RendererProps) {
    const { current, previous, series, label } = read(props)
    const target = Number(props.presentation.target ?? 0)

    return (
      <div className="h-full flex flex-col justify-center gap-2 @sm:flex-row @sm:items-center @sm:justify-between">
        <div>
          <p className="text-xs text-[var(--analytics-text-secondary)] m-0">{label}</p>
          <p className="text-2xl @sm:text-3xl font-semibold text-[var(--analytics-text)] m-0 tabular-nums">
            {formatFull(current)}
          </p>
          {previous !== undefined && variant !== 'progress' && (
            <div className="mt-1 flex items-baseline gap-2">
              <DeltaBadge current={current} previous={previous} />
              {variant === 'delta' && (
                <span className="text-xs text-[var(--analytics-text-muted)]">
                  from {formatCompact(previous)}
                </span>
              )}
            </div>
          )}
        </div>

        {variant === 'sparkline' && series.length > 1 && (
          <div className="h-12 w-full @sm:w-32 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={seriesColour(0)}
                  fill={seriesColour(0)}
                  fillOpacity={0.15}
                  strokeWidth={2}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}

        {variant === 'progress' && target > 0 && (
          <ProgressBar current={current} target={target} />
        )}
      </div>
    )
  }
}

function ProgressBar({ current, target }: { current: number; target: number }) {
  const ratio = Math.max(0, Math.min(current / target, 1))
  const reached = current >= target

  return (
    <div className="w-full @sm:w-40 shrink-0">
      <div
        className="h-2 rounded-full overflow-hidden bg-[var(--analytics-border)]"
        role="progressbar"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${ratio * 100}%`,
            background: reached ? 'var(--analytics-status-positive)' : seriesColour(0),
          }}
        />
      </div>
      <p className="text-xs text-[var(--analytics-text-muted)] m-0 mt-1 text-right">
        {(ratio * 100).toFixed(0)}% of {formatCompact(target)}
      </p>
    </div>
  )
}

export const StatCardRenderer = singleValueRenderer('plain')
export const SparklineCardRenderer = singleValueRenderer('sparkline')
export const ProgressTrackerRenderer = singleValueRenderer('progress')
export const DeltaCardRenderer = singleValueRenderer('delta')
