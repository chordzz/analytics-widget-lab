import { describe, expect, test } from 'bun:test'
import { executeQuery } from './aggregate'
import { FakeDatasetRetrieval, RETRIEVAL_SCENARIOS } from './fake-retrieval'
import { resolveFailure, resolveRenderState, WIDGET_RENDER_STATUSES } from './render-state'
import { fixtureRows } from '../catalogue/fixture-rows'
import type { ViewerIdentity } from './port'

const viewer: ViewerIdentity = { id: 'u1', displayName: 'Test Viewer' }
const settlements = fixtureRows['peniremit-settlements']

// --- C1: the six states ----------------------------------------------------

describe('render state resolution', () => {
  test('every outcome maps to a distinct state', () => {
    expect(resolveRenderState({ kind: 'rows', rows: [{ a: 1 }], totalCount: 1 }).status).toBe('ready')
    expect(resolveRenderState({ kind: 'empty' }).status).toBe('empty')
    expect(resolveRenderState({ kind: 'denied' }).status).toBe('denied')
    expect(resolveRenderState({ kind: 'withdrawn' }).status).toBe('withdrawn')
    expect(resolveFailure(new Error('boom')).status).toBe('failed')
  })

  test('denial is never reported as emptiness or failure', () => {
    const denied = resolveRenderState({ kind: 'denied' })
    expect(denied.status).not.toBe('empty')
    expect(denied.status).not.toBe('failed')
  })

  test('withdrawal is never reported as emptiness or failure', () => {
    const withdrawn = resolveRenderState({ kind: 'withdrawn' })
    expect(withdrawn.status).not.toBe('empty')
    expect(withdrawn.status).not.toBe('failed')
  })

  test('emptiness is never reported as failure', () => {
    expect(resolveRenderState({ kind: 'empty' }).status).not.toBe('failed')
  })

  test('a rows outcome carrying no rows is a contract breach, not emptiness', () => {
    const state = resolveRenderState({ kind: 'rows', rows: [], totalCount: 0 })
    expect(state.status).toBe('failed')
  })

  test('there are exactly six states', () => {
    expect(WIDGET_RENDER_STATUSES).toHaveLength(6)
    expect(new Set(WIDGET_RENDER_STATUSES).size).toBe(6)
  })

  test('a non-Error rejection still yields a message', () => {
    const state = resolveFailure('something went wrong')
    expect(state.status).toBe('failed')
    if (state.status !== 'failed') throw new Error('unreachable')
    expect(state.message.length).toBeGreaterThan(0)
  })
})

// --- query execution -------------------------------------------------------

