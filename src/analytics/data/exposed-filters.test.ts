/**
 * Exposed filters — FR-VZ-06, and the constraint that makes them safe.
 *
 * Merge Plan Stage 6.1. An Author chooses which of a Dataset's Fields a Viewer
 * may filter on and reorder by, and the whole feature turns on one rule holding
 * in the *right place*:
 *
 *   **A Widget cannot overrule the publisher.**
 *
 * FR-DP-05 lets a Source System declare a Field un-filterable. `WidgetFilters`
 * only offers the ones that are, but the control and the query are different
 * code, and a rule enforced only where it is displayed survives exactly until
 * someone adds a second way to set it — a saved board with a hand-edited spec, a
 * host driving the reducer directly, a Control in Stage 6.3. So `queryFor` checks
 * again, and these are the tests of *that* check rather than of the dropdown.
 */

import { describe, expect, test } from 'bun:test'
import { queryFor, rowsForWidget, type ViewerChoices } from './query'
import { requireDataset, rowsFor } from './datasets'
import type { WidgetSpec } from '../widgets/Widget'

const regions = requireDataset('sales-by-region')

const bars = (extra: Partial<WidgetSpec> = {}): WidgetSpec => ({
  id: 'w',
  typeId: 'bar-chart-vertical',
  datasetId: 'sales-by-region',
  mapping: { x: 'region', series: ['revenue'] },
  ...extra,
})

const someRegion = String(rowsFor('sales-by-region')[0].region)

describe('a filter the Author exposed is honoured', () => {
  const spec = bars({ exposedFilters: ['region'] })
  const choices: ViewerChoices = { filters: { region: someRegion } }

  test('it reaches the query', () => {
    expect(queryFor(spec, regions, choices).parameters).toEqual({ region: someRegion })
  })

  test('and it narrows what comes back', () => {
    const all = rowsForWidget(spec, regions)
    const narrowed = rowsForWidget(spec, regions, choices)

    expect(narrowed.length).toBeLessThan(all.length)
    expect(narrowed.every((row) => row.region === someRegion)).toBe(true)
  })
})

describe('a Widget cannot overrule the publisher', () => {
  test('a filter the Author never exposed is dropped', () => {
    // A spec can be hand-edited, restored from storage, or built by a host. The
    // Author's choice is a constraint on the Viewer, not a suggestion.
    const spec = bars({ exposedFilters: [] })
    expect(queryFor(spec, regions, { filters: { region: someRegion } }).filters).toBeUndefined()
  })

  test('a filter on a Field the publisher withheld is dropped', () => {
    /*
     * The load-bearing case. `revenue` is a Measure, and `publishField` marks
     * Measures un-filterable, so even an Author who somehow listed it cannot
     * turn it into a filter — FR-DP-05 binds the Author too.
     */
    const revenue = regions.fields.find((field) => field.key === 'revenue')!
    expect(revenue.filterable).toBe(false)

    const spec = bars({ exposedFilters: ['revenue'] })
    expect(queryFor(spec, regions, { filters: { revenue: 1 } }).filters).toBeUndefined()
  })

  test('a sort on a Field that was not exposed is dropped', () => {
    const spec = bars({ exposedSorts: [] })
    const query = queryFor(spec, regions, {
      sort: { field: 'revenue', direction: 'descending' },
    })
    expect(query.sort).toBeUndefined()
  })

  test('an exposed sort is honoured and replaces the widget’s own ordering', () => {
    const spec = bars({ exposedSorts: ['revenue'] })
    const rows = rowsForWidget(spec, regions, {
      sort: { field: 'revenue', direction: 'descending' },
    })
    const values = rows.map((row) => Number(row.revenue))

    expect(values).toEqual([...values].sort((a, b) => b - a))
  })
})

describe('an empty choice is not a filter', () => {
  const spec = bars({ exposedFilters: ['region'] })

  test('"All" narrows nothing', () => {
    // The select's placeholder value. Passing it through would filter for the
    // literal empty string and return nothing at all — an empty card where the
    // Viewer expected everything.
    expect(queryFor(spec, regions, { filters: { region: '' } }).filters).toBeUndefined()
    expect(rowsForWidget(spec, regions, { filters: { region: '' } })).toHaveLength(
      rowsFor('sales-by-region').length,
    )
  })

  test('no choices at all is the Author’s widget, unchanged', () => {
    expect(queryFor(spec, regions, {})).toEqual(queryFor(spec, regions))
  })
})

describe('filters compose with what the widget already asked for', () => {
  test('a stat card still aggregates, over the narrowed rows', () => {
    /*
     * The composition that would be easy to break: applying a filter by
     * replacing the query rather than adding to it drops the roll-up, and the
     * card silently shows one month instead of the year.
     */
    const spec: WidgetSpec = {
      id: 'w',
      typeId: 'stat-card',
      datasetId: 'sales-by-region',
      mapping: { value: 'revenue' },
      exposedFilters: ['region'],
    }

    const query = queryFor(spec, regions, { filters: { region: someRegion } })
    expect(query.measures).toEqual([{ field: 'revenue', aggregation: 'sum' }])
    // A Viewer's exposed choice is a Filter Parameter — what the endpoint is
    // asked — rather than a column filter applied over returned rows.
    expect(query.parameters).toEqual({ region: someRegion })

    const rows = rowsForWidget(spec, regions, { filters: { region: someRegion } })
    expect(rows).toHaveLength(1)

    const expected = rowsFor('sales-by-region')
      .filter((row) => row.region === someRegion)
      .reduce((total, row) => total + Number(row.revenue), 0)

    expect(Number(rows[0].revenue)).toBe(expected)
  })

  test('a series keeps its time ordering while filtered', () => {
    const daily = requireDataset('revenue-daily')
    const spec: WidgetSpec = {
      id: 'w',
      typeId: 'line-chart',
      datasetId: 'revenue-daily',
      mapping: { x: 'date', series: ['revenue'] },
      exposedSorts: [],
    }

    expect(queryFor(spec, daily, {}).sort).toEqual([
      { field: 'date', direction: 'ascending' },
    ])
  })
})
