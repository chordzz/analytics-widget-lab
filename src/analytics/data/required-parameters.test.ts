/**
 * Required Filter Parameters — D24, the half a Widget cannot exist without.
 *
 * A required parameter is not a filter left unset. The Source System has said it
 * cannot answer without one, so an unbound Widget is not a Widget showing
 * everything — it is a query that will be refused, and the refusal arrives as a
 * validation error nobody can trace back to a missing parameter.
 *
 * Three properties, each preventing a different silent failure:
 *
 *   - a binding reaches the query, every time, under every other choice
 *   - a binding naming an undeclared parameter is dropped, not sent
 *   - a binding survives the board round trip
 */

import { describe, expect, test } from 'bun:test'
import { boundParameters, queryFor, unboundRequirements } from './query'
import { requireDataset } from './datasets'
import { dashboardInputFrom, boardFrom, type ApiDashboard } from '../../dashboard/api-dashboard'
import { upstreamParameters } from '../../retrieval/http-retrieval'
import type { WidgetSpec } from '../widgets/Widget'
import type { Board } from '../builder/boards'
import { datasetFrom } from '../../catalogue/api-dataset'
import { asEndpoint, executeQuery } from '../../retrieval/aggregate'

const transactions = requireDataset('transactions')
const regions = requireDataset('sales-by-region')

const histogram = (overrides: Partial<WidgetSpec> = {}): WidgetSpec => ({
  id: 'w1',
  typeId: 'histogram',
  datasetId: 'transactions',
  title: 'Amounts',
  mapping: { value: 'amount' },
  ...overrides,
})

describe('a bound parameter reaches the query', () => {
  test('it appears in the parameters, not the filters', () => {
    const spec = histogram({ parameterBindings: { channel: 'Card' } })
    expect(queryFor(spec, transactions).parameters).toMatchObject({ channel: 'Card' })
  })

  test('and it reaches the wire', () => {
    // The whole point. A binding that stops at the query object is a binding the
    // Source System never sees.
    const spec = histogram({ parameterBindings: { channel: 'Card' } })
    expect(upstreamParameters(queryFor(spec, transactions))).toMatchObject({ channel: 'Card' })
  })

  test('a Viewer narrowing the same Field still leaves a value', () => {
    /*
     * A Viewer may override a binding — it is the Author's floor, not a lock —
     * because overriding still supplies a value, so the parameter is never lost
     * by being narrowed. Losing it would turn a working widget into a rejected
     * query the moment someone used a filter.
     */
    const spec = histogram({
      parameterBindings: { channel: 'Card' },
      exposedFilters: ['channel'],
    })
    const query = queryFor(spec, transactions, { filters: { channel: 'Transfer' } })
    expect(query.parameters?.channel).toBe('Transfer')
  })

  test('a Control on an unrelated Field does not displace it', () => {
    const spec = histogram({ parameterBindings: { channel: 'Card' } })
    const query = queryFor(spec, transactions, undefined, {
      timeRange: { field: 'date', from: '2026-01-01' },
    })
    expect(query.parameters?.channel).toBe('Card')
  })
})

describe('a binding is reduced to what the publisher declared', () => {
  test('an undeclared parameter is dropped', () => {
    /*
     * Same enforcement pattern as `permitted`: the form that collected the value
     * and the query that sends it are different code. And the consequence here
     * is worse than a dropped filter — the API refuses undeclared parameters
     * before the request leaves, so passing one on fails the *whole* query.
     */
    const spec = histogram({ parameterBindings: { channel: 'Card', nonsense: 'x' } })
    expect(boundParameters(spec, transactions)).toEqual({ channel: 'Card' })
  })

  test('an empty value is not a binding', () => {
    // An untouched select, not a choice. Sending `?channel=` is a filter value
    // the Source System has to reject.
    const spec = histogram({ parameterBindings: { channel: '' } })
    expect(boundParameters(spec, transactions)).toEqual({})
  })

  test('a Dataset that requires nothing is unaffected', () => {
    const spec: WidgetSpec = {
      id: 'w2',
      typeId: 'bar-chart-vertical',
      datasetId: 'sales-by-region',
      mapping: { x: 'region', series: ['revenue'] },
    }
    expect(queryFor(spec, regions).parameters).toBeUndefined()
  })
})

describe('what is still unbound is nameable', () => {
  test('an unbound requirement is reported', () => {
    expect(unboundRequirements(histogram(), transactions).map((p) => p.name)).toEqual(['channel'])
  })

  test('a bound one is not', () => {
    const spec = histogram({ parameterBindings: { channel: 'Card' } })
    expect(unboundRequirements(spec, transactions)).toEqual([])
  })

  test('a Dataset with no requirements has none', () => {
    expect(unboundRequirements(histogram(), regions)).toEqual([])
  })
})

