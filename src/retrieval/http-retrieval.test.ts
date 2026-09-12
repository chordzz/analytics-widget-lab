/**
 * The adapter that turns HTTP into the six render states.
 *
 * Three groups matter more than the rest:
 *
 *   - **the status table stays six-valued.** 403 and 410 are per-Widget and
 *     leave the board standing; 401 is not a Widget state and must keep rising.
 *   - **rows are found under either documented reading**, and the shape is
 *     reported rather than assumed — with `meta.partial` surviving both, since
 *     it is the one thing here that fails silently.
 *   - **what the wire cannot carry is finished locally.** `sort` has nowhere to
 *     go upstream, and nine widget types draw a wrong picture without it.
 */

import { describe, expect, test } from 'bun:test'
import { httpRetrieval, upstreamParameters } from './http-retrieval'
import { createApiClient } from '../api/client'
import { fakeTokenProvider } from '../auth/fake-provider'
import type { DatasetQuery } from '../domain/query'

const rows = [
  { region: 'EMEA', revenue: 300 },
  { region: 'APAC', revenue: 100 },
  { region: 'AMER', revenue: 200 },
]

const reply = (body: unknown, status = 200) =>
  new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

function retrievalWith(body: unknown, status = 200) {
  const urls: string[] = []
  const fetchImpl = ((input: RequestInfo | URL) => {
    urls.push(String(input))
    return Promise.resolve(reply(body, status))
  }) as typeof globalThis.fetch

  // A token provider is part of the realistic setup: without one the client
  // cannot refresh, and a 401 would surface as a bare refusal rather than as
  // the session ending.
  const api = createApiClient({
    baseUrl: 'https://api.example.test',
    tokens: fakeTokenProvider(),
    fetch: fetchImpl,
    onDiagnostic: () => {},
  })
  const relays: { shape: string; partial: boolean; reason: string | null }[] = []
  return { port: httpRetrieval(api, { onRelay: (r) => relays.push(r) }), urls, relays }
}

/** The flat reading: Analytics hands back the Source System's envelope. */
const flat = (data: unknown, meta?: unknown) => ({ status: true, message: 'OK', data, meta })

/** The nested reading: that envelope sits inside ours. */
const nested = (data: unknown, meta?: unknown) => ({
  status: true,
  message: 'Query executed',
  data: { status: true, message: 'OK', data, meta },
})

describe('the rows are found under either documented reading', () => {
  test('flat — rows at data', async () => {
    const { port } = retrievalWith(flat(rows))
    expect(await port.retrieve('d', {}, viewer())).toMatchObject({ kind: 'rows' })
  })

  test('nested — rows at data.data', async () => {
    const { port } = retrievalWith(nested(rows))
    expect(await port.retrieve('d', {}, viewer())).toMatchObject({ kind: 'rows' })
  })

  test('and the shape is reported, so a real trace settles the question', async () => {
    const { port, relays } = retrievalWith(nested(rows))
    await port.retrieve('d', {}, viewer())
    expect(relays[0].shape).toBe('nested')
  })

  test('rows nowhere either reading puts them raises rather than reading empty', async () => {
    /*
     * "No data" is a claim about the world and this is not evidence for it. A
     * Dataset that genuinely has nothing returns `200` with an empty array, and
     * that is a different response from one whose shape we cannot read.
     */
    const { port } = retrievalWith({ status: true, message: 'OK', data: { total: 4 } })
    expect(port.retrieve('d', {}, viewer())).rejects.toThrow(/did not carry rows/)
  })
})

describe('a partial result survives both readings', () => {
  test('flat — meta beside data', async () => {
    const { port, relays } = retrievalWith(flat(rows, { partial: true, reason: 'retention' }))
    await port.retrieve('d', {}, viewer())
    expect(relays[0]).toMatchObject({ partial: true, reason: 'retention' })
  })

  test('nested — meta inside the inner envelope', async () => {
    /*
     * The silent failure this whole indirection exists for. Read at the wrong
     * depth `meta.partial` is `undefined`, which is falsy, which means *not
     * partial* — so a chart missing half its data renders as though it were
     * whole, with no error anywhere.
     */
    const { port, relays } = retrievalWith(nested(rows, { partial: true, reason: 'shard down' }))
    await port.retrieve('d', {}, viewer())
    expect(relays[0]).toMatchObject({ partial: true, reason: 'shard down' })
  })

  test('and a complete result says so', async () => {
    const { port, relays } = retrievalWith(flat(rows))
    await port.retrieve('d', {}, viewer())
    expect(relays[0].partial).toBe(false)
  })
})

