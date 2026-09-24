/**
 * Time labels, and the two kinds of value that arrive as a date-time.
 *
 * A date-time fell through every branch and rendered as the raw string, so a
 * series keyed on timestamps would have drawn `2026-08-07T00:00:00Z` under
 * every point. No Peniremit endpoint returns one today, which is the only
 * reason nobody had seen it.
 */

import { describe, expect, test } from 'bun:test'
import { formatAxis, formatTimeLabel, formatValue } from './format'

describe('a date names a day', () => {
  test('and is read as one', () => {
    expect(formatTimeLabel('2026-08-07')).toBe('Aug 7')
  })

  test('a month is read as a month', () => {
    expect(formatTimeLabel('2026-08')).toContain('Aug')
  })
})

describe('a date-time', () => {
  test('at UTC midnight is a day marker, and keeps its day', () => {
    /*
     * How a daily series names its buckets. Converting it to the reader's zone
     * would slide every label a day backwards for everyone west of Greenwich —
     * a point the publisher calls 7 August drawn under 6 August.
     */
    expect(formatTimeLabel('2026-08-07T00:00:00Z')).toBe('Aug 7')
  })

  test('at any other time is an instant, and carries one', () => {
    // An hourly series would otherwise draw the same label twenty-four times.
    const label = formatTimeLabel('2026-08-07T14:30:00Z')
    expect(label).toContain('Aug')
    expect(label).toMatch(/\d{1,2}:\d{2}/)
  })

  test('never renders as the raw string', () => {
    // The bug itself.
    for (const value of ['2026-08-07T00:00:00Z', '2026-08-07T14:30:00Z', '2026-08-07T23:59:59.999Z']) {
      expect(formatTimeLabel(value)).not.toBe(value)
    }
  })
})

describe('anything else is left alone', () => {
  test('a string that is not a time', () => {
    // Better an unformatted label than an invented date.
    expect(formatTimeLabel('Q3')).toBe('Q3')
    expect(formatTimeLabel('not-a-date')).toBe('not-a-date')
  })

  test('and a missing value is empty rather than "undefined"', () => {
    expect(formatTimeLabel(undefined)).toBe('')
    expect(formatTimeLabel(null)).toBe('')
  })
})

/*
 * Money in the currency it is actually in.
 *
 * The formatter was a single USD instance, so every figure drew as dollars —
 * and `Intl`'s default `currencyDisplay` picks a form that disambiguates for
 * the *reader's* locale, which is why it read `US$31`. That is the right call
 * for a page that might mean either dollar and the wrong one on a card that has
 * just said which currency it is in.
 */
describe('money', () => {
  test('is drawn with the narrow symbol of its own currency', () => {
    expect(formatValue(31, 'currency:usd')).toBe('$31')
    expect(formatValue(31, 'currency:ngn')).toBe('₦31')
  })

  test('which matters most once a Viewer can switch', () => {
    // A naira total drawn with a dollar sign is a wrong number wearing the
    // right shape, and switching currency is one click away.
    expect(formatValue(1_420_000_000, 'currency:ngn')).toBe('₦1.4B')
    expect(formatValue(1_420_000_000, 'currency:usd')).toBe('$1.4B')
  })

  test('an unnamed currency still reads as money', () => {
    // Boards written before the code was carried, and fixtures that state only
    // that a figure is money.
    expect(formatValue(31, 'currency')).toBe('$31')
  })

  test('and an unrecognised code degrades rather than throwing', () => {
    // A card drawing nothing is worse than one drawing a plain number.
    expect(() => formatValue(31, 'currency:zzz' as never)).not.toThrow()
  })
})

/*
 * Percentages, and the two conventions a publisher may be using.
 *
 * Nothing in the declaration says which, and the two are indistinguishable from
 * a single value — `0.5` is either half a percent or a half. Peniremit sends
 * points, which their own sample proves: `value: 1420, delta: 28,
 * changePercent: 2.01`, and 28/1392 is 2.01%.
 *
 * Read as a fraction, `66.67` drew as `6,667%` where the answer was `66.67%` —
 * a wrong number, confidently, which is the worst shape a formatting bug takes.
 */
describe('percentages', () => {
  test('a fraction is scaled up', () => {
    expect(formatValue(0.0201, 'percent')).toBe('2%')
  })

  test('and a figure already in points is not', () => {
    expect(formatValue(66.67, 'percent-points')).toBe('66.67%')
    expect(formatValue(2.01, 'percent-points')).toBe('2.01%')
  })

  test('to the precision the publisher sent', () => {
    /*
     * Two places, because a publisher sending `66.67` chose them. Rounding to
     * `66.7%` throws away a digit they computed, and a success rate is exactly
     * the figure someone reads to two places.
     */
    expect(formatValue(66.67, 'percent-points')).not.toBe('66.7%')
  })

  test('a movement in points keeps its sign and its unit', () => {
    // It drew as a bare `-26.77` beneath a figure reading `66.67%` — the same
    // number said two ways, and one of them wrong.
    expect(formatValue(-26.77, 'percent-points')).toBe('-26.77%')
  })

  test('an axis stays at one place, because a tick is for orientation', () => {
    expect(formatAxis(66.67, 'percent-points')).toBe('66.7%')
  })
})
