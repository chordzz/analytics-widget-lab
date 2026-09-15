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
 * **Theirs:** `POST` is the only Grant route. There is no `DELETE`, and no
 * listing either — `Dashboard` carries no `share_grants`, so the server cannot
 * be asked who a board is shared with. A Grant can therefore be created and
 * never revoked, and unticking a name changes our copy and nothing else. That is
 * a disclosure rather than an inconvenience, so it is reported rather than
 * absorbed.
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

function storeWith(fail?: (path: string) => Response | undefined) {
  const sent: Sent[] = []
  const fetchImpl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const path = new URL(String(input)).pathname
    sent.push({
      method: init?.method ?? 'GET',
      path,
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    })
    const refused = fail?.(path)
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

/** Puts a board into the store's baseline, the way a load would. */
async function seeded(store: ReturnType<typeof storeWith>['store'], initial: Board) {
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

describe('a grant cannot be revoked, and that is said out loud', () => {
  test('removing one reports that the person still has access', async () => {
    /*
     * The serious one. There is no DELETE route, so unticking a name changes our
     * copy and nothing else. Silence here means an Author believes they revoked
     * access and did not — and with grants present, FR-DA-07 says only the named
     * see the board, so the person left behind is the *only* one still seeing it.
     */
    const { store, unrevoked } = storeWith()
    const shared = board({ shareGrants: [grant('u2', 'Ada')] })
    await seeded(store, shared)

    await store.save({ boards: [{ ...shared, shareGrants: [] }], editingId: null })

    expect(unrevoked).toEqual([{ board: 'Finance daily', who: 'Ada' }])
  })

  test('the removed grant is not silently re-sent afterwards', async () => {
    // Forgetting it would re-POST a Grant the Author deliberately removed, which
    // is the opposite of what they asked for.
    const { store, sent } = storeWith()
    const shared = board({ shareGrants: [grant('u2', 'Ada')] })
    await seeded(store, shared)
    await store.save({ boards: [{ ...shared, shareGrants: [] }], editingId: null })
    await store.save({ boards: [{ ...shared, shareGrants: [] }], editingId: null })

    expect(grantCalls(sent)).toHaveLength(1)
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
