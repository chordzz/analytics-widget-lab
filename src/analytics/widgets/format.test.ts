/**
 * Time labels, and the two kinds of value that arrive as a date-time.
 *
 * A date-time fell through every branch and rendered as the raw string, so a
 * series keyed on timestamps would have drawn `2026-08-07T00:00:00Z` under
 * every point. No Peniremit endpoint returns one today, which is the only
 * reason nobody had seen it.
 */

import { describe, expect, test } from 'bun:test'
import { formatTimeLabel } from './format'

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
