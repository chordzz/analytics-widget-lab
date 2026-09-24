/**
 * The date field, and the contract it inherits from the input it replaced.
 *
 * `input[type=date]` reads and writes `YYYY-MM-DD` whatever it displays, and
 * every caller stores that and converts it to an instant before sending. A
 * picker that emitted a locale string would fail every query with a 400 from
 * the Source System and nothing on screen to connect the two.
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { DateField } from './DateField'

const markup = (props: Partial<Parameters<typeof DateField>[0]> = {}) =>
  renderToStaticMarkup(
    <DateField label="From" value="" onChange={() => undefined} {...props} />,
  )

describe('the trigger', () => {
  test('shows a readable date when there is one', () => {
    const drawn = markup({ value: '2026-08-25' })
    expect(drawn).toContain('Aug')
    expect(drawn).toContain('2026')
  })

  test('shows the placeholder when there is not', () => {
    expect(markup({ placeholder: 'Start' })).toContain('Start')
  })

  test('announces the label, since it displays a date rather than a name', () => {
    // A screen reader hearing "25 Aug 2026" alone cannot tell which end it is.
    expect(markup({ value: '2026-08-25' })).toContain('aria-label="From: ')
  })

  test('is marked empty only when it is', () => {
    expect(markup()).toContain('--empty')
    expect(markup({ value: '2026-08-25' })).not.toContain('--empty')
  })
})

describe('values it will not accept', () => {
  test('a malformed date shows as empty rather than as itself', () => {
    // Better a placeholder than `not-a-date` rendered as though it were one.
    expect(markup({ value: 'not-a-date', placeholder: 'Any date' })).toContain('Any date')
  })

  test('a date that does not exist is rejected, not rolled forward', () => {
    /*
     * `new Date(2026, 1, 31)` is 3 March, silently. A field that accepted
     * `2026-02-31` and displayed `3 Mar` would send one date and show another.
     */
    expect(markup({ value: '2026-02-31', placeholder: 'Any date' })).toContain('Any date')
  })

  test('a date-time is not a date', () => {
    expect(markup({ value: '2026-08-25T00:00:00Z', placeholder: 'Any date' })).toContain('Any date')
  })
})

describe('rendering without a browser', () => {
  test('does not throw where `navigator` is absent', () => {
    /*
     * This crashed the whole Widget, not the calendar: `new Intl.Locale(undefined)`
     * throws, and the week-start lookup ran during render. Server rendering has
     * no `navigator`, and neither does a test.
     */
    expect(() => markup({ value: '2026-08-25' })).not.toThrow()
  })
})
