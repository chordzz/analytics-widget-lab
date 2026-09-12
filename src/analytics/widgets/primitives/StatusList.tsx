/**
 * Status — is this healthy?
 *
 * Status colours are reserved: good, warning, serious, critical. They are never
 * reused as categorical slots, so green always means healthy here and never
 * means "EMEA" somewhere else.
 *
 * Every row carries a dot, a written state and a value. State is never conveyed
 * by colour alone — a red dot beside "FX rates" tells a colour-blind reader
 * nothing on its own.
 */

import { formatValue } from '../format'
import { statusColor, token, type StatusTone } from '../../theme/tokens'
import type { Row, ValueFormat } from '../../data/types'

const TONES: StatusTone[] = ['good', 'warning', 'serious', 'critical', 'neutral']

const LABELS: Record<StatusTone, string> = {
  good: 'Healthy',
  warning: 'Degraded',
  serious: 'At risk',
  critical: 'Failing',
  neutral: 'Unknown',
}

const asTone = (value: unknown): StatusTone =>
  TONES.includes(value as StatusTone) ? (value as StatusTone) : 'neutral'

export interface StatusListProps {
  data: readonly Row[]
  /** Field naming each entry. */
  xKey: string
  /** Field holding the state — one of good | warning | serious | critical. */
  stateKey: string
  /** Optional measure shown on the right. */
  valueKey?: string
  format?: ValueFormat
  /**
   * Fixed height in pixels. Omit to size to content.
   *
   * Part of the shared contract: any primitive that takes `data` takes this, so
   * a caller can put one in a fixed box without wrapping it. Content beyond it
   * scrolls rather than overflowing the frame.
   */
  height?: number
  className?: string
}

export function StatusList({
  data,
  xKey,
  stateKey,
  valueKey,
  format = 'percent',
  height,
  className,
}: StatusListProps) {
  // No data draws nothing. Axes and gridlines around an empty set read as a
  // broken chart, and whatever wraps this — a card, a page — is better placed
  // to say why it is empty.
  if (data.length === 0) return null

  return (
    <ul
      className={className}
      style={{ listStyle: 'none', margin: 0, padding: 0, overflow: 'auto', minHeight: 0, height }}
    >
      {data.map((row, index) => {
        const tone = asTone(row[stateKey])
        return (
          <li
            key={String(row[xKey] ?? index)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--a-space-2)',
              padding: '7px 0',
              borderBottom:
                index === data.length - 1 ? 'none' : '1px solid var(--a-border)',
              fontSize: 'var(--a-text-sm)',
            }}
          >
            <Dot tone={tone} />
            <span style={{ color: token('text'), flex: 1, minWidth: 0 }}>{String(row[xKey])}</span>
            <span style={{ fontSize: 'var(--a-text-xs)', color: statusColor(tone) }}>
              {LABELS[tone]}
            </span>
            {valueKey && (
              <span
                className="a-tabular"
                style={{
                  fontSize: 'var(--a-text-xs)',
                  color: token('textSecondary'),
                  minWidth: 52,
                  textAlign: 'right',
                }}
              >
                {formatValue(row[valueKey], format)}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * A single headline state, for when one service or metric is the whole widget.
 */
export function StatusTile({
  label,
  tone,
  detail,
  className,
}: {
  label: string
  tone: StatusTone
  detail?: string
  className?: string
}) {
  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
/*
         * `safe center` rather than `center`.
         *
         * Centred content that outgrows its box overflows equally in both
         * directions, so the first thing clipped is the top — which here is the
         * label saying what the number is. `safe` falls back to start-alignment
         * the moment it would overflow, so a tile that runs out of room loses
         * the least important row instead of the most.
         */
        justifyContent: 'safe center',
        gap: 'var(--a-space-2)',
        minHeight: 0,
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Dot tone={tone} size={12} />
        <span style={{ fontSize: 'var(--a-text-xl)', fontWeight: 600, color: statusColor(tone) }}>
          {LABELS[tone]}
        </span>
      </span>
      <span style={{ fontSize: 'var(--a-text-sm)', color: token('text') }}>{label}</span>
      {detail && (
        <span style={{ fontSize: 'var(--a-text-xs)', color: token('textSecondary') }}>{detail}</span>
      )}
    </div>
  )
}

function Dot({ tone, size = 9 }: { tone: StatusTone; size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: statusColor(tone),
        flexShrink: 0,
      }}
    />
  )
}
