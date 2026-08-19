/**
 * Status — "Is this healthy?"
 * Data Shape: one Measure with a threshold, or one state Dimension.
 *
 * The threshold is Widget configuration, not a Dataset property — which is why
 * a bare Measure satisfies this Family. Analytics *displays* threshold state
 * and must not act on it: detecting a breach and notifying someone is a
 * separate capability, explicitly out of scope.
 */

import { fieldLabel } from './shared'
import type { RendererProps } from '../widget-runtime/renderer'

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

type Health = 'healthy' | 'warning' | 'breached' | 'unknown'

const TOKEN: Record<Health, string> = {
  healthy: 'var(--analytics-status-positive)',
  warning: 'var(--analytics-status-warning)',
  breached: 'var(--analytics-status-negative)',
  unknown: 'var(--analytics-status-neutral)',
}

const LABEL: Record<Health, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  breached: 'Breached',
  unknown: 'No threshold set',
}

/**
 * `direction` says which way is bad. Without it a threshold is ambiguous: 95%
 * uptime against a 99% target is a breach, while 95% error rate against a 1%
 * target is a far worse one, and the arithmetic cannot tell them apart.
 */
function assess(
  value: number,
  threshold: number | undefined,
  warnAt: number | undefined,
  direction: 'above-is-bad' | 'below-is-bad',
): Health {
  if (threshold === undefined) return 'unknown'
  const breached = direction === 'above-is-bad' ? value >= threshold : value <= threshold
  if (breached) return 'breached'
  if (warnAt !== undefined) {
    const warning = direction === 'above-is-bad' ? value >= warnAt : value <= warnAt
    if (warning) return 'warning'
  }
  return 'healthy'
}

function statusRenderer(variant: 'indicator' | 'threshold' | 'banner') {
  return function StatusRenderer({ rows, dataset, mapping, presentation }: RendererProps) {
    const measure = mapping.measures?.[0]
    if (!measure) throw new Error('A Status Widget needs one Measure.')

    // The Measure is already aggregated by the query, so the single returned
    // row is the figure — no reduction happens here.
    const value = Number(rows[0]?.[measure.field] ?? 0)

    const threshold = typeof presentation.threshold === 'number' ? presentation.threshold : undefined
    const warnAt = typeof presentation.warnAt === 'number' ? presentation.warnAt : undefined
    const direction =
      presentation.direction === 'below-is-bad' ? 'below-is-bad' : 'above-is-bad'

    const health = assess(value, threshold, warnAt, direction)
    const colour = TOKEN[health]

    if (variant === 'banner') {
      return (
        <div
          role="status"
          className="h-full flex items-center gap-3 rounded border px-3 py-2"
          style={{ borderColor: colour, color: colour }}
        >
          <Dot colour={colour} />
          <div className="min-w-0">
            <p className="text-sm font-medium m-0">{LABEL[health]}</p>
            <p className="text-xs m-0 text-[var(--analytics-text-secondary)] truncate">
              {fieldLabel(dataset, measure.field)} is {number.format(value)}
              {threshold !== undefined &&
                ` against a threshold of ${number.format(threshold)}`}
            </p>
          </div>
        </div>
      )
    }

    return (
      <div className="h-full flex flex-col items-start justify-center gap-2 @container">
        <div className="flex items-center gap-2">
          <Dot colour={colour} />
          <span className="text-xs" style={{ color: colour }}>
            {LABEL[health]}
          </span>
        </div>

        <p className="text-2xl font-semibold text-[var(--analytics-text)] m-0 tabular-nums">
          {number.format(value)}
        </p>

        <p className="text-xs text-[var(--analytics-text-secondary)] m-0">
          {fieldLabel(dataset, measure.field)}
        </p>

        {variant === 'threshold' && threshold !== undefined && (
          <p className="text-xs text-[var(--analytics-text-muted)] m-0">
            Threshold {number.format(threshold)} ·{' '}
            {direction === 'above-is-bad' ? 'higher is worse' : 'lower is worse'}
          </p>
        )}
      </div>
    )
  }
}

function Dot({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block rounded-full shrink-0"
      style={{ width: 10, height: 10, background: colour }}
    />
  )
}

export const StatusIndicatorRenderer = statusRenderer('indicator')
export const ThresholdIndicatorRenderer = statusRenderer('threshold')
export const AlertBannerRenderer = statusRenderer('banner')
