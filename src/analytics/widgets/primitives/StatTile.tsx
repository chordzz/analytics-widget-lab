/**
 * Single value — the number right now.
 *
 * The most-used widget on any dashboard and the easiest to get wrong. Three
 * things matter: the number is the hero, the delta says which way is good
 * rather than merely which way it moved, and the sparkline is context not
 * decoration — so it carries no axes and no interaction.
 *
 * Direction is explicit because the arithmetic cannot infer it. Revenue up is
 * good; churn up is not, and a component that colours every rise green is
 * actively misleading.
 */

import { Sparkline } from './TrendChart'
import { formatDelta, formatValue } from '../format'
import { statusColor, token } from '../../theme/tokens'
import type { Row, ValueFormat } from '../../data/types'

export interface StatTileProps {
  label: string
  value: number
  format?: ValueFormat
  /** Change against the comparison period, as a fraction. `0.12` is +12%. */
  delta?: number
  /** Which direction is good. @default 'up-is-good' */
  direction?: 'up-is-good' | 'down-is-good' | 'neutral'
  /** What the delta is measured against, e.g. "vs. last month". */
  comparisonLabel?: string
  /** Rows for the sparkline. Omit for a bare number. */
  trend?: readonly Row[]
  trendKey?: string
  className?: string
}

export function StatTile({
  label,
  value,
  format = 'number',
  delta,
  direction = 'up-is-good',
  comparisonLabel,
  trend,
  trendKey,
  className,
}: StatTileProps) {
  const tone =
    delta === undefined || delta === 0 || direction === 'neutral'
      ? 'neutral'
      : (delta > 0) === (direction === 'up-is-good')
        ? 'good'
        : 'critical'

  return (
    <div
      className={className}
      style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: 0 }}
    >
      <p
        style={{
          margin: 0,
          fontSize: 'var(--a-text-xs)',
          color: token('textSecondary'),
          textTransform: 'uppercase',
          letterSpacing: '0.04em',
        }}
      >
        {label}
      </p>

      {/* The size lives in CSS, not here, so it can answer a container query.
          An inline font-size cannot be overridden by one. */}
      <p className="a-tabular a-stat__value">{formatValue(value, format)}</p>

      {delta !== undefined && (
        <p style={{ margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            className="a-tabular"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 'var(--a-text-xs)',
              fontWeight: 600,
              color: statusColor(tone),
            }}
          >
            {/* An arrow as well as a colour — direction never rests on hue alone. */}
            <Arrow up={delta >= 0} />
            {formatDelta(delta)}
          </span>
          {comparisonLabel && (
            <span style={{ fontSize: 'var(--a-text-xs)', color: token('textMuted') }}>
              {comparisonLabel}
            </span>
          )}
        </p>
      )}

      {trend && trendKey && (
        <div style={{ marginTop: 'var(--a-space-3)' }}>
          <Sparkline data={trend} seriesKey={trendKey} />
        </div>
      )}
    </div>
  )
}

function Arrow({ up }: { up: boolean }) {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path
        d={up ? 'M5 1.5 L9 8 L1 8 Z' : 'M5 8.5 L1 2 L9 2 Z'}
        fill="currentColor"
      />
    </svg>
  )
}
