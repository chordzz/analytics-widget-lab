/**
 * Dashboard Controls, as the module wires them — FR-CO-05, FR-CO-06.
 *
 * Merge Plan Stage 6.3. `composition/correspondence.ts` has its own tests for
 * the *rules*; these are about the module's side of them, which is three
 * properties that are easy to lose in the wiring:
 *
 *   - a Control reaches a Widget through its bound **Dataset**, never a list of
 *     Widget ids, so adding a Widget brings it under an existing Control
 *   - a Control that does not reach a Widget leaves it *exactly* as it was
 *   - where a Control and a Widget's own exposed filter collide, the Widget wins
 */

import { describe, expect, test } from 'bun:test'
import { contributionFor, resolveControlReach } from '../../composition/correspondence'
import { dateRangeControl } from '../../domain/composition'
import { controlSubjectFor, queryFor, rowsForWidget } from './query'
import { requireDataset, rowsFor } from './datasets'
import type { WidgetSpec } from '../widgets/Widget'
import type { Dataset } from './types'

const daily = requireDataset('revenue-daily')
const regions = requireDataset('sales-by-region')

const trend: WidgetSpec = {
  id: 'trend',
  typeId: 'line-chart',
  datasetId: 'revenue-daily',
  title: 'Revenue',
  mapping: { x: 'date', series: ['revenue'] },
}

const bars: WidgetSpec = {
  id: 'bars',
  typeId: 'bar-chart-vertical',
  datasetId: 'sales-by-region',
  title: 'By region',
  mapping: { x: 'region', series: ['revenue'] },
}

const control = dateRangeControl('c1', 'Period')
const period = { from: '2026-01-01', to: '2026-01-31' }

const datasets: Record<string, Dataset> = {
  'revenue-daily': daily,
  'sales-by-region': regions,
}

const subject = (spec: WidgetSpec) => controlSubjectFor(spec, datasets[spec.datasetId])

const contribution = (spec: WidgetSpec) =>
  contributionFor([control], { c1: period }, subject(spec), datasets[spec.datasetId])

describe('a Control reaches a Widget through its Dataset', () => {
  test('a Widget whose Dataset has a Time Dimension is affected', () => {
    expect(contribution(trend).timeRange).toEqual({ field: 'date', ...period })
  })

  test('a Widget whose Dataset has none is untouched', () => {
    // `sales-by-region` is a Dimension and three Measures. There is nothing for
    // a date range to act on, and inventing one would silently filter a chart
    // by a field nobody chose.
    expect(contribution(bars)).toEqual({})
  })

  test('the Control names no Widgets at all', () => {
    /*
     * The property, not an implementation detail. FR-CO-06 says a Control
     * applies to every Widget whose bound Dataset supports it — so a Control
     * holding a list of Widget ids would go stale the moment one was added, and
     * this is the structural guarantee that it cannot.
     */
    expect(JSON.stringify(control)).not.toContain('trend')
    expect(JSON.stringify(control)).not.toContain('bars')
  })

  test('a Widget added later is reached with no reconfiguration', () => {
    const later: WidgetSpec = { ...trend, id: 'added-later' }
    expect(contribution(later).timeRange).toEqual({ field: 'date', ...period })
  })
})

describe('the Control says what it does not reach', () => {
  test('reach separates the affected from the unaffected, with a reason', () => {
    // FR-CO-06 has two halves and the second is "leave the others unaffected".
    // A Viewer who cannot see which those are has to guess whether an untouched
    // card is stale, filtered differently, or broken.
    const reach = resolveControlReach(control, [subject(trend), subject(bars)], datasets)

    expect(reach.affected.map((entry) => entry.widgetId)).toEqual(['trend'])
    expect(reach.unaffected.map((entry) => entry.widgetId)).toEqual(['bars'])
    expect(reach.unaffected[0].reason).toBeTruthy()
  })

  test('the reason names the missing capability, not the widget', () => {
    const reach = resolveControlReach(control, [subject(bars)], datasets)
    expect(reach.unaffected[0].reason.toLowerCase()).toContain('time')
  })
})

describe('an unreached Widget is left exactly as it was', () => {
  test('its query is byte-for-byte what it would be with no Control', () => {
    // "Unaffected" has to mean unaffected. A contribution that merged an empty
    // `timeRange` key would change the query object and re-trigger retrieval on
    // a card the Viewer was told is untouched.
    expect(queryFor(bars, regions, undefined, contribution(bars))).toEqual(
      queryFor(bars, regions),
    )
  })

  test('and it draws the same rows', () => {
    expect(rowsForWidget(bars, regions, undefined, contribution(bars))).toHaveLength(
      rowsFor('sales-by-region').length,
    )
  })
})

