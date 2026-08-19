/**
 * Radial — "How does this compare against a target or across axes?"
 * Data Shape: one or more Measures, optionally with a target.
 *
 * The target is Widget configuration rather than a Dataset property, so it does
 * not gate eligibility — a Dataset with any Measure satisfies this Family, and
 * a gauge without a target simply shows the value against the observed range.
 */

import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
import { AXIS_STYLE, fieldLabel, seriesColour } from './shared'
import type { RendererProps } from '../widget-runtime/renderer'

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 })

export function GaugeRenderer({ rows, dataset, mapping, presentation }: RendererProps) {
  const measure = mapping.measures?.[0]
  if (!measure) throw new Error('A Radial Widget needs at least one Measure.')

  const value = Number(rows[0]?.[measure.field] ?? 0)
  const target =
    typeof presentation.target === 'number'
      ? presentation.target
      : Math.max(...rows.map((row) => Number(row[measure.field] ?? 0)), value, 1)

  const fraction = target === 0 ? 0 : Math.min(Math.max(value / target, 0), 1)

  // A 270° arc rather than a full circle, so "empty" and "full" are visually
  // distinct — a full ring at 0% and at 100% look alike.
  const RADIUS = 42
  const SWEEP = 270
  const START = 135
  const circumference = 2 * Math.PI * RADIUS
  const arc = (SWEEP / 360) * circumference

  return (
    <div className="h-full flex flex-col items-center justify-center gap-1">
      <svg viewBox="0 0 100 100" className="w-full max-w-40 max-h-40" role="img"
           aria-label={`${fieldLabel(dataset, measure.field)}: ${number.format(value)} of ${number.format(target)}`}>
        <g transform={`rotate(${START} 50 50)`}>
          <circle
            cx="50" cy="50" r={RADIUS}
            fill="none"
            stroke="var(--analytics-border)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circumference}`}
          />
          <circle
            cx="50" cy="50" r={RADIUS}
            fill="none"
            stroke={seriesColour(0)}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${arc * fraction} ${circumference}`}
          />
        </g>
        <text
          x="50" y="52"
          textAnchor="middle"
          style={{ fontSize: 16, fontWeight: 600, fill: 'var(--analytics-text)' }}
        >
          {Math.round(fraction * 100)}%
        </text>
      </svg>

      <p className="text-xs text-[var(--analytics-text-secondary)] m-0 text-center">
        {number.format(value)} of {number.format(target)} · {fieldLabel(dataset, measure.field)}
      </p>
    </div>
  )
}

export function RadarChartRenderer({ rows, dataset, mapping }: RendererProps) {
  const measures = mapping.measures ?? []
  if (measures.length === 0) throw new Error('A Radial Widget needs at least one Measure.')

  // One axis per Measure, comparing them on a shared scale.
  const data = measures.map((measure) => ({
    axis: fieldLabel(dataset, measure.field),
    value: Number(rows[0]?.[measure.field] ?? 0),
  }))

  return (
    <div className="h-full min-h-40">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="70%">
          <PolarGrid stroke="var(--analytics-grid)" />
          <PolarAngleAxis dataKey="axis" tick={AXIS_STYLE} />
          <PolarRadiusAxis tick={AXIS_STYLE} stroke="var(--analytics-grid)" />
          <Radar
            dataKey="value"
            stroke={seriesColour(0)}
            fill={seriesColour(0)}
            fillOpacity={0.25}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  )
}
