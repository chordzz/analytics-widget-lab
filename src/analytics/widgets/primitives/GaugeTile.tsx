/**
 * Radial — a value against a target.
 *
 * A 270° arc rather than a full ring, because a full ring at 0% and at 100%
 * look alike; leaving a gap at the bottom makes empty and full unmistakable.
 * Hand-rolled SVG — recharts' radial bar fights this shape more than it helps.
 */

import { formatValue } from '../format'
import { statusColor, token, type StatusTone } from '../../theme/tokens'
import type { ValueFormat } from '../../data/types'

export interface GaugeTileProps {
  label: string
  value: number
  target: number
  format?: ValueFormat
  /**
   * Colour the arc by how close it is to target. Off by default: a gauge is
   * usually just progress, and reserving status colours for actual status keeps
   * them meaningful.
   */
  tone?: StatusTone | 'progress'
  className?: string
}

const RADIUS = 42
const SWEEP_DEGREES = 270
const START_DEGREES = 135
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const ARC = (SWEEP_DEGREES / 360) * CIRCUMFERENCE

export function GaugeTile({
  label,
  value,
  target,
  format = 'number',
  tone = 'progress',
  className,
}: GaugeTileProps) {
  const fraction = target === 0 ? 0 : Math.min(Math.max(value / target, 0), 1)
  const stroke = tone === 'progress' ? 'var(--a-series-1)' : statusColor(tone)

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--a-space-1)',
        minHeight: 0,
      }}
    >
      <svg
        viewBox="0 0 100 100"
        style={{ width: '100%', height: '100%', maxWidth: 168, minHeight: 84 }}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={`${label}: ${formatValue(value, format)} of ${formatValue(target, format)}`}
      >
        <g transform={`rotate(${START_DEGREES} 50 50)`}>
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke="var(--a-surface-hover)"
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${ARC} ${CIRCUMFERENCE}`}
          />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            stroke={stroke}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={`${ARC * fraction} ${CIRCUMFERENCE}`}
          />
        </g>

        <text
          x="50"
          y="49"
          textAnchor="middle"
          className="a-tabular"
          style={{ fontSize: 19, fontWeight: 600, fill: token('text') }}
        >
          {Math.round(fraction * 100)}%
        </text>
        <text
          x="50"
          y="62"
          textAnchor="middle"
          style={{ fontSize: 8, fill: token('textSecondary') }}
        >
          of target
        </text>
      </svg>

      <p
        className="a-tabular"
        style={{ margin: 0, fontSize: 'var(--a-text-xs)', color: token('textSecondary') }}
      >
        {formatValue(value, format)} of {formatValue(target, format)}
      </p>
    </div>
  )
}
