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
    expect(await canViewDashboard(departmentBoard, liveViewer, httpAuthorization())).toBe(true)
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
    expect(await canViewDashboard(wide, liveViewer, httpAuthorization())).toBe(true)
  })
})

describe('what the client still decides for itself', () => {
  test("a draft is nobody else's, whatever the scope says", async () => {
    // FR-CO-04, and it does not depend on the port: `canViewDashboard` settles
    // it before asking. Deferring must not quietly widen this.
    const draft: AccessSubject = { ...departmentBoard, status: 'draft' }
    expect(await canViewDashboard(draft, liveViewer, httpAuthorization())).toBe(false)
  })

  test('the author always sees their own', async () => {
    const mine: AccessSubject = { ...departmentBoard, authorId: liveViewer.id }
    expect(await canViewDashboard(mine, liveViewer, httpAuthorization())).toBe(true)
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
    const verdict = await evaluateGrant(grant, departmentBoard.scope, httpAuthorization())
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
    expect(await httpAuthorization().mayAdministerCatalogue(liveViewer)).toBe(false)
  })

  test('an empty directory, because the API publishes none', async () => {
    /*
     * A real gap, not a deferral: there is no user search and no department
     * listing, and `/v1/me` describes only the caller — whose `email` and
     * `full_name` both come back blank. So a Grant can be sent and cannot be
     * composed, because the Author has nobody to pick.
     */
    expect(await httpAuthorization().directory()).toEqual({ individuals: [], groups: [] })
  })

  test('browsing is not re-filtered, since the Catalogue arrives filtered', async () => {
    expect(await httpAuthorization().mayConsumeDataset('peniremit.settlements', liveViewer)).toBe(true)
  })
})
