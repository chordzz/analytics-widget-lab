/**
 * Value formatting.
 *
 * One place, because an axis tick, a tooltip and a table cell showing the same
 * measure must agree — nothing erodes trust in a dashboard faster than the same
 * number appearing three ways on one screen.
 */

import type { ValueFormat } from '../data/types'

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
const plain = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 })
const precise = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })
const money = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
})
const moneyCompact = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  maximumFractionDigits: 1,
})
const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 })

export function formatValue(value: unknown, format: ValueFormat = 'number'): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value !== 'number') return String(value)

  switch (format) {
    case 'currency':
      return Math.abs(value) >= 10_000 ? moneyCompact.format(value) : money.format(value)
    case 'percent':
      return percent.format(value)
    case 'compact':
      return compact.format(value)
    case 'duration':
      return value < 1 ? `${Math.round(value * 1000)}ms` : `${precise.format(value)}s`
    case 'text':
      return String(value)
    case 'number':
    default:
      return Number.isInteger(value) ? plain.format(value) : precise.format(value)
  }
}

/**
 * Axis ticks are always compact. A full currency string per tick crowds the
 * axis and pushes the plot area down, and the precision is not what an axis is
 * for — the tooltip carries it.
 */
export function formatAxis(value: unknown, format: ValueFormat = 'number'): string {
  if (typeof value !== 'number') return String(value ?? '')
  if (format === 'percent') return percent.format(value)
  if (format === 'duration') return value < 1 ? `${Math.round(value * 1000)}ms` : `${value}s`
  return compact.format(value)
}

/** `2026-08-07` → `7 Aug`, `2026-08` → `Aug 26`. Left alone if unrecognised. */
export function formatTimeLabel(value: unknown): string {
  if (typeof value !== 'string') return String(value ?? '')

  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (day) {
    const date = new Date(`${value}T00:00:00Z`)
    return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  }

  const month = /^(\d{4})-(\d{2})$/.exec(value)
  if (month) {
    const date = new Date(`${value}-01T00:00:00Z`)
    return date.toLocaleDateString(undefined, { month: 'short', year: '2-digit', timeZone: 'UTC' })
  }

  /*
   * A date-time, which the API accepts and publishes as UTC.
   *
   * This fell through to the branch below and returned the string, so a series
   * keyed on timestamps drew `2026-08-07T00:00:00Z` under every point. No
   * Peniremit endpoint returns one today, which is the only reason nobody has
   * seen it.
   *
   * Two kinds of value arrive this way and they want opposite treatment.
   *
   * **UTC midnight is a day**, not a moment — it is how a daily series names
   * its buckets. Formatted in UTC like the branches above, because converting
   * it would slide every label a day backwards for every reader west of
   * Greenwich: a point the publisher calls 7 August would be drawn under
   * 6 August in Lagos-minus-anything.
   *
   * **Anything else is an instant**, and the whole point of publishing it as
   * UTC is that each reader converts it to their own. Shown with its time,
   * since an hourly series would otherwise draw the same label twenty-four
   * times over.
   *
   * The first version tested local midnight, which is almost never UTC
   * midnight — so every daily label carried a spurious `1:00 AM`.
   */
  const instant = new Date(value)
  if (!Number.isNaN(instant.getTime()) && /\d{2}:\d{2}/.test(value)) {
    const marksADay = instant.getUTCHours() === 0 && instant.getUTCMinutes() === 0
    return marksADay
      ? instant.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
      : instant.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })
  }

  return value
}

export function formatDelta(fraction: number): string {
  const sign = fraction > 0 ? '+' : ''
  return `${sign}${percent.format(fraction)}`
}
