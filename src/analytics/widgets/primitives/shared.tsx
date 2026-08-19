/**
 * The vocabulary every primitive shares.
 *
 * Learning one primitive should teach you the rest, so the prop names are fixed
 * across the set: `data`, `xKey`, `series`, `variant`, `format`, `showLegend`,
 * `showGrid`. A primitive draws a picture from an array — it does not fetch,
 * does not know what a dashboard is, and never renders a card.
 */

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import type { Row, ValueFormat } from '../../data/types'
import { seriesColor, token } from '../../theme/tokens'

/** One plotted measure. `color` is only for callers overriding the fixed order. */
export interface SeriesSpec {
  key: string
  label?: string
  color?: string
  format?: ValueFormat
}

/** What every data-bearing primitive accepts. */
export interface ChartProps {
  data: readonly Row[]
  /** Categorical or time axis. */
  xKey: string
  series: SeriesSpec[]
  format?: ValueFormat
  showGrid?: boolean
  showLegend?: boolean
  /** Fixed height in px. Omit to fill the container. */
  height?: number
  className?: string
}

export const seriesLabel = (spec: SeriesSpec): string => spec.label ?? spec.key

/**
 * Colour for a series. Fixed order, never cycled — a ninth series would
 * otherwise take slot 1's hue and read as the same entity.
 */
export const colorFor = (spec: SeriesSpec, index: number): string => spec.color ?? seriesColor(index)

/** Recharts styling, expressed entirely in tokens. */
/**
 * How wide a string will actually be, in pixels.
 *
 * Hand-rolled SVG has to decide whether a label fits *before* it draws, and the
 * obvious answer — characters times an average width — is wrong in the direction
 * that matters. Averages are set by lowercase text, so a caps-heavy string like
 * "Completed KYC" measures 6.85px per character against an assumed 6.4 and runs
 * off the edge. Tuning the constant until the current labels fit just moves the
 * failure to the next dataset.
 *
 * A canvas measures the real font. The context is created once and reused; the
 * estimate stays as the fallback for server rendering, where there is no canvas.
 */
let measuringContext: CanvasRenderingContext2D | null | undefined

function textContext(): CanvasRenderingContext2D | null {
  if (measuringContext !== undefined) return measuringContext
  measuringContext =
    typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d')
  return measuringContext
}

/** Widest character-to-pixel ratio observed across the sample labels. */
const FALLBACK_RATIO = 0.58

export function measureText(text: string, fontSize: number): number {
  const context = textContext()
  if (!context) return text.length * fontSize * FALLBACK_RATIO
  context.font = `${fontSize}px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`
  return context.measureText(text).width
}

/**
 * Shortens `text` until it fits `budget` pixels, with an ellipsis.
 *
 * Returns the original when it already fits, and an empty string when even one
 * character plus the ellipsis will not — better nothing than a lone "…".
 */
export function truncateToWidth(text: string, budget: number, fontSize: number): string {
  if (budget <= 0) return ''
  if (measureText(text, fontSize) <= budget) return text

  let cut = text.length - 1
  while (cut > 0 && measureText(`${text.slice(0, cut)}…`, fontSize) > budget) cut -= 1
  return cut > 0 ? `${text.slice(0, cut)}…` : ''
}

export const AXIS_TICK = { fontSize: 11, fill: token('axis') } as const
export const AXIS_LINE = { stroke: token('grid') } as const
export const GRID_STROKE = token('grid')

export const TOOLTIP_STYLE: CSSProperties = {
  background: token('tooltipBg'),
  color: token('tooltipText'),
  border: 'none',
  borderRadius: 6,
  fontSize: 12,
  padding: '6px 10px',
  boxShadow: 'var(--a-shadow-raised)',
}

export const TOOLTIP_LABEL_STYLE: CSSProperties = {
  color: token('tooltipText'),
  opacity: 0.7,
  marginBottom: 2,
}

/**
 * Tooltip rows wear the tooltip's text colour, not the series colour.
 * Recharts colours the text by series out of the box, which puts a saturated
 * hue on small type over a dark ground — the swatch beside it already carries
 * identity, so the words do not need to.
 */
export const TOOLTIP_ITEM_STYLE: CSSProperties = {
  color: token('tooltipText'),
  padding: 0,
}

/**
 * A legend is present whenever there is more than one series, so identity is
 * never carried by colour alone. One series needs none — the widget title
 * already names it.
 */
export function Legend({ series }: { series: SeriesSpec[] }) {
  if (series.length < 2) return null

  return (
    <ul className="a-legend" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {series.map((spec, index) => (
        <li key={spec.key} className="a-legend__item">
          <span className="a-legend__swatch" style={{ background: colorFor(spec, index) }} />
          {seriesLabel(spec)}
        </li>
      ))}
    </ul>
  )
}

export interface PlotSize {
  width: number
  height: number
}

/**
 * Measures its own box and hands the size to the chart.
 *
 * Deliberately not recharts' `ResponsiveContainer`. That measures a percentage
 * height against its parent, and inside a `flex: 1` box it reads zero, renders
 * nothing, and never recovers — not on a resize event, not on a re-render. A
 * widget library whose charts live in arbitrary containers cannot depend on
 * that working out. Observing the box directly and passing explicit pixels is
 * deterministic, and it costs one ResizeObserver.
 *
 * Children render only once a real size is known, so a chart is never handed
 * zero dimensions.
 */
/**
 * What a plot draws at when nothing can be measured.
 *
 * There is no layout on a server, so `ResizeObserver` never fires and the honest
 * measurement is zero — which would render an empty box. A reasonable default
 * means a server-rendered chart is a chart, and it means the drawing code is
 * reachable from tests. Only ever used where there is no `window`; in a browser
 * the real measurement always wins, so there is no flash of a wrong size.
 */
const UNMEASURED: PlotSize = { width: 640, height: 240 }

const canMeasure = typeof window !== 'undefined'

function Plot({ children }: { children: (size: PlotSize) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<PlotSize>(canMeasure ? { width: 0, height: 0 } : UNMEASURED)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return

    const apply = (width: number, height: number) =>
      setSize((current) =>
        // Sub-pixel jitter would otherwise re-render the chart forever.
        Math.abs(current.width - width) < 1 && Math.abs(current.height - height) < 1
          ? current
          : { width, height },
      )

    const observer = new ResizeObserver(([entry]) =>
      apply(entry.contentRect.width, entry.contentRect.height),
    )
    observer.observe(element)

    const rect = element.getBoundingClientRect()
    apply(rect.width, rect.height)

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="a-viz__plot">
      {size.width > 0 && size.height > 0 ? children(size) : null}
    </div>
  )
}

/**
 * The plot and its legend, as one element.
 *
 * Every chart primitive returns exactly one node so the card body's `flex: 1`
 * lands on the wrapper. Returning a fragment splits that between the plot and
 * the legend, and the plot collapses — the legend is happy at any height, the
 * chart is not.
 */
export function VizFrame({
  height,
  legend,
  className = '',
  children,
}: {
  height?: number
  legend?: ReactNode
  className?: string
  children: (size: PlotSize) => ReactNode
}) {
  return (
    <div className={`a-viz ${className}`} style={height ? { height } : undefined}>
      <Plot>{children}</Plot>
      {legend && <div className="a-viz__legend">{legend}</div>}
    </div>
  )
}
