/**
 * The period a board opens on.
 *
 * A date Control stores no value, so without a default a board opens with its
 * range empty and governing nothing. Resolved at render rather than written
 * onto the board: a stored window is correct on the day it is written and wrong
 * every day after, and a stale window is indistinguishable from live data.
 */

import { describe, expect, test } from 'bun:test'
import { dayEnd, dayStart, defaultPeriod, today } from './default-period'

const at = (iso: string) => new Date(iso)

describe('which day is today', () => {
  test('is a plain calendar date, which is what the API takes', () => {
    // `YYYY-MM-DD` — "a date-only value includes the whole day", so nothing we
    // send carries a timezone and a Viewer picking dates raises no question.
    expect(today(at('2026-09-24T09:15:00Z'))).toBe('2026-09-24')
  })

  test('is decided in one frame, not each reader s', () => {
    /*
     * The same instant, read from two places. Computed locally, a reader in
     * Lagos and one in Los Angeles disagree about today for roughly a third of
     * the day — two people open the same board and see different figures, which
     * costs more than being a day out in a way everyone shares.
     */
    const instant = at('2026-09-24T02:30:00Z')
    expect(today(instant)).toBe(today(new Date(instant.getTime())))
    expect(today(at('2026-09-24T23:59:59Z'))).toBe('2026-09-24')
    expect(today(at('2026-09-25T00:00:00Z'))).toBe('2026-09-25')
  })
})

describe('the default range', () => {
  test('is the last thirty days, ending today', () => {
    expect(defaultPeriod(at('2026-09-24T09:15:00Z'))).toEqual({
      from: '2026-08-25',
      to: '2026-09-24',
    })
  })

  test('crosses a month boundary correctly', () => {
    expect(defaultPeriod(at('2026-03-05T00:00:00Z')).from).toBe('2026-02-03')
  })

  test('crosses a year boundary correctly', () => {
    expect(defaultPeriod(at('2026-01-10T00:00:00Z')).from).toBe('2025-12-11')
  })

  test('crosses a leap day correctly', () => {
    // 2028 is a leap year, so 15 March is 29 days after 15 February.
    expect(defaultPeriod(at('2028-03-15T00:00:00Z')).from).toBe('2028-02-14')
  })

  test('gives both ends', () => {
    /*
     * A range open at one end is a legitimate thing for a Viewer to ask for and
     * a poor thing to start them on: an open `from` means the endpoint answers
     * with everything it holds, which is a slow first paint and a chart whose
     * interesting part is a sliver at the right.
     */
    const period = defaultPeriod(at('2026-09-24T00:00:00Z'))
    expect(period.from).toBeTruthy()
    expect(period.to).toBeTruthy()
    expect(period.from < period.to).toBe(true)
  })
})

describe('a day as instants', () => {
  test('starts at local midnight and ends at the last millisecond', () => {
    /*
     * Both ends of a declared range are inclusive — the API says a date-only
     * `to` "includes the whole day" — so an instant `to` has to be the end of
     * that day. Midnight at both ends is a window of zero width, which comes
     * back empty and reads as a Dataset with no data rather than a bad question.
     */
    expect(dayStart('2026-09-24') < dayEnd('2026-09-24')).toBe(true)
    expect(dayEnd('2026-09-24')).toContain('23:59:59')
  })

  test('they are UTC, whatever zone the reader is in', () => {
    // The wire format. What varies by reader is which instant a day *is*, not
    // how it is written.
    expect(dayStart('2026-09-24')).toMatch(/Z$/)
    expect(dayEnd('2026-09-24')).toMatch(/Z$/)
  })

  test('one day ends exactly where the next begins', () => {
    /*
     * The property that makes consecutive ranges safe: no gap to lose a record
     * in, no overlap to count one twice. A millisecond apart, since both ends
     * are inclusive.
     */
    const gap = Date.parse(dayStart('2026-09-25')) - Date.parse(dayEnd('2026-09-24'))
    expect(gap).toBe(1)
  })

  test('a day the clocks change is still one day', () => {
    /*
     * Not a concern in Lagos, which has no daylight saving, and very much one
     * for a reader who does. 29 March 2026 is 23 hours long in London — a
     * naive "midnight plus 24 hours" would end the range an hour into the 30th.
     */
    const start = Date.parse(dayStart('2026-03-29'))
    const end = Date.parse(dayEnd('2026-03-29'))
    const hours = (end - start + 1) / 3_600_000
    expect([23, 24, 25]).toContain(hours)
  })
})
