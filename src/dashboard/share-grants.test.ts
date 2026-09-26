/**
 * Share Grants over `POST /v1/dashboards/{id}/share-grants`.
 *
 * Two distinct bugs live here and only one of them is ours.
 *
 * **Ours:** Grants existed in the domain, in the composer and in board state,
 * and were never put in any payload. An Author shared a board, it looked
 * shared, and the Grant died with the tab. That is the failure these tests
 * mostly exist to prevent recurring.
 *
 * **Theirs, and now closed:** `POST` used to be the only Grant route. A Grant
 * could be created and never revoked, and unticking a name changed our copy and
 * nothing else. `GET` and `DELETE .../share-grants/{grantId}` have since
 * shipped, so unticking now withdraws access for real.
 *
 * What survives from that period is the reporting. A revoke can still fail —
 * refused, or attempted without an id because the listing never came back — and
 * a failed revoke is a disclosure rather than an inconvenience, so it is said
 * out loud rather than absorbed.
 */

import { describe, expect, test } from 'bun:test'
import { httpBoardStore } from './http-board-store'
import { grantInputFrom, grantKey } from './api-dashboard'
import { createApiClient } from '../api/client'
import type { Board } from '../analytics/builder/boards'
import type { ShareGrant } from '../domain/dashboard'

const grant = (id: string, label: string, kind: ShareGrant['recipientKind'] = 'individual'): ShareGrant => ({
  id: `g-${id}`,
  recipientKind: kind,
  recipientId: id,
  recipientLabel: label,
})

const board = (overrides: Partial<Board> = {}): Board => ({
  id: 'srv-1',
  name: 'Finance daily',
  description: '',
  authorId: 'u1',
  scope: { kind: 'organizational-scope', scopeId: 'dept-finance', label: 'Finance' },
  shareGrants: [],
  status: 'published',
  updated: '2026-09-15',
  widgets: {},
  placements: [],
  controls: [],
  sections: [],
  ...overrides,
})

interface Sent {
  method: string
  path: string
  body: unknown
}

