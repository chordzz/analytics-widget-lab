/**
 * The diffing store, which is where a board can quietly fail to save.
 *
 * The port hands over the whole state on every write and the API takes one
 * board at a time, so this store decides what changed. Four properties matter,
 * and each has a way of being wrong that looks like nothing being wrong:
 *
 *   - an unchanged board sends nothing   → dragging one widget must not PATCH ten boards
 *   - a new board is created exactly once → a second save must not duplicate it
 *   - a failed save is retried            → a board that looks saved and is not
 *   - publication is its own call         → a board must never go public as a side effect
 */

import { describe, expect, test } from 'bun:test'
import { httpBoardStore } from './http-board-store'
import { createApiClient } from '../api/client'
import { fakeTokenProvider } from '../auth/fake-provider'
import type { Board, BoardsState } from '../analytics/builder/boards'

interface Call {
  method: string
  path: string
  body: unknown
}

function storeWith(script: (call: Call) => Response = () => ok({})) {
  const calls: Call[] = []
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      method: init?.method ?? 'GET',
      path: String(input).replace('https://api.example.test', ''),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    }
    calls.push(call)
    return Promise.resolve(script(call))
  }) as typeof globalThis.fetch

  const api = createApiClient({
    baseUrl: 'https://api.example.test',
    tokens: fakeTokenProvider(),
    fetch: fetchImpl,
    onDiagnostic: () => {},
  })
  const failures: string[] = []
  return {
    store: httpBoardStore(api, { onSaveFailed: (board) => failures.push(board.id) }),
    calls,
    failures,
    /** Just the shape of the traffic, which is what these tests are about. */
    traffic: () => calls.map((call) => `${call.method} ${call.path}`),
  }
}

const ok = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ status: status < 400, message: 'OK', data }), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const board = (overrides: Partial<Board> = {}): Board => ({
  id: 'b1',
  name: 'Finance daily',
  description: '',
  authorId: 'actor-1',
  status: 'draft',
  scope: { kind: 'personal' },
  shareGrants: [],
  updated: '2026-09-01',
  widgets: {},
  placements: [],
  controls: [],
  sections: [],
  ...overrides,
})

const state = (...boards: Board[]): BoardsState => ({ boards, editingId: null })

const remote = (overrides: Record<string, unknown> = {}) => ({
  id: 'srv-1',
  name: 'Finance daily',
  creator_actor_id: 'actor-1',
  widgets: [],
  ...overrides,
})

describe('loading', () => {
  test('the seed is never written into a real account', async () => {
    /*
     * The one line in this file that is a product decision rather than
     * plumbing. `LocalBoardStore` falls back to demo boards when storage is
     * empty, which is right for a lab. An empty list from the API means this
     * person has no dashboards, and inventing three is not a friendlier way of
     * saying that — it is a lie they then have to delete.
     */
    const { store } = storeWith(() => ok([]))
    const loaded = await store.load([board({ id: 'seed' })], 'actor-1')
    expect(loaded.boards).toEqual([])
  })

  test('deleted boards do not come back', async () => {
    const { store } = storeWith(() => ok([remote(), remote({ id: 'srv-2', deleted: true })]))
    expect((await store.load([], 'actor-1')).boards.map((b) => b.id)).toEqual(['srv-1'])
  })

  test('a named collection is accepted as well as a bare array', async () => {
    const { store } = storeWith(() => ok({ dashboards: [remote()] }))
    expect((await store.load([], 'actor-1')).boards).toHaveLength(1)
  })
})

