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
  test('it appears in the filters', () => {
    const spec = histogram({ parameterBindings: { channel: 'Card' } })
    expect(queryFor(spec, transactions).filters).toMatchObject({ channel: 'Card' })
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
    expect(query.filters?.channel).toBe('Transfer')
  })

  test('a Control on an unrelated Field does not displace it', () => {
    const spec = histogram({ parameterBindings: { channel: 'Card' } })
    const query = queryFor(spec, transactions, undefined, {
      timeRange: { field: 'date', from: '2026-01-01' },
    })
    expect(query.filters?.channel).toBe('Card')
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
    expect(queryFor(spec, regions).filters).toBeUndefined()
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
