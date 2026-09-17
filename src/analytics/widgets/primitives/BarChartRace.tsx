/**
 * Ranking & flow — a ranking animated across time periods.
 *
 * The only widget in the catalogue whose subject is *change in order*. A bar
 * chart shows one period; a trend line shows one entity. This shows who
 * overtook whom, which neither of the others can.
 *
 * Three decisions worth stating, because animation on a dashboard is easy to
 * get wrong:
 *
 * **It does not autoplay.** A dashboard is often a wall display or a screenshot,
 * and a chart that is mid-animation when it is photographed shows a moment
 * nobody chose. It opens on the most recent period — the answer to "how do
 * things stand?" — and plays only when asked.
 *
 * **It is scrubbable.** The animation is a convenience over the control, not the
 * other way round: any period can be selected directly, so nobody has to wait
 * through six quarters to see the third.
 *
 * **It honours `prefers-reduced-motion`.** For a reader who has asked for less
 * motion the play control is not offered at all — the scrubber alone does the
 * whole job, so there is nothing to degrade.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { formatValue, formatTimeLabel } from '../format'
import { seriesColor } from '../../theme/tokens'
import { token } from '../../theme/tokens'
import type { Row, ValueFormat } from '../../data/types'

/** Milliseconds a period holds before advancing. */
const FRAME_MS = 900

export interface BarChartRaceProps {
  data: readonly Row[]
  /** Time Dimension defining the periods. */
  timeKey: string
  /** Dimension naming each racer. */
  entityKey: string
  /** Measure being ranked. */
  valueKey: string
  /** Racers shown per period. @default 8 */
  top?: number
  format?: ValueFormat
  height?: number
  className?: string
}

export function BarChartRace({
  data,
  timeKey,
  entityKey,
  valueKey,
  top = 8,
  format = 'number',
  height,
  className,
}: BarChartRaceProps) {
  const periods = useMemo(() => {
    const byPeriod = new Map<string, Map<string, number>>()
    for (const row of data) {
      const period = String(row[timeKey] ?? '')
      const entity = String(row[entityKey] ?? '')
      const value = Number(row[valueKey] ?? 0)
      if (period === '' || entity === '' || !Number.isFinite(value)) continue

      const entities = byPeriod.get(period) ?? new Map<string, number>()
      // A Dataset grained finer than the period sends several rows per entity
      // per period; they are one racer's total for that period, not several.
      entities.set(entity, (entities.get(entity) ?? 0) + value)
      byPeriod.set(period, entities)
    }

    return [...byPeriod.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, entities]) => ({
        period,
        ranking: [...entities.entries()]
          .map(([entity, value]) => ({ entity, value }))
          .sort((a, b) => b.value - a.value)
          .slice(0, top),
      }))
  }, [data, timeKey, entityKey, valueKey, top])

  // Opens on the latest period — "how do things stand" is the question asked
  // far more often than "how did we get here".
  const [index, setIndex] = useState(() => Math.max(0, periods.length - 1))
  const [playing, setPlaying] = useState(false)

  const reduceMotion = usePrefersReducedMotion()

  // A narrowed filter can leave fewer periods than the index we were sitting on,
  // which would otherwise read as an empty chart rather than a shorter race.
  const safeIndex = Math.min(index, Math.max(0, periods.length - 1))

  useEffect(() => {
    if (!playing || periods.length === 0) return
    const timer = setTimeout(() => {
      setIndex((current) => {
        const next = current + 1
        if (next >= periods.length) {
          setPlaying(false)
          return current
        }
        return next
      })
    }, FRAME_MS)
    return () => { clearTimeout(timer) }
  }, [playing, safeIndex, periods.length])

  if (periods.length === 0) return null

  const frame = periods[safeIndex]
  const peak = Math.max(...frame.ranking.map((entry) => entry.value), 0) || 1

  /*
   * Colour is fixed to the entity, not to its current position. Colouring by
   * rank would repaint every bar whenever two racers swapped — which is exactly
   * the event the chart exists to show, rendered invisible.
   */
  const paletteIndex = new Map(
    [...new Set(data.map((row) => String(row[entityKey] ?? '')))]
      .sort((a, b) => a.localeCompare(b))
      .map((entity, position) => [entity, position]),
  )

  const play = () => {
    // Replaying from the end restarts rather than doing nothing.
    if (safeIndex >= periods.length - 1) setIndex(0)
    setPlaying(true)
  }

  return (
    <div
      className={className}
      style={{
        height: height === undefined ? undefined : `${String(height)}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--a-space-2)',
      }}
    >
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4, minHeight: 0 }}>
        {frame.ranking.map((entry) => (
          <div
            key={entry.entity}
            style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 0 }}
          >
            <span
              style={{
                width: '30%',
                maxWidth: 140,
                fontSize: 'var(--a-text-xs)',
                color: token('textSecondary'),
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {entry.entity}
            </span>
            <span style={{ flex: 1, display: 'block', minWidth: 0 }}>
              <span
                style={{
                  display: 'block',
                  height: 14,
                  borderRadius: 3,
                  width: `${String(Math.max(1, (entry.value / peak) * 100))}%`,
                  background: seriesColor(paletteIndex.get(entry.entity) ?? 0),
                  // The bar's own width eases; its position in the list does
                  // not, because a list that reorders under a moving bar is
                  // harder to follow than one that simply reorders.
                  transition: reduceMotion ? undefined : 'width 400ms ease-out',
                }}
              />
            </span>
            <span
              style={{
                fontSize: 'var(--a-text-xs)',
                color: token('text'),
                fontVariantNumeric: 'tabular-nums',
                whiteSpace: 'nowrap',
              }}
            >
              {formatValue(entry.value, format)}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {!reduceMotion && (
          <button
            type="button"
            onClick={() => { playing ? setPlaying(false) : play() }}
            aria-label={playing ? 'Pause' : 'Play the ranking over time'}
            style={{
              border: '1px solid var(--a-border)',
              background: 'var(--a-surface)',
              color: token('text'),
              borderRadius: 'var(--a-radius-sm)',
              cursor: 'pointer',
              fontSize: 'var(--a-text-xs)',
              padding: '2px 8px',
            }}
          >
            {playing ? '❚❚' : '▶'}
          </button>
        )}

        <input
          type="range"
          min={0}
          max={periods.length - 1}
          value={safeIndex}
          onChange={(event) => {
            setPlaying(false)
            setIndex(Number(event.target.value))
          }}
          aria-label="Period"
          style={{ flex: 1, minWidth: 0 }}
        />

        <span
          style={{
            fontSize: 'var(--a-text-xs)',
            color: token('textMuted'),
            whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {formatTimeLabel(frame.period)}
        </span>
      </div>
    </div>
  )
}

/**
 * Read once and watched, because it can change mid-session — a reader turning
 * reduced motion on should not have to reload the dashboard to be obeyed.
 */
function usePrefersReducedMotion(): boolean {
  const query = useRef<MediaQueryList | null>(null)
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const list = window.matchMedia('(prefers-reduced-motion: reduce)')
    query.current = list
    setReduced(list.matches)

    const onChange = (event: MediaQueryListEvent) => { setReduced(event.matches) }
    list.addEventListener('change', onChange)
    return () => { list.removeEventListener('change', onChange) }
  }, [])

  return reduced
}