describe('an unchanged board sends nothing', () => {
  test('saving the state it was loaded from is silent', async () => {
    /*
     * Without this, every debounce tick PATCHes every board on the screen —
     * one widget dragged, ten requests, and the last one to land wins.
     */
    const { store, calls, traffic } = storeWith(() => ok([remote()]))
    const loaded = await store.load([], 'actor-1')
    calls.length = 0

    await store.save(loaded)
    expect(traffic()).toEqual([])
  })

  test('a field the API never sees does not provoke a save', async () => {
    // `updated` is stamped on every action by `useBoards`, so comparing boards
    // rather than payloads would make every keystroke a PATCH.
    const { store, calls, traffic } = storeWith(() => ok([remote()]))
    const loaded = await store.load([], 'actor-1')
    calls.length = 0

    await store.save(state({ ...loaded.boards[0], updated: '2099-01-01' }))
    expect(traffic()).toEqual([])
  })

  test('but a real edit does', async () => {
    const { store, calls, traffic } = storeWith(() => ok([remote()]))
    const loaded = await store.load([], 'actor-1')
    calls.length = 0

    await store.save(state({ ...loaded.boards[0], name: 'Renamed' }))
    expect(traffic()).toEqual(['PATCH /v1/dashboards/srv-1'])
    expect(calls[0].body).toMatchObject({ name: 'Renamed' })
  })
})

describe('a new board is created exactly once', () => {
  test('the first save posts it', async () => {
    const { store, traffic } = storeWith(() => ok(remote()))
    await store.save(state(board({ id: 'local:b-1' })))
    expect(traffic()).toEqual(['POST /v1/dashboards'])
  })

  test('the second save does not post it again', async () => {
    // The debounce fires on every change, and a board created and then
    // immediately renamed would otherwise be created twice.
    const { store, calls, traffic } = storeWith(() => ok(remote()))
    const created = board({ id: 'local:b-1' })
    await store.save(state(created))
    calls.length = 0

    await store.save(state({ ...created, name: 'Renamed' }))
    expect(traffic()).toEqual(['PATCH /v1/dashboards/srv-1'])
  })

  test('and later edits address it by the id the API assigned', async () => {
    /*
     * The client goes on calling the board by its local name; the store
     * translates. Getting this wrong PATCHes a path the server has never heard
     * of, which 404s — and a 404 on a save is indistinguishable from a board
     * that was deleted underneath you.
     */
    const { store, calls } = storeWith(() => ok(remote({ id: 'srv-99' })))
    const created = board({ id: 'local:b-1' })
    await store.save(state(created))
    calls.length = 0

    await store.save(state({ ...created, description: 'edited' }))
    expect(calls[0].path).toBe('/v1/dashboards/srv-99')
  })
})

describe('publication is its own decision', () => {
  test('a draft becoming published calls publish, not patch', async () => {
    // FR-CO-04 makes publication a deliberate act after review, and the API
    // agrees by giving it a route rather than a field. Folding it into a save
    // is how a board becomes visible as a side effect of editing it.
    const { store, calls, traffic } = storeWith(() => ok([remote()]))
    const loaded = await store.load([], 'actor-1')
    calls.length = 0

    await store.save(state({ ...loaded.boards[0], status: 'published' }))
    expect(traffic()).toEqual(['POST /v1/dashboards/srv-1/publish'])
    expect(calls[0].body).toEqual({ scope_level: 'personal' })
  })

  test('a scope moved on a published board republishes with the new floor', async () => {
    const { store, calls } = storeWith(() => ok([remote({ status: 'published' })]))
    const loaded = await store.load([], 'actor-1')
    calls.length = 0

    await store.save(
      state({
        ...loaded.boards[0],
        scope: { kind: 'organizational-scope', scopeId: 'dept-finance', label: 'Finance' },
      }),
    )
    expect(calls.at(-1)?.body).toEqual({
      scope_level: 'department',
      scope_organizational_ref: 'dept-finance',
    })
  })

  test('a published board saved unchanged does not republish', async () => {
    const { store, calls, traffic } = storeWith(() => ok([remote({ status: 'published' })]))
    const loaded = await store.load([], 'actor-1')
    calls.length = 0

    await store.save(loaded)
    expect(traffic()).toEqual([])
  })

  test('a board created already published is created and then published', async () => {
    const { store, traffic } = storeWith(() => ok(remote()))
    await store.save(state(board({ id: 'local:b-1', status: 'published' })))
    expect(traffic()).toEqual(['POST /v1/dashboards', 'POST /v1/dashboards/srv-1/publish'])
  })
})