describe('a reached Widget is narrowed', () => {
  test('the time range reaches the query', () => {
    expect(queryFor(trend, daily, undefined, contribution(trend)).timeRange).toEqual({
      field: 'date',
      ...period,
    })
  })

  test('and it draws fewer rows', () => {
    const all = rowsForWidget(trend, daily)
    const narrowed = rowsForWidget(trend, daily, undefined, contribution(trend))

    expect(narrowed.length).toBeGreaterThan(0)
    expect(narrowed.length).toBeLessThan(all.length)
    expect(narrowed.every((row) => String(row.date) >= period.from)).toBe(true)
    expect(narrowed.every((row) => String(row.date) <= period.to)).toBe(true)
  })

  test('the widget keeps the ordering it asked for', () => {
    // A contribution narrows; it must not replace. Losing the sort here would
    // scramble a line chart's x axis whenever a Control was used.
    const query = queryFor(trend, daily, undefined, contribution(trend))
    expect(query.sort).toEqual([{ field: 'date', direction: 'ascending' }])
  })
})

describe('a Widget-level filter beats a Control on the same Field', () => {
  test('the Widget wins', () => {
    /*
     * Finding 10 — the FRD does not settle this. Both are the Viewer's choices;
     * the Widget-level one is the more specific, and silently overriding the
     * control someone just used on one card is the more surprising outcome.
     */
    const filtered: WidgetSpec = { ...bars, exposedFilters: ['region'] }
    const chosen = String(rowsFor('sales-by-region')[0].region)

    const withBoth = queryFor(
      filtered,
      regions,
      { filters: { region: chosen } },
      { filters: { region: 'Somewhere else' } },
    )

    expect(withBoth.filters).toEqual({ region: chosen })
  })

  test('a Control still reaches Fields the Widget did not claim', () => {
    // Precedence is per Field, not per widget. A Control losing every filter
    // because the Widget happened to expose an unrelated one would be a much
    // blunter rule than Finding 10 describes.
    const filtered: WidgetSpec = { ...bars, exposedFilters: ['region'] }
    const chosen = String(rowsFor('sales-by-region')[0].region)

    const withBoth = queryFor(
      filtered,
      regions,
      { filters: { region: chosen } },
      { filters: { region: 'ignored', orders: 5 } },
    )

    expect(withBoth.filters).toEqual({ region: chosen, orders: 5 })
  })
})

describe('a board with no Controls costs nothing', () => {
  test('no controls means no contribution', () => {
    expect(contributionFor([], {}, subject(trend), daily)).toEqual({})
  })

  test('a Control with no value set changes nothing', () => {
    // An empty date range is a Control an Author placed and a Viewer has not
    // used. It must not narrow anything to nothing in the meantime.
    const idle = contributionFor([control], {}, subject(trend), daily)
    expect(queryFor(trend, daily, undefined, idle)).toEqual(queryFor(trend, daily))
  })
})

describe('a date range respects the grain the data is stored at', () => {
  const monthly = requireDataset('revenue-monthly')

  const statCard: WidgetSpec = {
    id: 'total',
    typeId: 'stat-card',
    datasetId: 'revenue-monthly',
    mapping: { value: 'revenue' },
  }

  const june = { from: '2026-06-01', to: '2026-06-30' }
  const contributionOf = (spec: WidgetSpec, dataset: Dataset) =>
    contributionFor([control], { c1: june }, controlSubjectFor(spec, dataset), dataset)

  test('a month-grain Dataset is not emptied by a day-precision range', () => {
    /*
     * The defect a Control surfaced. `revenue-monthly` stores `2026-06`, and ISO
     * strings only sort correctly at equal precision — `'2026-06' >=
     * '2026-06-01'` is false, because the shorter string sorts first. So every
     * month-grain widget on a board went empty the moment anyone picked a date
     * range, which reads as "no data" rather than as a bug.
     */
    const rows = rowsForWidget(statCard, monthly, undefined, contributionOf(statCard, monthly))
    expect(rows).toHaveLength(1)
    expect(Number(rows[0].revenue)).toBeGreaterThan(0)
  })

  test('and it selects the month asked for, not every month', () => {
    const rows = rowsForWidget(statCard, monthly, undefined, contributionOf(statCard, monthly))
    const expected = rowsFor('revenue-monthly')
      .filter((row) => String(row.month) === '2026-06')
      .reduce((total, row) => total + Number(row.revenue), 0)

    expect(Number(rows[0].revenue)).toBe(expected)
  })

  test('a month outside the range is still excluded', () => {
    // The counterpart. Without it, "tolerant comparison" is satisfied by a
    // filter that matches everything.
    const may = contributionFor(
      [control],
      { c1: { from: '2026-05-01', to: '2026-05-31' } },
      controlSubjectFor(statCard, monthly),
      monthly,
    )
    const rows = rowsForWidget(statCard, monthly, undefined, may)
    const expected = rowsFor('revenue-monthly')
      .filter((row) => String(row.month) === '2026-05')
      .reduce((total, row) => total + Number(row.revenue), 0)

    expect(Number(rows[0].revenue)).toBe(expected)
  })

  test('day-grain data is unaffected by the tolerance', () => {
    const rows = rowsForWidget(trend, daily, undefined, contributionOf(trend, daily))
    expect(rows.every((row) => String(row.date) >= june.from)).toBe(true)
    expect(rows.every((row) => String(row.date) <= june.to)).toBe(true)
  })
})
