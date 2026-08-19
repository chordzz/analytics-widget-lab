/**
 * Temporal pattern — what runs when, and for how long?
 *
 * Spans on a shared time axis. Colour is by *group*, not by row: a Gantt where
 * every bar is a different hue reads as unrelated work, when the point is
 * usually which phase a task belongs to.
 *
 * Progress is drawn as a darker inset inside the span rather than as a separate
 * bar, so a task's extent and its completeness stay one mark.
 */

import { VizFrame } from './shared'
import { seriesColor, token } from '../../theme/tokens'
import type { Row } from '../../data/types'

export interface GanttChartProps {
  data: readonly Row[]
  /** Field naming each row. */
  xKey: string
  /** Numeric start offset. */
  startKey: string
  /** Numeric end offset. */
  endKey: string
  /** Optional field grouping rows into colours. */
  groupKey?: string
  /** Optional 0–1 completeness, drawn inside the span. */
  progressKey?: string
  height?: number
  className?: string
}

export function GanttChart({
  data,
  xKey,
  startKey,
  endKey,
  groupKey,
  progressKey,
  height,
  className,
}: GanttChartProps) {
  const rows = data.map((row) => ({
    label: String(row[xKey]),
    start: Number(row[startKey] ?? 0),
    end: Number(row[endKey] ?? 0),
    group: groupKey ? String(row[groupKey]) : null,
    progress: progressKey ? Number(row[progressKey] ?? 0) : null,
  }))

  if (rows.length === 0) return null

  const min = Math.min(...rows.map((row) => row.start))
  const max = Math.max(...rows.map((row) => row.end))
  const span = max - min || 1

  const groups = [...new Set(rows.map((row) => row.group).filter(Boolean))] as string[]
  const colourFor = (group: string | null) =>
    group === null ? seriesColor(0) : seriesColor(Math.max(0, groups.indexOf(group)))

  return (
    <VizFrame height={height} className={className}>
      {({ width, height: plotHeight }) => {
        const labelWidth = Math.min(140, Math.max(88, width * 0.26))
        const track = Math.max(0, width - labelWidth - 8)
        const band = plotHeight / rows.length
        const barHeight = Math.max(8, Math.min(20, band - 8))
        const xFor = (value: number) => labelWidth + ((value - min) / span) * track

        return (
          <svg width={width} height={plotHeight} role="img" aria-label="Timeline">
            {/* Quarter gridlines give the eye something to measure against. */}
            {[0.25, 0.5, 0.75].map((fraction) => (
              <line
                key={fraction}
                x1={labelWidth + fraction * track}
                x2={labelWidth + fraction * track}
                y1={0}
                y2={plotHeight}
                stroke="var(--a-grid)"
                strokeDasharray="2 4"
              />
            ))}

            {rows.map((row, index) => {
              const y = index * band + (band - barHeight) / 2
              const x = xFor(row.start)
              const barWidth = Math.max(2, xFor(row.end) - x)
              const colour = colourFor(row.group)

              // Keyed by position, not label: a row label is data and may
              // legitimately repeat — two tasks in the same phase, say.
              return (
                <g key={index}>
                  <title>
                    {`${row.label}${row.group ? ` · ${row.group}` : ''} — day ${row.start} to ${row.end}`}
                  </title>

                  <text
                    x={labelWidth - 10}
                    y={y + barHeight / 2 + 4}
                    textAnchor="end"
                    style={{ fontSize: 11, fill: token('text') }}
                  >
                    {row.label}
                  </text>

                  <rect
                    x={x}
                    y={y}
                    width={barWidth}
                    height={barHeight}
                    rx={3}
                    fill={colour}
                    fillOpacity={row.progress === null ? 1 : 0.32}
                  />

                  {row.progress !== null && (
                    <rect
                      x={x}
                      y={y}
                      width={Math.max(1, barWidth * Math.min(1, Math.max(0, row.progress)))}
                      height={barHeight}
                      rx={3}
                      fill={colour}
                    />
                  )}
                </g>
              )
            })}
          </svg>
        )
      }}
    </VizFrame>
  )
}