describe('a binding survives the board round trip', () => {
  const board = (): Board => ({
    id: 'b1',
    name: 'Payments',
    description: '',
    authorId: 'u1',
    scope: { kind: 'personal' },
    shareGrants: [],
    status: 'draft',
    updated: '2026-09-15',
    widgets: {
      w1: histogram({ parameterBindings: { channel: 'Card' } }),
    },
    placements: [{ widgetId: 'w1', x: 0, y: 0, w: 6, h: 4 }],
    controls: [],
    sections: [],
  })

  test('it is sent', () => {
    /*
     * The failure this prevents is the one Share Grants already had: a value
     * collected in the composer, held in memory, and never put in the payload —
     * so it looks saved, and comes back gone.
     */
    const sent = dashboardInputFrom(board())
    expect(JSON.stringify(sent.widgets[0].presentation_options)).toContain('Card')
  })

  test('and it comes back', () => {
    const sent = dashboardInputFrom(board())
    const returned = boardFrom({ id: 'srv-1', ...sent } as unknown as ApiDashboard, 'u1')
    const widget = Object.values(returned.widgets)[0]
    expect(widget.parameterBindings).toEqual({ channel: 'Card' })
  })

  test('a widget without bindings does not gain an empty one', () => {
    // An empty object and an absent key both mean "nothing bound", but only one
    // of them makes the payload differ from the baseline and triggers a PATCH.
    const plain = board()
    plain.widgets.w1 = histogram()
    const sent = dashboardInputFrom(plain)
    expect(JSON.stringify(sent.widgets[0].presentation_options)).not.toContain('parameterBindings')
  })
})

describe('a parameter is not a column', () => {
  /*
   * The bug this separation exists for, and it was live: `peniremit.profit`
   * takes `from` and `to`, neither of which is a column it returns. With both
   * in `filters`, the local pass compared `row['from']` — which does not exist
   * — against a date and dropped every row the endpoint had just returned. A
   * widget bound to a real Dataset would have rendered *empty*, with the API
   * answering correctly on the wire.
   *
   * Masked until now by a 403 on the only Dataset that has required parameters.
   */
  const profit = datasetFrom({
    id: 'peniremit.profit',
    name: 'Profit',
    source_system_id: 'peniremit',
    time_dimension_field: 'date',
    fields: [
      { key: 'date', label: 'Date', type: 'date', role: 'dimension', filterable: true, orderable: true },
      { key: 'usd', label: 'USD', type: 'number', role: 'measure', aggregations: ['sum'], filterable: false, orderable: true },
    ],
    filter_parameters: [
      { name: 'from', type: 'date', required: true },
      { name: 'to', type: 'date', required: true },
    ],
  } as Parameters<typeof datasetFrom>[0])

  const bound: WidgetSpec = {
    id: 'w1',
    typeId: 'line-chart',
    datasetId: 'peniremit.profit',
    mapping: { x: 'date', series: ['usd'] },
    parameterBindings: { from: '2026-09-01', to: '2026-09-16' },
  }

  test('bindings land in parameters, never in filters', () => {
    const query = queryFor(bound, profit)
    expect(query.parameters).toEqual({ from: '2026-09-01', to: '2026-09-16' })
    expect(query.filters).toBeUndefined()
  })

  test('and the rows the endpoint returned survive the local pass', () => {
    // The whole point. `executeQuery` compares `row[key] === value`, so a key
    // that is not a column matches nothing and empties the result.
    const rows = [
      { date: '2026-09-02', usd: 10 },
      { date: '2026-09-03', usd: 20 },
    ]
    expect(executeQuery(rows, queryFor(bound, profit))).toHaveLength(2)
  })

  test('a fixture applies them itself, because it is the endpoint', () => {
    /*
     * The other half. Against a real Source System the parameters have already
     * been applied by the time rows arrive; a fixture has nothing behind it, so
     * `asEndpoint` does what the endpoint would have done.
     */
    const rows = [{ channel: 'Card', amount: 1 }, { channel: 'Transfer', amount: 2 }]
    const query = { parameters: { channel: 'Card' } }
    expect(executeQuery(rows, query)).toHaveLength(2)
    expect(executeQuery(rows, asEndpoint(query))).toHaveLength(1)
  })
})

describe('a Control reaches the endpoint only under names it declared', () => {
  const withParameters = (names: string[]) =>
    datasetFrom({
      id: 'd',
      name: 'D',
      source_system_id: 'p',
      time_dimension_field: 'date',
      fields: [
        { key: 'date', label: 'Date', type: 'date', role: 'dimension', filterable: true, orderable: true },
        { key: 'usd', label: 'USD', type: 'number', role: 'measure', aggregations: ['sum'], filterable: false, orderable: true },
      ],
      filter_parameters: names.map((name) => ({ name, type: 'date' })),
    } as Parameters<typeof datasetFrom>[0])

  const spec: WidgetSpec = {
    id: 'w1',
    typeId: 'line-chart',
    datasetId: 'd',
    mapping: { x: 'date', series: ['usd'] },
  }

  const range = { timeRange: { field: 'date', from: '2026-08-01', to: '2026-08-31' } }

  test('a Dataset declaring from and to gets both', () => {
    expect(queryFor(spec, withParameters(['from', 'to']), undefined, range).parameters).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    })
  })

  test('one declaring neither gets nothing rather than a 400', () => {
    /*
     * This used to be written out unconditionally, on the guess that every
     * Dataset spells a range that way. An undeclared parameter is refused
     * before the request leaves — so the guess did not cost one filter, it
     * failed the whole query.
     */
    expect(queryFor(spec, withParameters(['start', 'end']), undefined, range).parameters).toBeUndefined()
  })

  test('one declaring only `from` sends only that', () => {
    expect(queryFor(spec, withParameters(['from']), undefined, range).parameters).toEqual({
      from: '2026-08-01',
    })
  })

  test('the range still narrows locally either way', () => {
    // `timeRange` survives for the local pass, which is what keeps a fixture —
    // and the post-fetch narrowing — working when the names do not match.
    const query = queryFor(spec, withParameters(['start', 'end']), undefined, range)
    expect(query.timeRange).toEqual(range.timeRange)
  })
})
