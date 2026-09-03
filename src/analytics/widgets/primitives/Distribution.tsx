/**
 * Distribution — how are these values spread?
 *
 * Both forms answer a question a mean cannot: revenue "averaging £3,200" hides
 * whether that is a tight cluster or a handful of huge transactions dragging a
 * long tail. The histogram shows the shape; the box plot compares shapes
 * between groups.
 *
 * One hue throughout. A bucket is a position on a continuum, not an entity, so
 * colouring buckets differently would imply a distinction that isn't there.
 */

import { VizFrame } from './shared'
import { formatAxis, formatValue } from '../format'
import type { Row, ValueFormat } from '../../data/types'

// --- histogram --------------------------------------------------------------

export interface HistogramProps {
  data: readonly Row[]
  /** Measure to bucket. */
  valueKey: string
  /** Bucket count. Sturges' rule when omitted. */
  buckets?: number
  /**
   * Hard upper bound for the buckets. Defaults to the 1.5×IQR outlier fence —
   * the same definition the box plot uses, so the two agree when they sit
   * beside each other.
   */
  clipAt?: number
  format?: ValueFormat
  height?: number
  className?: string
}

export function Histogram({
  data,
  valueKey,
  buckets,
  clipAt,
  format = 'number',
  height,
  className,
}: HistogramProps) {
  const values = data
    .map((row) => Number(row[valueKey] ?? 0))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)

  if (values.length === 0) return null

  // Sturges' rule — a reasonable default that scales with n rather than a
  // fixed count that is too coarse for 2,000 rows and too fine for 20.
  /*
   * D14 — binning is a reduction over every value, done here.
   *
   * A histogram's shape is a property of the whole distribution, so a paged or
   * filtered response produces a different and silently wrong picture.
   * `DatasetQuery` cannot ask for buckets: there is no bucket-width parameter
   * and no `histogram` aggregation. Registered rather than hidden; the fix is a
   * query-side bucketing primitive, which is an FRD extension.
   */
  const count = buckets ?? Math.max(6, Math.min(24, Math.ceil(Math.log2(values.length) + 1)))

  const min = values[0]

  /*
   * Real measures are frequently long-tailed — a handful of transactions two
   * orders of magnitude above the rest. Bucketing linearly across the full
   * range then puts 95% of the data in bucket one and draws a single spike
   * against an empty chart, which describes the outliers and hides the
   * distribution. So the buckets span up to the 1.5×IQR fence and the tail is
   * collected into one labelled overflow bucket: the shape stays readable and
   * the outliers are still accounted for rather than dropped.
   *
   * A fixed percentile was the first attempt and it does not adapt — a dataset
   * that is 6% tail still spends most of its buckets on the tail at p98. The
   * fence is derived from the data's own spread, so it lands in the right place
   * whatever the shape.
   */
  const clip = clipAt ?? outlierFence(values)
  const span = clip - min || 1

  const bins = Array.from({ length: count }, (_, index) => ({
    from: min + (index / count) * span,
    to: min + ((index + 1) / count) * span,
    count: 0,
    overflow: false,
  }))

  let overflowCount = 0
  for (const value of values) {
    if (value > clip) {
      overflowCount += 1
      continue
    }
    const index = Math.min(count - 1, Math.floor(((value - min) / span) * count))
    bins[index].count += 1
  }

  if (overflowCount > 0) {
    bins.push({ from: clip, to: values[values.length - 1], count: overflowCount, overflow: true })
  }

  const peak = Math.max(...bins.map((bin) => bin.count), 1)
  const bucketCount = bins.length

  return (
    <VizFrame height={height} className={className}>
      {({ width, height: plotHeight }) => {
        const axisHeight = 22
        const plot = plotHeight - axisHeight
        const barWidth = width / bucketCount

        return (
          <svg width={width} height={plotHeight} role="img" aria-label="Distribution">
            {bins.map((bin, index) => {
              const barHeight = (bin.count / peak) * plot
              return (
                <g key={index}>
                  <rect
                    x={index * barWidth}
                    y={plot - barHeight}
                    // A 2px surface gap keeps adjacent bars distinct without a stroke.
                    width={Math.max(1, barWidth - 2)}
                    height={Math.max(0, barHeight)}
                    rx={2}
                    fill="var(--a-series-1)"
                    // The tail is real data, so it is drawn — but muted, since
                    // its bucket is not the same width as the others.
                    fillOpacity={bin.overflow ? 0.45 : 1}
                  />
                  <title>
                    {bin.overflow
                      ? `Above ${formatValue(bin.from, format)}: ${bin.count}`
                      : `${formatValue(bin.from, format)} – ${formatValue(bin.to, format)}: ${bin.count}`}
                  </title>
                </g>
              )
            })}

            {/* Only the extremes and midpoint — a tick per bucket is unreadable. */}
            {[0, 0.5].map((fraction) => (
              <text
                key={fraction}
                x={fraction * width}
                y={plotHeight - 6}
                textAnchor={fraction === 0 ? 'start' : 'middle'}
                style={{ fontSize: 11, fill: 'var(--a-axis)' }}
              >
                {formatAxis(min + fraction * span, format)}
              </text>
            ))}
            <text
              x={width}
              y={plotHeight - 6}
              textAnchor="end"
              style={{ fontSize: 11, fill: 'var(--a-axis)' }}
            >
              {overflowCount > 0 ? `${formatAxis(clip, format)}+` : formatAxis(clip, format)}
            </text>
          </svg>
        )
      }}
    </VizFrame>
  )
}

