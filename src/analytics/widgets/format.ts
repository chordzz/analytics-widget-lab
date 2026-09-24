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
/**
 * A money formatter per currency, built once and kept.
 *
 * `currencyDisplay: 'narrowSymbol'` is what gives `$31` and `₦31` rather than
 * `US$31` and `NGN 31`. The default picks a display that disambiguates for the
 * *reader's* locale, which is right for a page that might mean either dollar
 * and wrong on a card that has just told you which currency it is in.
 */
const moneyCache = new Map<string, Intl.NumberFormat>()

const moneyFor = (currency: string, compactly: boolean): Intl.NumberFormat => {
  const key = `${currency}:${String(compactly)}`
  const cached = moneyCache.get(key)
  if (cached) return cached

  let made: Intl.NumberFormat
  try {
    made = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      ...(compactly ? { notation: 'compact' as const, maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }),
    })
  } catch {
    // An unknown code throws rather than degrading, and a card drawing nothing
    // is worse than one drawing a plain number.
    made = compactly ? compact : plain
  }
  moneyCache.set(key, made)
  return made
}

/** `currency:ngn` → `NGN`; a bare `currency` → dollars, as it always did. */
const currencyOf = (format: string): string => {
  const marker = format.indexOf(':')
  return marker === -1 ? 'USD' : format.slice(marker + 1).toUpperCase()
}
const percent = new Intl.NumberFormat(undefined, { style: 'percent', maximumFractionDigits: 1 })
/*
 * Two decimals, because a publisher sending `66.67` chose them. Rounding to
 * `66.7%` throws away a digit they went to the trouble of computing, and a
 * success rate is exactly the figure someone reads to two places.
 */
const percentPoints = new Intl.NumberFormat(undefined, {
  style: 'percent',
  maximumFractionDigits: 2,
})

export function formatValue(value: unknown, format: ValueFormat = 'number'): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value !== 'number') return String(value)

  if (format.startsWith('currency')) {
    const currency = currencyOf(format)
    return moneyFor(currency, Math.abs(value) >= 10_000).format(value)
  }

  switch (format) {
    case 'percent':
      return percent.format(value)
    // Already a percentage, so it is divided back before `Intl` multiplies it.
    case 'percent-points':
      return percentPoints.format(value / 100)
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
  // An axis stays at one place; the tick is for orientation, not precision.
  if (format === 'percent-points') return percent.format(value / 100)
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
