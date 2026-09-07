/**
 * One figure, however the rows arrived — D22.
 *
 * A stat card, a threshold indicator and an alert banner each show a single
 * number and each asks the query for it. The deployed API is a proxy: it
 * forwards to the Source System and relays the body verbatim, so `measures` may
 * be ignored and the whole column may come back instead.
 *
 * The property under test is that this cannot change the number. If the answer
 * arrives aggregated we use it; if it does not we aggregate here, with the
 * aggregation the publisher declared — the same one the query asked for. Two
 * implementations of "sum" is the divergent-definition failure the capability
 * exists to remove, and one of them being in a view layer is how it comes back.
 */

import { describe, expect, test } from 'bun:test'
import { aggregationFor, queryFor, singleValueOf } from './query'
import { requireDataset, rowsFor } from './datasets'
import { executeQuery } from '../../retrieval/aggregate'
import type { WidgetSpec } from '../widgets/Widget'

const monthly = requireDataset('revenue-monthly')
const health = requireDataset('service-health')

const statCard: WidgetSpec = {
  id: 'total',
  typeId: 'stat-card',
  datasetId: 'revenue-monthly',
  mapping: { value: 'revenue' },
}

const uptime: WidgetSpec = {
  id: 'uptime',
  typeId: 'threshold-indicator',
  datasetId: 'service-health',
  mapping: { value: 'uptime' },
}

/** What a pass-through Source System returns: the column, unaggregated. */
const passthrough = (datasetId: string) => rowsFor(datasetId)

/** What an aggregating one returns: the query, honoured. */
const aggregated = (spec: WidgetSpec, dataset: Parameters<typeof queryFor>[1]) =>
  executeQuery(rowsFor(dataset.id), queryFor(spec, dataset))

describe('the figure does not depend on who aggregated', () => {
  test('a sum is the same either way', () => {
    const honoured = singleValueOf(statCard, monthly, aggregated(statCard, monthly), 'revenue')
    const ignored = singleValueOf(statCard, monthly, passthrough('revenue-monthly'), 'revenue')

    expect(honoured).toBe(ignored)
  })

  test('an average is the same either way', () => {
    // `uptime` declares `average`, because summing it across nine services gives
    // 890% — a number that does not exist.
    expect(aggregationFor(health, 'uptime')).toBe('average')

    const honoured = singleValueOf(uptime, health, aggregated(uptime, health), 'uptime')
    const ignored = singleValueOf(uptime, health, passthrough('service-health'), 'uptime')

    expect(honoured).toBeCloseTo(ignored, 12)
  })

  test('and it is the right figure, not merely a consistent one', () => {
    /*
     * The discriminating assertion. Both branches agreeing on the *wrong* number
     * would satisfy the two tests above — and the bug this fixes did exactly
     * that shape of thing: it read `rows[0]`, which is a consistent answer and
     * the first month's revenue rather than the year's.
     */
    const expected = rowsFor('revenue-monthly').reduce(
      (total, row) => total + Number(row.revenue),
      0,
    )

    expect(singleValueOf(statCard, monthly, passthrough('revenue-monthly'), 'revenue')).toBe(
      expected,
    )
    expect(singleValueOf(statCard, monthly, passthrough('revenue-monthly'), 'revenue')).not.toBe(
      Number(rowsFor('revenue-monthly')[0].revenue),
    )
  })
})

describe('the publisher decides the roll-up, not the widget', () => {
  test('an average is never summed, however many rows arrive', () => {
    const rows = passthrough('service-health')
    const value = singleValueOf(uptime, health, rows, 'uptime')

    // Every uptime is a fraction under 1. A sum of nine of them clears 8; an
    // average cannot leave the range of its own inputs.
    expect(value).toBeLessThanOrEqual(1)
    expect(value).toBeGreaterThan(0.9)
  })

  test('an override the publisher did not declare is ignored', () => {
    // FR-DP-04 is the constraint, and obeying the widget instead would let a
    // board total a percentage.
    const forced: WidgetSpec = { ...uptime, options: { aggregation: 'sum' } }
    const rows = passthrough('service-health')

    expect(singleValueOf(forced, health, rows, 'uptime')).toBeLessThanOrEqual(1)
  })

  test('an override the publisher did declare is honoured', () => {
    const declared = health.fields.find((field) => field.key === 'uptime')
    expect(declared?.role).toBe('measure')

    const alternative = declared?.role === 'measure' ? declared.aggregations[1] : undefined
    if (alternative === undefined) return

    const chosen: WidgetSpec = { ...uptime, options: { aggregation: alternative } }
    expect(aggregationFor(health, 'uptime', alternative)).toBe(alternative)
    expect(Number.isFinite(singleValueOf(chosen, health, passthrough('service-health'), 'uptime'))).toBe(
      true,
    )
  })
})

describe('edges', () => {
  test('no rows is not a zero', () => {
    // A zero and a nothing are different claims about the world, and a card
     // showing 0 where it has no data is the more damaging of the two.
    expect(singleValueOf(statCard, monthly, [], 'revenue')).toBeNaN()
  })

  test('one row is taken as given, whatever it holds', () => {
    // The aggregated case. Re-aggregating a single row would be harmless here
    // and wrong for `count`, which would answer 1 for any input.
    expect(singleValueOf(statCard, monthly, [{ revenue: 42 }], 'revenue')).toBe(42)
  })

  test('a non-numeric value does not poison the aggregate', () => {
    /*
     * A Source System declaring `number` and sending `"1,234.50"` is the failure
     * §3 of the widget contract asks them to avoid. It is not ours to prevent,
     * so the least bad behaviour is to skip what cannot be read rather than
     * return NaN for the whole card — one absent service should not blank a
     * fleet-wide figure.
     */
    const rows = [{ revenue: 10 }, { revenue: '1,234.50' }, { revenue: 20 }]
    expect(singleValueOf(statCard, monthly, rows, 'revenue')).toBe(30)
  })

  test('a column of nothing but unreadable values is not a zero', () => {
    /*
     * Written first with `toBe(0)`, which is what the code did and what an
     * empty sum returns. The title was the honest half: a confident `0` claims
     * the figure *is* zero, when we only failed to read it. The card should say
     * it has no data.
     */
    const rows = [{ revenue: 'n/a' }, { revenue: '—' }]
    expect(singleValueOf(statCard, monthly, rows, 'revenue')).toBeNaN()
  })
})