/**
 * The 1.5×IQR upper fence — the conventional boundary between "the
 * distribution" and "outliers", and the same one the box plot draws its
 * whiskers to.
 */
function outlierFence(sorted: number[]): number {
  const at = (fraction: number) => {
    const position = (sorted.length - 1) * fraction
    const lower = Math.floor(position)
    const upper = Math.ceil(position)
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
  }

  const q1 = at(0.25)
  const q3 = at(0.75)
  const fence = q3 + 1.5 * (q3 - q1)
  // A perfectly uniform measure has no outliers; fall back to the true max.
  return fence > q3 ? Math.min(fence, sorted[sorted.length - 1]) : sorted[sorted.length - 1]
}

// --- box plot ---------------------------------------------------------------

interface Summary {
  label: string
  min: number
  q1: number
  median: number
  q3: number
  max: number
  outliers: number[]
}

/** Quartiles with the 1.5×IQR whisker convention; anything beyond is an outlier. */
function summarise(label: string, input: number[]): Summary | null {
  const values = [...input].sort((a, b) => a - b)
  if (values.length < 4) return null

  const at = (fraction: number) => {
    const position = (values.length - 1) * fraction
    const lower = Math.floor(position)
    const upper = Math.ceil(position)
    return values[lower] + (values[upper] - values[lower]) * (position - lower)
  }

  const q1 = at(0.25)
  const median = at(0.5)
  const q3 = at(0.75)
  const iqr = q3 - q1
  const lowFence = q1 - 1.5 * iqr
  const highFence = q3 + 1.5 * iqr

  const inside = values.filter((value) => value >= lowFence && value <= highFence)
  const outliers = values.filter((value) => value < lowFence || value > highFence)

  return {
    label,
    q1,
    median,
    q3,
    min: inside[0] ?? q1,
    max: inside[inside.length - 1] ?? q3,
    outliers,
  }
}

export interface BoxPlotProps {
  data: readonly Row[]
  /** Dimension splitting the data into boxes. */
  xKey: string
  /** Measure to summarise. */
  valueKey: string
  format?: ValueFormat
  height?: number
  className?: string
}