describe('the status table keeps the states apart', () => {
  test('403 is denied, and only this Widget', async () => {
    const { port } = retrievalWith({ status: false, message: 'Insufficient permissions' }, 403)
    expect(await port.retrieve('d', {}, viewer())).toEqual({ kind: 'denied' })
  })

  test('410 is withdrawn', async () => {
    const { port } = retrievalWith({ status: false, message: 'Withdrawn' }, 410)
    expect(await port.retrieve('d', {}, viewer())).toEqual({ kind: 'withdrawn' })
  })

  test('an empty array is empty, not a failure', async () => {
    // FR-VZ-10. The integration guide tells publishers the same thing from the
    // other side: never a 404 for "no rows".
    const { port } = retrievalWith(flat([]))
    expect(await port.retrieve('d', {}, viewer())).toEqual({ kind: 'empty' })
  })

  test('503 is a failure and keeps rising', async () => {
    // Not an outcome. The Viewer must not be told a Source System being down
    // means they lack access or that the figure is zero.
    const { port } = retrievalWith({ status: false, message: 'unavailable' }, 503)
    expect(port.retrieve('d', {}, viewer())).rejects.toMatchObject({ kind: 'unavailable' })
  })

  test('401 is not a Widget state at all', async () => {
    /*
     * The one that would be easiest to get wrong and worst to get wrong. Ten
     * Widgets on a board hit this in the same tick; ten cards each announcing
     * their own auth failure is ten wrong answers to one question about the
     * session.
     */
    const { port } = retrievalWith({ status: false, message: 'Invalid or expired token' }, 401)
    expect(port.retrieve('d', {}, viewer())).rejects.toMatchObject({ kind: 'session-expired' })
  })
})

describe('what the wire cannot carry is finished here', () => {
  test('sort is applied locally, because nine widget types are wrong without it', async () => {
    // A line chart drawn from unordered rows is not untidy, it is wrong: the
    // line doubles back on itself.
    const { port } = retrievalWith(flat(rows))
    const query: DatasetQuery = { sort: [{ field: 'revenue', direction: 'descending' }] }
    const outcome = await port.retrieve('d', query, viewer())

    expect(outcome.kind).toBe('rows')
    if (outcome.kind !== 'rows') return
    expect(outcome.rows.map((row) => row.region)).toEqual(['EMEA', 'AMER', 'APAC'])
  })

  test('limit is applied locally', async () => {
    const { port } = retrievalWith(flat(rows))
    const outcome = await port.retrieve('d', { limit: 2 }, viewer())
    expect(outcome.kind === 'rows' && outcome.rows).toHaveLength(2)
  })

  test('a reduction the endpoint cannot express still produces one figure', async () => {
    // Three of our widget types send `measures`. Against data already at the
    // grain the chart draws this is a no-op; against raw rows it is the
    // difference between one total and three unrelated numbers.
    const { port } = retrievalWith(flat(rows))
    const outcome = await port.retrieve(
      'd',
      { measures: [{ field: 'revenue', aggregation: 'sum' }] },
      viewer(),
    )
    expect(outcome.kind === 'rows' && outcome.rows).toEqual([{ revenue: 600 }])
  })

  test('a local pass that removes every row reads as empty, not as rows', async () => {
    // `resolveRenderState` treats "reported rows, returned none" as a contract
    // breach, so the adapter has to make this call rather than pass an empty
    // array up.
    const { port } = retrievalWith(flat(rows))
    const outcome = await port.retrieve('d', { filters: { region: 'NOWHERE' } }, viewer())
    expect(outcome).toEqual({ kind: 'empty' })
  })
})

describe('what goes upstream', () => {
  test('filters become query parameters', () => {
    expect(upstreamParameters({ filters: { currency: 'NGN', corridor: 'GB-NG' } })).toEqual({
      currency: 'NGN',
      corridor: 'GB-NG',
    })
  })

  test('a time range becomes from and to', () => {
    expect(
      upstreamParameters({ timeRange: { field: 'day', from: '2026-08-01', to: '2026-08-31' } }),
    ).toEqual({ from: '2026-08-01', to: '2026-08-31' })
  })

  test('an open-ended range sends only the end it has', () => {
    expect(upstreamParameters({ timeRange: { field: 'day', from: '2026-08-01' } })).toEqual({
      from: '2026-08-01',
    })
  })

  test('nothing the endpoint does not accept is invented', () => {
    /*
     * D22. `dimensions`, `measures`, `sort` and `limit` have nowhere to go —
     * and an undeclared parameter is refused upstream before the request
     * leaves, failing the whole query rather than being ignored. So sending a
     * hopeful `sort=` would turn a correct chart into a 400.
     */
    expect(
      upstreamParameters({
        dimensions: ['region'],
        measures: [{ field: 'revenue', aggregation: 'sum' }],
        sort: [{ field: 'revenue', direction: 'descending' }],
        limit: 10,
      }),
    ).toEqual({})
  })

  test('the parameters reach the URL', async () => {
    const { port, urls } = retrievalWith(flat(rows))
    await port.retrieve('peniremit.settlements', { filters: { currency: 'NGN' } }, viewer())
    expect(urls[0]).toBe(
      'https://api.example.test/v1/datasets/peniremit.settlements/query?currency=NGN',
    )
  })

  test('a dataset id is encoded, not interpolated raw', async () => {
    const { port, urls } = retrievalWith(flat(rows))
    await port.retrieve('a/b', {}, viewer())
    expect(urls[0]).toContain('/v1/datasets/a%2Fb/query')
  })
})

describe('filter values are not guessed from a retrieval', () => {
  test('nothing is offered rather than something quietly wrong', async () => {
    /*
     * Finding 8, still open. Deriving the list from returned rows would offer
     * whatever the current query happened to return, so the options would
     * change as other filters changed — a control that narrows itself.
     */
    const { port } = retrievalWith(flat(rows))
    expect(await port.listFilterValues('d', 'region', viewer())).toEqual([])
  })
})

const viewer = () => ({ id: 'u1', displayName: 'Test' })