describe('deleting', () => {
  test('a board dropped from state is deleted upstream', async () => {
    const { store, traffic } = storeWith(() => ok([remote()]))
    await store.load([], 'actor-1')
    await store.save(state())
    expect(traffic().at(-1)).toBe('DELETE /v1/dashboards/srv-1')
  })

  test('and is not deleted twice', async () => {
    const { store, calls } = storeWith(() => ok([remote()]))
    await store.load([], 'actor-1')
    await store.save(state())
    calls.length = 0

    await store.save(state())
    expect(calls).toHaveLength(0)
  })
})

describe('a failed save is retried, never swallowed', () => {
  test('the baseline does not advance past a request that failed', async () => {
    /*
     * The failure mode worth engineering against: a board that looks saved and
     * is not. If the baseline advanced on failure the next save would see no
     * difference and send nothing, and the edit would be lost the moment the
     * tab closed.
     */
    let fail = true
    const { store, calls, traffic } = storeWith((call) => {
      if (call.method === 'PATCH' && fail) return ok({ message: 'nope' }, 503)
      return call.method === 'GET' ? ok([remote()]) : ok(remote())
    })

    const loaded = await store.load([], 'actor-1')
    const edited = state({ ...loaded.boards[0], name: 'Renamed' })
    calls.length = 0

    await store.save(edited)
    fail = false
    await store.save(edited)

    expect(traffic()).toEqual(['PATCH /v1/dashboards/srv-1', 'PATCH /v1/dashboards/srv-1'])
  })

  test('and the caller is told which board it was', async () => {
    const { store, failures } = storeWith((call) =>
      call.method === 'GET' ? ok([remote()]) : ok({ message: 'nope' }, 503),
    )
    const loaded = await store.load([], 'actor-1')
    await store.save(state({ ...loaded.boards[0], name: 'Renamed' }))
    expect(failures).toEqual(['srv-1'])
  })

  test('one board failing does not stop the next from saving', async () => {
    const { store, calls } = storeWith((call) => {
      if (call.method === 'GET') return ok([remote(), remote({ id: 'srv-2', name: 'Other' })])
      return call.path.endsWith('srv-1') ? ok({ message: 'nope' }, 503) : ok(remote())
    })

    const loaded = await store.load([], 'actor-1')
    calls.length = 0

    await store.save(
      state(...loaded.boards.map((entry) => ({ ...entry, description: 'touched' }))),
    )
    expect(calls.map((call) => call.path)).toEqual([
      '/v1/dashboards/srv-1',
      '/v1/dashboards/srv-2',
    ])
  })

  test('a session ending is not a save failure and keeps rising', async () => {
    // The banner above the board is the right place for it. Reporting it as
    // "this board did not save" sends someone to retry an edit when what they
    // need to do is sign in.
    const { store, failures } = storeWith((call) =>
      call.method === 'GET'
        ? ok([remote()])
        : ok({ message: 'Invalid or expired token' }, 401),
    )
    const loaded = await store.load([], 'actor-1')

    expect(store.save(state({ ...loaded.boards[0], name: 'Renamed' }))).rejects.toMatchObject({
      kind: 'session-expired',
    })
    expect(failures).toEqual([])
  })
})

describe('identity', () => {
  test('a minted id says it is local', async () => {
    // It is what lets `save` tell "never sent" from "sent, and this is what the
    // API called it".
    const { store } = storeWith()
    expect(store.mintId('board')).toMatch(/^local:board-/)
  })

  test('and two are different', async () => {
    const { store } = storeWith()
    expect(store.mintId('board')).not.toBe(store.mintId('board'))
  })
})