export function BoxPlot({ data, xKey, valueKey, format = 'number', height, className }: BoxPlotProps) {
  const groups = new Map<string, number[]>()
  for (const row of data) {
    const key = String(row[xKey])
    const value = Number(row[valueKey] ?? 0)
    if (Number.isFinite(value)) groups.set(key, [...(groups.get(key) ?? []), value])
  }

  const summaries = [...groups.entries()]
    .map(([label, values]) => summarise(label, values))
    .filter((summary): summary is Summary => summary !== null)

  if (summaries.length === 0) return null

  /*
   * Scale to the whiskers, not the outliers.
   *
   * Including outliers in the extent is the obvious thing and it is wrong: one
   * transaction at 42k against an interquartile range of a few hundred flattens
   * every box to a line at the baseline, so the chart shows the outliers and
   * hides the comparison it exists to make. Outliers past the scale are clamped
   * to the edge and drawn hollow, so they are still visible as "there is more
   * beyond here" without setting the scale.
   */
  const lowest = Math.min(...summaries.map((s) => s.min))
  const highest = Math.max(...summaries.map((s) => s.max))
  const pad = (highest - lowest) * 0.08 || 1
  const floor = Math.max(0, lowest - pad)
  const ceiling = highest + pad
  const span = ceiling - floor || 1

  return (
    <VizFrame height={height} className={className}>
      {({ width, height: plotHeight }) => {
        const labelHeight = 20
        const plot = plotHeight - labelHeight
        const band = width / summaries.length
        const boxWidth = Math.min(44, band * 0.5)
        const yFor = (value: number) =>
          plot - ((Math.min(ceiling, Math.max(floor, value)) - floor) / span) * plot
        const beyond = (value: number) => value > ceiling || value < floor
        // A clamped outlier sits exactly on the scale's edge, so half the marker
        // falls outside the plot and gets cut by the card. Nudge it inwards by
        // its own radius so the whole circle reads.
        const OUTLIER_RADIUS = 2
        const yForOutlier = (value: number) =>
          Math.max(OUTLIER_RADIUS, Math.min(plot - OUTLIER_RADIUS, yFor(value)))

        return (
          <svg width={width} height={plotHeight} role="img" aria-label="Box plot">
            {[0, 0.5, 1].map((fraction) => {
              const y = plot - fraction * plot
              return (
                <g key={fraction}>
                  <line x1={0} x2={width} y1={y} y2={y} stroke="var(--a-grid)" strokeDasharray="2 4" />
                  <text x={2} y={y - 3} style={{ fontSize: 10, fill: 'var(--a-axis)' }}>
                    {formatAxis(floor + fraction * span, format)}
                  </text>
                </g>
              )
            })}

            {summaries.map((summary, index) => {
              const centre = index * band + band / 2
              const left = centre - boxWidth / 2

              return (
                <g key={summary.label}>
                  <title>
                    {`${summary.label} — median ${formatValue(summary.median, format)}, ` +
                      `IQR ${formatValue(summary.q1, format)}–${formatValue(summary.q3, format)}`}
                  </title>

                  {/* Whiskers */}
                  <line
                    x1={centre}
                    x2={centre}
                    y1={yFor(summary.max)}
                    y2={yFor(summary.q3)}
                    stroke="var(--a-axis)"
                    strokeWidth={1}
                  />
                  <line
                    x1={centre}
                    x2={centre}
                    y1={yFor(summary.q1)}
                    y2={yFor(summary.min)}
                    stroke="var(--a-axis)"
                    strokeWidth={1}
                  />
                  {[summary.min, summary.max].map((value) => (
                    <line
                      key={value}
                      x1={centre - boxWidth / 4}
                      x2={centre + boxWidth / 4}
                      y1={yFor(value)}
                      y2={yFor(value)}
                      stroke="var(--a-axis)"
                      strokeWidth={1}
                    />
                  ))}

                  <rect
                    x={left}
                    y={yFor(summary.q3)}
                    width={boxWidth}
                    height={Math.max(1, yFor(summary.q1) - yFor(summary.q3))}
                    rx={3}
                    fill="var(--a-series-1)"
                    fillOpacity={0.28}
                    stroke="var(--a-series-1)"
                    strokeWidth={1.5}
                  />

                  {/* The median is the headline, so it gets the solid stroke. */}
                  <line
                    x1={left}
                    x2={left + boxWidth}
                    y1={yFor(summary.median)}
                    y2={yFor(summary.median)}
                    stroke="var(--a-series-1)"
                    strokeWidth={2.5}
                  />

                  {summary.outliers.map((value, outlierIndex) => {
                    const clamped = beyond(value)
                    return (
                      <circle
                        key={outlierIndex}
                        cx={centre}
                        cy={yForOutlier(value)}
                        r={OUTLIER_RADIUS}
                        fill={clamped ? 'none' : 'var(--a-series-1)'}
                        fillOpacity={0.5}
                        stroke={clamped ? 'var(--a-series-1)' : 'none'}
                        strokeWidth={clamped ? 1 : 0}
                        strokeOpacity={0.55}
                      />
                    )
                  })}

                  <text
                    x={centre}
                    y={plotHeight - 5}
                    textAnchor="middle"
                    style={{ fontSize: 11, fill: 'var(--a-axis)' }}
                  >
                    {summary.label}
                  </text>
                </g>
              )
            })}
          </svg>
        )
      }}
    </VizFrame>
  )
}
