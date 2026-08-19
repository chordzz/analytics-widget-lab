/**
 * Chronological — what happened, in order?
 *
 * The family that needs no measure: a feed lists events rather than
 * aggregating them, which is what separates it from Trend despite both
 * requiring a time field.
 *
 * Severity uses the reserved status colours and always pairs the dot with a
 * word, so state never rests on hue alone.
 */

import { formatTimeLabel } from '../format'
import { statusColor, token, type StatusTone } from '../../theme/tokens'
import type { Row } from '../../data/types'

const TONE_FOR: Record<string, StatusTone> = {
  info: 'neutral',
  warning: 'warning',
  serious: 'serious',
  critical: 'critical',
  good: 'good',
}

export interface ActivityFeedProps {
  data: readonly Row[]
  /** Field holding the timestamp. */
  timeKey: string
  /** Field naming who or what acted. */
  actorKey?: string
  /** Field describing what happened. */
  actionKey: string
  /** Optional severity field — info | warning | serious | critical | good. */
  severityKey?: string
  /** @default 40 */
  limit?: number
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

export function ActivityFeed({
  data,
  timeKey,
  actorKey,
  actionKey,
  severityKey,
  limit = 40,
  height,
  className,
}: ActivityFeedProps) {
  // Most recent first — a feed read oldest-first buries what matters.
  const events = [...data]
    .sort((a, b) => String(b[timeKey] ?? '').localeCompare(String(a[timeKey] ?? '')))
    .slice(0, limit)

  if (events.length === 0) return null

  return (
    <ol
      className={className}
      style={{ listStyle: 'none', margin: 0, padding: 0, overflow: 'auto', minHeight: 0, height }}
    >
      {events.map((event, index) => {
        const severity = severityKey ? String(event[severityKey] ?? 'info') : 'info'
        const tone = TONE_FOR[severity] ?? 'neutral'
        const last = index === events.length - 1

        return (
          <li key={index} style={{ position: 'relative', paddingLeft: 18, paddingBottom: last ? 0 : 12 }}>
            {/* The rail is what makes a list read as a sequence. */}
            {!last && (
              <span
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 3,
                  top: 12,
                  bottom: 0,
                  width: 1,
                  background: 'var(--a-border)',
                }}
              />
            )}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 0,
                top: 5,
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: statusColor(tone),
              }}
            />

            <p style={{ margin: 0, fontSize: 'var(--a-text-sm)', color: token('text') }}>
              {actorKey && (
                <span style={{ fontWeight: 500 }}>{String(event[actorKey] ?? '')} </span>
              )}
              {String(event[actionKey] ?? '')}
            </p>

            <p
              style={{
                margin: '2px 0 0',
                fontSize: 'var(--a-text-xs)',
                color: token('textMuted'),
                display: 'flex',
                gap: 8,
              }}
            >
              <span>{formatTimeLabel(event[timeKey])}</span>
              {severityKey && severity !== 'info' && (
                <span style={{ color: statusColor(tone) }}>{severity}</span>
              )}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