function storeWith(fail?: (path: string, method: string) => Response | undefined) {
  const sent: Sent[] = []
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    sent.push({
      method: init?.method ?? 'GET',
      path,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    const refused = fail?.(path, init?.method ?? 'GET')
    if (refused) return Promise.resolve(refused)
    return Promise.resolve(
      new Response(JSON.stringify({ status: true, message: 'OK', data: { id: 'srv-1' } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }) as typeof globalThis.fetch

  const api = createApiClient({
    baseUrl: 'https://api.example.test',
    fetch: fetchImpl,
    onDiagnostic: () => {},
  })

  const saveFailures: string[] = []
  const unrevoked: { board: string; who: string }[] = []
  const store = httpBoardStore(api, {
    onSaveFailed: (b) => saveFailures.push(b.name),
    onGrantNotRevoked: (b, g) => unrevoked.push({ board: b.name, who: g.recipientLabel }),
  })

  return { store, sent, saveFailures, unrevoked }
}

const grantCalls = (sent: Sent[]) => sent.filter((call) => call.path.endsWith('/share-grants'))

/**
 * Puts a board into the store's baseline, the way the real caller does.
 *
 * The `load` is not ceremony: a store that has never been told what the server
 * holds now refuses to save, because a `baseline` that was never filled in makes
 * every board look new and creates the whole workspace again.
 */
async function seeded(store: ReturnType<typeof storeWith>['store'], initial: Board) {
  await store.load([], 'u1')
  await store.save({ boards: [initial], editingId: null })
}

describe('a grant reaches the API', () => {
  test('it is sent on its own route, not in the board payload', async () => {
    /*
     * The bug this replaces: grants lived in board state and `dashboardInputFrom`
     * never carried them, so nothing was sent at all. They have their own route
     * because a Grant is an access decision rather than part of the composition.
     */
    const { store, sent } = storeWith()
    await seeded(store, board({ shareGrants: [grant('u2', 'Ada')] }))

    expect(grantCalls(sent)).toHaveLength(1)
    expect(grantCalls(sent)[0].method).toBe('POST')
    expect(grantCalls(sent)[0].body).toEqual({ target_type: 'user', target_ref: 'u2' })
  })

  test('a board with no grants sends none', async () => {
    const { store, sent } = storeWith()
    await seeded(store, board())
    expect(grantCalls(sent)).toHaveLength(0)
  })

  test('each grant is one call', async () => {
    const { store, sent } = storeWith()
    await seeded(store, board({ shareGrants: [grant('u2', 'Ada'), grant('u3', 'Bo')] }))
    expect(grantCalls(sent)).toHaveLength(2)
  })

  test('a grant added later is sent on the next save', async () => {
    const { store, sent } = storeWith()
    const initial = board()
    await seeded(store, initial)
    await store.save({
      boards: [{ ...initial, shareGrants: [grant('u2', 'Ada')] }],
      editingId: null,
    })
    expect(grantCalls(sent)).toHaveLength(1)
  })

  test('an unchanged grant is not sent twice', async () => {
    // The API tolerates it — "adding the same grant twice returns the existing
    // one" — but a request per save per grant is noise nobody asked for.
    const { store, sent } = storeWith()
    const shared = board({ shareGrants: [grant('u2', 'Ada')] })
    await seeded(store, shared)
    await store.save({ boards: [{ ...shared, name: 'Renamed' }], editingId: null })
    expect(grantCalls(sent)).toHaveLength(1)
  })
})

describe('D26 — our names against theirs', () => {
  test('an individual is a user', () => {
    expect(grantInputFrom(grant('u2', 'Ada'))).toEqual({ target_type: 'user', target_ref: 'u2' })
  })

  test('a group is a department', () => {
    /*
     * `group` is the broader word and the API deliberately is not: a department
     * is an IAM concept it holds a reference to, not an arbitrary set. So this
     * translation is only truthful where the group *is* a department.
     */
    expect(grantInputFrom(grant('dept-finance', 'Finance', 'group'))).toEqual({
      target_type: 'department',
      target_ref: 'dept-finance',
    })
  })

  test('the key distinguishes a user from a department with the same ref', () => {
    expect(grantKey(grant('x', 'X'))).not.toBe(grantKey(grant('x', 'X', 'group')))
  })
})

describe('a grant that cannot be sent is retried, not lost', () => {
  test('a refusal is reported and does not fail the board', async () => {
    // `dashboard.share` is a separate permission. Being refused it is an answer
    // about permissions, not a lost edit — the composition still saved.
    const { store, saveFailures } = storeWith((path) =>
      path.endsWith('/share-grants')
        ? new Response(JSON.stringify({ status: false, message: 'Insufficient permissions' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          })
        : undefined,
    )

    await seeded(store, board({ shareGrants: [grant('u2', 'Ada')] }))
    expect(saveFailures).toEqual(['Finance daily'])
  })

  test('and it is attempted again next time', async () => {
    let refuse = true
    const { store, sent } = storeWith((path) =>
      refuse && path.endsWith('/share-grants')
        ? new Response(JSON.stringify({ status: false, message: 'nope' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          })
        : undefined,
    )

    const shared = board({ shareGrants: [grant('u2', 'Ada')] })
    await seeded(store, shared)
    refuse = false
    await store.save({ boards: [shared], editingId: null })

    expect(grantCalls(sent)).toHaveLength(2)
  })
})

describe('a grant is revoked when the Author removes it', () => {
  test('removing one sends a DELETE for that grant', async () => {
    /*
     * The serious one, and now it works. With grants present FR-DA-07 says only
     * the named see the board, so the person left behind by a failed revoke is
     * the *only* one still seeing it.
     */
    const { store, sent, unrevoked } = storeWith()
    const shared = board({ shareGrants: [grant('u2', 'Ada')] })
    await seeded(store, shared)

    await store.save({ boards: [{ ...shared, shareGrants: [] }], editingId: null })

    const deletes = sent.filter((call) => call.method === 'DELETE')
    expect(deletes.map((call) => call.path)).toEqual([
      '/v1/dashboards/srv-1/share-grants/srv-1',
    ])
    expect(unrevoked).toEqual([])
  })

  test('the id comes from the POST, so it works without a reload', async () => {
    /*
     * A Grant added and removed in one sitting never appears in a listing —
     * that runs at load. Taking the id from the create response is what makes
     * the round trip possible at all.
     */
    const { store, sent } = storeWith()
    const plain = board()
    await seeded(store, plain)

    await store.save({
      boards: [{ ...plain, shareGrants: [grant('u2', 'Ada')] }],
      editingId: null,
    })
    await store.save({ boards: [plain], editingId: null })

    expect(sent.filter((call) => call.method === 'DELETE').map((c) => c.path)).toEqual([
      '/v1/dashboards/srv-1/share-grants/srv-1',
    ])
  })

  test('a refused revoke is reported, not swallowed', async () => {
    const { store, unrevoked } = storeWith((path, method) =>
      method === 'DELETE' && path.includes('/share-grants/')
        ? new Response(JSON.stringify({ status: false, message: 'nope' }), {
            status: 403,
            headers: { 'content-type': 'application/json' },
          })
        : undefined,
    )
    const shared = board({ shareGrants: [grant('u2', 'Ada')] })
    await seeded(store, shared)

    await store.save({ boards: [{ ...shared, shareGrants: [] }], editingId: null })

    expect(unrevoked).toEqual([{ board: 'Finance daily', who: 'Ada' }])
  })

  test('a refused revoke is tried again on the next save', async () => {
    // The Grant is still live, so treating it as gone would leave the person
    // with access and nothing left to notice it.
    let refuse = true
    const { store, sent } = storeWith((_path, method) =>
      refuse && method === 'DELETE'
        ? new Response(JSON.stringify({ status: false, message: 'nope' }), {
            status: 503,
            headers: { 'content-type': 'application/json' },
          })
        : undefined,
    )
    const shared = board({ shareGrants: [grant('u2', 'Ada')] })
    await seeded(store, shared)

    await store.save({ boards: [{ ...shared, shareGrants: [] }], editingId: null })
    refuse = false
    await store.save({ boards: [{ ...shared, shareGrants: [] }], editingId: null })

    expect(sent.filter((call) => call.method === 'DELETE')).toHaveLength(2)
  })

  test('a revoked grant is not re-sent afterwards', async () => {
    // Re-POSTing a Grant the Author deliberately removed is the opposite of
    // what they asked for, and a revoke that undoes itself on the next save is
    // worse than one that never happened.
    const { store, sent } = storeWith()
    const shared = board({ shareGrants: [grant('u2', 'Ada')] })
    await seeded(store, shared)
    await store.save({ boards: [{ ...shared, shareGrants: [] }], editingId: null })
    await store.save({ boards: [{ ...shared, shareGrants: [] }], editingId: null })

    expect(grantCalls(sent)).toHaveLength(1)
    expect(sent.filter((call) => call.method === 'DELETE')).toHaveLength(1)
  })

  test('nothing is reported when no grant was removed', async () => {
    const { store, unrevoked } = storeWith()
    await seeded(store, board({ shareGrants: [grant('u2', 'Ada')] }))
    expect(unrevoked).toEqual([])
  })

  test('deleting the board forgets its grants', async () => {
    // Otherwise the next board minted with the same local id would inherit them.
    const { store, unrevoked } = storeWith()
    const shared = board({ shareGrants: [grant('u2', 'Ada')] })
    await seeded(store, shared)
    await store.save({ boards: [], editingId: null })
    expect(unrevoked).toEqual([])
  })
})

const okJson = (data: unknown) =>
  new Response(JSON.stringify({ status: true, message: 'OK', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

describe('who a board is shared with is read from the server', () => {
  /** The board list, then that board's grants — the two calls `load` makes. */
  const serving = (grants: unknown) => (path: string, method: string) => {
    if (method !== 'GET') return undefined
    if (path === '/v1/dashboards') return okJson([{ id: 'srv-1', name: 'Finance daily', creator_actor_id: 'u1', widgets: [] }])
    if (path === '/v1/dashboards/srv-1/share-grants') return okJson(grants)
    return undefined
  }

  test('grants come back on load, rather than starting empty', async () => {
    /*
     * They used to start empty on every reload: there was no listing route, so
     * our whole knowledge of who could see a board was what this session had
     * done. An Author reloading saw a board shared with nobody.
     */
    const { store } = storeWith(serving([{ id: 'g-1', target_type: 'user', target_ref: 'u2' }]))
    const loaded = await store.load([], 'u1')

    expect(loaded.boards[0].shareGrants).toEqual([
      { id: 'g-1', recipientKind: 'individual', recipientId: 'u2', recipientLabel: 'u2' },
    ])
  })

  test('a grant already held is not sent again', async () => {
    // The re-POST after a reload used to be expected rather than a bug. Now the
    // server has told us it holds this one.
    const { store, sent } = storeWith(serving([{ id: 'g-1', target_type: 'user', target_ref: 'u2' }]))
    const loaded = await store.load([], 'u1')
    await store.save({ boards: loaded.boards, editingId: null })

    expect(grantCalls(sent).filter((call) => call.method === 'POST')).toEqual([])
  })

  test('a grant read back can be revoked without ever having been sent', async () => {
    const { store, sent } = storeWith(serving([{ id: 'g-1', target_type: 'user', target_ref: 'u2' }]))
    const loaded = await store.load([], 'u1')

    await store.save({
      boards: [{ ...loaded.boards[0], shareGrants: [] }],
      editingId: null,
    })

    expect(sent.filter((call) => call.method === 'DELETE').map((c) => c.path)).toEqual([
      '/v1/dashboards/srv-1/share-grants/g-1',
    ])
  })

  test('a withdrawn grant is not treated as live', async () => {
    // `deleted` is a status update rather than a row removal, so a listing that
    // carried one would otherwise read as someone still having access.
    const { store } = storeWith(
      serving([
        { id: 'g-1', target_type: 'user', target_ref: 'u2' },
        { id: 'g-2', target_type: 'user', target_ref: 'u3', deleted: true },
      ]),
    )
    const loaded = await store.load([], 'u1')
    expect(loaded.boards[0].shareGrants.map((g) => g.recipientId)).toEqual(['u2'])
  })

  test('a malformed entry is ignored rather than revoked later', async () => {
    /*
     * An entry without `id`/`target_type` cannot be matched or revoked. Letting
     * one in would file it under a key nothing wants, and the next save would
     * "remove" it — issuing a DELETE for something never read correctly.
     */
    const { store, sent } = storeWith(serving([{ name: 'not a grant' }, { id: 'g-1' }]))
    const loaded = await store.load([], 'u1')
    await store.save({ boards: loaded.boards, editingId: null })

    expect(loaded.boards[0].shareGrants).toEqual([])
    expect(sent.filter((call) => call.method === 'DELETE')).toEqual([])
  })

  test("other people's boards are not asked about", async () => {
    // The Share panel renders only for the Author, and only they can save one.
    const { store, sent } = storeWith((path, method) =>
      method === 'GET' && path === '/v1/dashboards'
        ? okJson([{ id: 'srv-9', name: 'Theirs', creator_actor_id: 'someone-else', widgets: [] }])
        : undefined,
    )
    await store.load([], 'u1')

    expect(sent.filter((call) => call.path.includes('share-grants'))).toEqual([])
  })
})
