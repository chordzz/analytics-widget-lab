/**
 * The period a board opens on.
 *
 * A date Control stores no value, so without a default a board opens with its
 * range empty and governing nothing. Resolved at render rather than written
 * onto the board: a stored window is correct on the day it is written and wrong
 * every day after, and a stale window is indistinguishable from live data.
 */

import { describe, expect, test } from 'bun:test'
import { defaultPeriod, today } from './default-period'

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