describe('query execution', () => {
  test('groups by a Dimension and sums a Measure', () => {
    const rows = executeQuery(settlements, {
      dimensions: ['corridor'],
      measures: [{ field: 'settlement_value', aggregation: 'sum' }],
    })

    expect(rows).toHaveLength(3)
    const total = rows.reduce((n, r) => n + Number(r.settlement_value), 0)
    const expected = settlements.reduce((n, r) => n + Number(r.settlement_value), 0)
    expect(total).toBe(expected)
  })

  test('no Dimensions yields a single aggregate row', () => {
    const rows = executeQuery(settlements, {
      measures: [{ field: 'settlement_value', aggregation: 'sum' }],
    })
    expect(rows).toHaveLength(1)
  })

  test('average differs from sum', () => {
    const [summed] = executeQuery(settlements, {
      measures: [{ field: 'settlement_value', aggregation: 'sum' }],
    })
    const [averaged] = executeQuery(settlements, {
      measures: [{ field: 'settlement_value', aggregation: 'average' }],
    })
    expect(Number(averaged.settlement_value)).toBeLessThan(Number(summed.settlement_value))
  })

  test('distinct-count counts unique values', () => {
    const [row] = executeQuery(settlements, {
      measures: [{ field: 'corridor', aggregation: 'distinct-count' }],
    })
    expect(row.corridor).toBe(3)
  })

  test('filters restrict the rows considered', () => {
    const rows = executeQuery(settlements, {
      dimensions: ['corridor'],
      measures: [{ field: 'settlement_value', aggregation: 'sum' }],
      filters: { corridor: 'NG → GB' },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].corridor).toBe('NG → GB')
  })

  test('sorting and limiting produce a top-N', () => {
    const rows = executeQuery(settlements, {
      dimensions: ['corridor'],
      measures: [{ field: 'settlement_value', aggregation: 'sum' }],
      sort: [{ field: 'settlement_value', direction: 'descending' }],
      limit: 2,
    })
    expect(rows).toHaveLength(2)
    expect(Number(rows[0].settlement_value)).toBeGreaterThanOrEqual(
      Number(rows[1].settlement_value),
    )
  })

  test('grouping order is stable across identical queries (FR-DP-10)', () => {
    const query = {
      dimensions: ['settled_at'],
      measures: [{ field: 'settlement_value' as const, aggregation: 'sum' as const }],
    }
    expect(executeQuery(settlements, query)).toEqual(executeQuery(settlements, query))
  })

  test('a query with no Measures returns records rather than aggregates', () => {
    const rows = executeQuery(fixtureRows['accounting-journal'], {
      dimensions: ['posted_at', 'entry_reference', 'posting_state'],
    })
    expect(rows).toHaveLength(fixtureRows['accounting-journal'].length)
    expect(Object.keys(rows[0])).toEqual(['posted_at', 'entry_reference', 'posting_state'])
  })
})

// --- the fake port ---------------------------------------------------------

describe('fake retrieval', () => {
  const query = {
    dimensions: ['settled_at'],
    measures: [{ field: 'settlement_value' as const, aggregation: 'sum' as const }],
  }

  test('returns rows under the normal scenario', async () => {
    const port = new FakeDatasetRetrieval({ latencyMs: 0 })
    const outcome = await port.retrieve('peniremit-settlements', query, viewer)
    expect(outcome.kind).toBe('rows')
  })

  test('each scenario is reachable and distinct', async () => {
    for (const scenario of RETRIEVAL_SCENARIOS) {
      if (scenario === 'loading') continue // resolves only after a deliberate delay

      const port = new FakeDatasetRetrieval({
        latencyMs: 0,
        scenarios: { 'peniremit-settlements': scenario },
      })

      if (scenario === 'failed') {
        expect(port.retrieve('peniremit-settlements', query, viewer)).rejects.toThrow()
        continue
      }

      const outcome = await port.retrieve('peniremit-settlements', query, viewer)
      expect(outcome.kind).toBe(scenario === 'normal' ? 'rows' : scenario)
    }
  })

  test('scenarios apply per Dataset, leaving others unaffected (FR-DA-10)', async () => {
    const port = new FakeDatasetRetrieval({
      latencyMs: 0,
      scenarios: { 'peniremit-settlements': 'denied' },
    })

    const denied = await port.retrieve('peniremit-settlements', query, viewer)
    const other = await port.retrieve(
      'payroll-disbursements',
      { dimensions: ['disbursed_on'], measures: [{ field: 'gross_amount', aggregation: 'sum' }] },
      viewer,
    )

    expect(denied.kind).toBe('denied')
    expect(other.kind).toBe('rows')
  })

  test('an authorized retrieval matching nothing is empty, not zero rows', async () => {
    const port = new FakeDatasetRetrieval({ latencyMs: 0 })
    const outcome = await port.retrieve(
      'peniremit-settlements',
      { ...query, filters: { corridor: 'NG → MARS' } },
      viewer,
    )
    expect(outcome.kind).toBe('empty')
  })

  test('repeated identical retrievals give identical results (FR-DP-10)', async () => {
    const port = new FakeDatasetRetrieval({ latencyMs: 0 })
    const first = await port.retrieve('peniremit-settlements', query, viewer)
    const second = await port.retrieve('peniremit-settlements', query, viewer)
    expect(first).toEqual(second)
  })
})
