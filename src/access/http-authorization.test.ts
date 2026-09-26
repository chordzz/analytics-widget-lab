/**
 * Deferring to the API, and the bug that came of not deferring.
 *
 * The first group is the regression: `LocalAuthorization` was the fallback when
 * a host passed no port, so it ran against live sessions, and it decided a
 * department board by looking a real actor up in a fixture array. These tests
 * put both adapters side by side on the same input so the difference is a
 * recorded fact rather than a claim in a comment.
 */

import { describe, expect, test } from 'bun:test'
import { httpAuthorization } from './http-authorization'
import { canViewDashboard, evaluateGrant } from './dashboard-access'
import { LocalAuthorization } from '../analytics/data/adapters'
import type { AccessSubject } from './dashboard-access'
import type { ViewerIdentity } from '../retrieval/port'
import { createApiClient } from '../api/client'

const ok = (data: unknown) =>
  new Response(JSON.stringify({ status: true, message: 'OK', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

/** An API client whose every call is answered by `reply`, with the path recorded. */
function apiFor(reply: (path: string) => Response, paths: string[] = []) {
  return createApiClient({
    baseUrl: 'https://api.example.test',
    onDiagnostic: () => {},
    fetch: ((input: RequestInfo | URL) => {
      const url = new URL(String(input))
      paths.push(url.pathname + url.search)
      return Promise.resolve(reply(url.pathname + url.search))
    }) as typeof globalThis.fetch,
  })
}

/** Built the way `SessionGate` builds it from `/v1/me`: id and a name, nothing else. */
const liveViewer: ViewerIdentity = { id: 'da79a9a7-043d-45a3-b35d-f6c449340d4a', displayName: 'Olaife Olawore' }

const departmentBoard: AccessSubject = {
  authorId: 'someone-else',
  status: 'published',
  scope: { kind: 'organizational-scope', scopeId: 'dept-finance', label: 'Finance' },
  shareGrants: [],
}

describe('a board the server returned is a board the server approved', () => {
  test('a department-scoped board stays visible', async () => {
    /*
     * The regression, stated as the behaviour we want. `GET /v1/dashboards`
     * returns only boards whose scope and Grants admit the viewer, so this board
     * arriving *is* the decision. Re-deciding can only subtract.
     */
    expect(await canViewDashboard(departmentBoard, liveViewer, httpAuthorization(apiFor(() => ok([]))))).toBe(true)
  })

  test('and the fixture adapter hides it, which is the bug', async () => {
    /*
     * Not a test of `LocalAuthorization` — it is correct for the fixtures it was
     * built for. It is a test that the two differ, so nobody restores the old
     * default without this failing.
     *
     * `satisfiesScope` asks `viewer.organizationalScopeIds.includes('dept-finance')`.
     * `/v1/me` supplies no scopes — it does not carry them, and `department_id`
     * comes back empty — so the array is absent and the answer is always no.
     */
    expect(await canViewDashboard(departmentBoard, liveViewer, new LocalAuthorization())).toBe(false)
  })

  test('nothing here was masking it except the backend', async () => {
    // The boards that *do* arrive today are personal or organization-wide, and
    // both pass under either adapter — which is why the bug was invisible.
    const wide: AccessSubject = { ...departmentBoard, scope: { kind: 'organization-wide' } }
    expect(await canViewDashboard(wide, liveViewer, new LocalAuthorization())).toBe(true)
    expect(await canViewDashboard(wide, liveViewer, httpAuthorization(apiFor(() => ok([]))))).toBe(true)
  })
})

describe('what the client still decides for itself', () => {
  test("a draft is nobody else's, whatever the scope says", async () => {
    // FR-CO-04, and it does not depend on the port: `canViewDashboard` settles
    // it before asking. Deferring must not quietly widen this.
    const draft: AccessSubject = { ...departmentBoard, status: 'draft' }
    expect(await canViewDashboard(draft, liveViewer, httpAuthorization(apiFor(() => ok([]))))).toBe(false)
  })

  test('the author always sees their own', async () => {
    const mine: AccessSubject = { ...departmentBoard, authorId: liveViewer.id }
    expect(await canViewDashboard(mine, liveViewer, httpAuthorization(apiFor(() => ok([]))))).toBe(true)
  })
})

describe('a Grant is reported as working, because it is', () => {
  const grant = {
    id: 'g1',
    recipientKind: 'individual' as const,
    recipientId: 'actor-ada',
    recipientLabel: 'Ada Lovelace',
  }

  test('it is effective rather than unresolvable', async () => {
    /*
     * The alternative — returning no identities — makes `evaluateGrant` tell the
     * Author "Ada Lovelace could not be resolved to any identity", which against
     * the API is false: `POST /share-grants` accepted it and the server is
     * honouring it. Overstating a Grant's reach is the safer of the two errors;
     * telling someone a live Grant does nothing is the one that costs them.
     */
    const verdict = await evaluateGrant(grant, departmentBoard.scope, httpAuthorization(apiFor(() => ok([]))))
    expect(verdict.effective).toBe(true)
    expect(verdict.reason).toBeUndefined()
  })

  test('the fixture adapter calls the same Grant dead', async () => {
    const verdict = await evaluateGrant(grant, departmentBoard.scope, new LocalAuthorization())
    expect(verdict.effective).toBe(false)
    expect(verdict.reason).toContain('could not be resolved')
  })
})

describe('what it will not pretend to know', () => {
  test('no administrator, because no such user class exists yet', async () => {
    /*
     * Finding 12. `/v1/me` returning `permissions: {}` is that gap arriving as
     * evidence. The one place this adapter fails closed, and the right place:
     * an admin surface opened on a guess is worse than a board hidden on one.
     */
    expect(await httpAuthorization(apiFor(() => ok([]))).mayAdministerCatalogue(liveViewer)).toBe(false)
  })

  test('an empty directory when the lookup fails, because a guess is worse', async () => {
    const refusing = apiFor(
      () => new Response('{}', { status: 403, headers: { 'content-type': 'application/json' } }),
    )
    expect(await httpAuthorization(refusing).directory('ada')).toEqual({
      individuals: [],
      groups: [],
    })
  })

  test('browsing is not re-filtered, since the Catalogue arrives filtered', async () => {
    expect(await httpAuthorization(apiFor(() => ok([]))).mayConsumeDataset('peniremit.settlements', liveViewer)).toBe(true)
  })
})

describe('the share-targets directory', () => {
  /*
   * Two lists, as the endpoint sends them. Written first as a flat array split
   * on `target_type` — read off the candidate schema instead of the response
   * schema — and the adapter returned nobody on every search, silently. The
   * fixture agreed with the bug, so the tests passed.
   */
  const candidates = {
    users: [{ target_type: 'user', target_ref: 'u-2', name: 'Ada Chukwu', email: 'ada@example.test' }],
    departments: [
      { target_type: 'department', target_ref: 'dept-finance', name: 'Finance', member_count: 12 },
    ],
  }

  test('users become individuals and departments become groups', async () => {
    const directory = await httpAuthorization(apiFor(() => ok(candidates))).directory('a')
    expect(directory).toEqual({
      individuals: [{ id: 'u-2', displayName: 'Ada Chukwu' }],
      groups: [{ scopeId: 'dept-finance', label: 'Finance' }],
    })
  })

  test('the reference travels unchanged, because a Grant names it', async () => {
    /*
     * `target_ref` becomes `recipientId` and goes back as `target_ref` in the
     * Grant. Deriving an id from anything else here — an email, a department
     * row — is how a tickable name comes to grant access to nothing.
     */
    const directory = await httpAuthorization(apiFor(() => ok(candidates))).directory('a')
    expect(directory.individuals[0].id).toBe('u-2')
  })

  test('a search term is passed as q', async () => {
    const paths: string[] = []
    await httpAuthorization(apiFor(() => ok([]), paths)).directory('ada c')
    expect(paths).toEqual(['/v1/dashboards/share-targets?q=ada%20c'])
  })

  test('a blank query asks without one, which returns departments only', async () => {
    /*
     * The endpoint refuses to list people without a term — an empty search
     * would be a staff list for anyone who can open Analytics. Sending `q=`
     * would be asking for that; omitting it is asking for the departments.
     */
    const paths: string[] = []
    await httpAuthorization(apiFor(() => ok([]), paths)).directory('   ')
    expect(paths).toEqual(['/v1/dashboards/share-targets'])
  })

  test('a candidate with no usable target is dropped', async () => {
    const broken = { users: [{ target_type: 'user', name: 'No ref' }, { target_ref: 'x-1' }] }
    expect(await httpAuthorization(apiFor(() => ok(broken))).directory('n')).toEqual({
      individuals: [],
      groups: [],
    })
  })

  test('an unnamed candidate falls back rather than rendering blank', async () => {
    const unnamed = { users: [{ target_type: 'user', target_ref: 'u-9', email: 'x@example.test' }] }
    const directory = await httpAuthorization(apiFor(() => ok(unnamed))).directory('x')
    expect(directory.individuals[0].displayName).toBe('x@example.test')
  })

  test('a flat array is not mistaken for an answer', async () => {
    /*
     * The shape this adapter was first written for. It cannot be told from an
     * empty result by anything downstream, so the value of this test is that
     * the wrong shape stays wrong rather than quietly becoming the contract.
     */
    const flat = [{ target_type: 'user', target_ref: 'u-2', name: 'Ada' }]
    expect(await httpAuthorization(apiFor(() => ok(flat))).directory('a')).toEqual({
      individuals: [],
      groups: [],
    })
  })
})
