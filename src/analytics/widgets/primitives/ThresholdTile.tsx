/**
 * Status by threshold — the Family's second Data Shape.
 *
 * `StatusTile` takes a state someone published; this takes a figure and a line
 * the Author drew, and works out which side of it the figure sits on. Ported
 * from the workbench's `StatusRenderer` (merge §2), restyled onto the module's
 * reserved status tones so both routes read identically on one board.
 *
 * Two forms, because they answer the same question at different volumes: the
 * tile is one card among many, the banner is a strip that wants to be noticed.
 *
 * The arithmetic is in `widgets/threshold.ts` and tested there. In particular
 * the figure arrives **already aggregated by the query** — comparing one number
 * to a configured threshold is presentation, not a reduction, so this is not the
 * client-side aggregation D13 and D14 record.
 */

import { formatValue } from '../format'
import { assessThreshold, describeDirection, type ThresholdConfig } from '../threshold'
import { statusColor, token } from '../../theme/tokens'
import type { ValueFormat } from '../../data/types'

export interface ThresholdTileProps {
  /** The figure, already aggregated. */
  value: number
  /** What it is, for a reader. */
  label: string
  config: ThresholdConfig
  format?: ValueFormat
  /** Shows the threshold and which way is bad. Off for the compact form. */
  showThreshold?: boolean
  className?: string
}

export function ThresholdTile({
  value,
  label,
  config,
  format = 'number',
  showThreshold = false,
  className,
}: ThresholdTileProps) {
  const assessment = assessThreshold(value, config)
  const colour = statusColor(assessment.tone)

  return (
    <div className={['a-threshold', className].filter(Boolean).join(' ')}>
      {/*
        Dot *and* words. State is never conveyed by colour alone — a red dot
        beside a number tells a colour-blind reader nothing on its own.
      */}
      <p className="a-threshold__state" style={{ color: colour }}>
        <Dot colour={colour} />
        {assessment.label}
      </p>

      <p className="a-threshold__value">
        {assessment.state === 'unset' && !Number.isFinite(value)
          ? '—'
          : formatValue(value, format)}
      </p>

      <p className="a-threshold__label">{label}</p>

      {showThreshold && config.threshold !== undefined && (
        <p className="a-threshold__rule">
          Threshold {formatValue(config.threshold, format)} ·{' '}
          {describeDirection(config.direction)}
        </p>
      )}
    </div>
  )
}

export interface AlertBannerProps {
  value: number
  label: string
  config: ThresholdConfig
  format?: ValueFormat
  className?: string
}

/**
 * The same assessment as a strip.
 *
 * Carries `role="status"` rather than `role="alert"`: an alert interrupts a
 * screen reader, and this is a board someone chose to look at, not an event that
 * just happened. Analytics displays threshold state and does not act on it.
 */
export function AlertBanner({
  value,
  label,
  config,
  format = 'number',
  className,
}: AlertBannerProps) {
  const assessment = assessThreshold(value, config)
  const colour = statusColor(assessment.tone)

  return (
    <div
      role="status"
      className={['a-alert', className].filter(Boolean).join(' ')}
      style={{ borderColor: colour }}
    >
      <Dot colour={colour} />
      <div className="a-alert__body">
        <p className="a-alert__state" style={{ color: colour }}>
          {assessment.label}
        </p>
        <p className="a-alert__detail">
          {label} is {Number.isFinite(value) ? formatValue(value, format) : 'unavailable'}
          {config.threshold !== undefined &&
            ` against a threshold of ${formatValue(config.threshold, format)}`}
        </p>
      </div>
    </div>
  )
}

function Dot({ colour }: { colour: string }) {
  return (
    <span
      aria-hidden="true"
      className="a-threshold__dot"
      style={{ background: colour, boxShadow: `0 0 0 3px ${token('surface')}` }}
    />
  )
}
