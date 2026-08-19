/**
 * Phase 6 acceptance — UC-04 and UC-05.
 */

import { describe, expect, test } from 'bun:test'
import { FakeAuthorization } from './fake-authorization'
import { InMemoryAccessRecorder } from './fake-access-recorder'
import { canViewDashboard, evaluateGrant, evaluateGrants, visibleDashboards } from './dashboard-access'
import { FakeDatasetRetrieval } from '../retrieval/fake-retrieval'
import { FakeCatalogue } from '../catalogue/fake-catalogue'
import { emptyDashboard } from '../domain/dashboard'
import type { Dashboard, ShareGrant } from '../domain/dashboard'
import type { ViewerIdentity } from '../retrieval/port'

const opsLead: ViewerIdentity = {
  id: 'ops-lead',
  displayName: 'Operations lead',
  organizationalScopeIds: ['operations'],
}
const financeAnalyst: ViewerIdentity = {
  id: 'finance-analyst',
  displayName: 'Finance analyst',
  organizationalScopeIds: ['finance'],
}
const opsAnalyst: ViewerIdentity = {
  id: 'ops-analyst',
  displayName: 'Operations analyst',
  organizationalScopeIds: ['operations'],
}

const authorization = new FakeAuthorization({
  identities: [opsLead, financeAnalyst, opsAnalyst],
  scopes: [
    { scopeId: 'operations', label: 'Operations' },
    { scopeId: 'finance', label: 'Finance' },
  ],
  // The finance analyst sits outside Peniremit's organizational scope.
  consumableDatasets: {
    'finance-analyst': ['payroll-disbursements', 'iam-active-users', 'accounting-journal'],
  },
})

const grant = (over: Partial<ShareGrant> = {}): ShareGrant => ({
  id: 'g1',
  recipientKind: 'individual',
  recipientId: 'finance-analyst',
  recipientLabel: 'Finance analyst',
  ...over,
})

const dashboard = (over: Partial<Dashboard> = {}): Dashboard => ({
  ...emptyDashboard('d1', 'Monthly review', opsLead.id),
  status: 'published',
  ...over,
})

// --- UC-04 -----------------------------------------------------------------

describe('UC-04 — partial denial', () => {
  const retrieval = new FakeDatasetRetrieval({ authorization })

  test('the analyst is authorized for Payroll and denied Peniremit, per Dataset', async () => {
    const payroll = await retrieval.retrieve('payroll-disbursements', {}, financeAnalyst)
    const peniremit = await retrieval.retrieve('peniremit-settlements', {}, financeAnalyst)

    expect(payroll.kind).toBe('rows')
    expect(peniremit.kind).toBe('denied')
  })

  test('denial is its own outcome — never empty, never a thrown error', async () => {
    const outcome = await retrieval.retrieve('peniremit-settlements', {}, financeAnalyst)
    // An empty chart teaches the Viewer the figure is zero; an error teaches
    // them the system is broken. Both are worse than saying access was denied.
    expect(outcome.kind).not.toBe('empty')
    expect(outcome).toEqual({ kind: 'denied' })
  })

  test('one denied Dataset leaves the others working', async () => {
    const outcomes = await Promise.all(
      ['peniremit-settlements', 'payroll-disbursements', 'iam-active-users'].map((id) =>
        retrieval.retrieve(id, {}, financeAnalyst),
      ),
    )
    expect(outcomes.map((o) => o.kind)).toEqual(['denied', 'rows', 'rows'])
  })

  test('FR-DA-12 — a denied Dataset leaks nothing through a filter control either', async () => {
    const values = await retrieval.listFilterValues('peniremit-settlements', 'corridor', financeAnalyst)
    expect(values).toEqual([])

    // The same call for an authorized Viewer does return values, so the empty
    // result above is a denial rather than an absent Field.
    expect(
      (await retrieval.listFilterValues('peniremit-settlements', 'corridor', opsLead)).length,
    ).toBeGreaterThan(0)
  })

  test('the Catalogue does not advertise what retrieval would refuse', async () => {
    const catalogue = new FakeCatalogue({ authorization })
    const visible = (await catalogue.browse(financeAnalyst)).map((d) => d.id)

    expect(visible).not.toContain('peniremit-settlements')
    expect(visible).toContain('payroll-disbursements')
    expect(await catalogue.describe('peniremit-settlements', financeAnalyst)).toBeNull()
  })
})

// --- FR-DA-14 --------------------------------------------------------------

describe('FR-DA-14 — personal-data access recording', () => {
  test('serving a personal-data Dataset is recorded; serving others is not', async () => {
    const recorder = new InMemoryAccessRecorder()
    const retrieval = new FakeDatasetRetrieval({ authorization, accessRecorder: recorder })

    await retrieval.retrieve('payroll-disbursements', {}, financeAnalyst) // personal data
    await retrieval.retrieve('iam-active-users', {}, financeAnalyst) // not

    const log = await recorder.list()
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({
      viewerId: 'finance-analyst',
      datasetId: 'payroll-disbursements',
    })
    expect(log[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test('a denied retrieval exposes nothing, so records nothing', async () => {
    const recorder = new InMemoryAccessRecorder()
    const retrieval = new FakeDatasetRetrieval({ authorization, accessRecorder: recorder })

    // Payroll carries personal data, but this Viewer may not consume it.
    const restricted = new FakeAuthorization({
      identities: [opsLead],
      scopes: [],
      consumableDatasets: { 'ops-lead': [] },
    })
    const blocked = new FakeDatasetRetrieval({
      authorization: restricted,
      accessRecorder: recorder,
    })

    expect((await blocked.retrieve('payroll-disbursements', {}, opsLead)).kind).toBe('denied')
    expect(await recorder.list()).toHaveLength(0)

    // Sanity: the same recorder does capture a permitted access.
    await retrieval.retrieve('payroll-disbursements', {}, opsLead)
    expect(await recorder.list()).toHaveLength(1)
  })
})

// --- UC-05 -----------------------------------------------------------------

describe('UC-05 — scope and share', () => {
  const operations = dashboard({
    scope: { kind: 'organizational-scope', scopeId: 'operations', label: 'Operations' },
  })

  test('a Grant to someone outside the Scope does not take effect, and says why', async () => {
    const verdict = await evaluateGrant(grant(), operations.scope, authorization)

    expect(verdict.effective).toBe(false)
    expect(verdict.reach).toBe(0)
    expect(verdict.reason).toContain('does not belong to Operations')
    expect(verdict.reason).toContain('cannot reach beyond it')
  })

  test('a Grant to someone inside the Scope takes effect', async () => {
    const verdict = await evaluateGrant(
      grant({ recipientId: 'ops-analyst', recipientLabel: 'Operations analyst' }),
      operations.scope,
      authorization,
    )
    expect(verdict).toMatchObject({ effective: true, reach: 1 })
  })

  test('an unresolvable recipient is reported differently from an out-of-scope one', async () => {
    const verdict = await evaluateGrant(
      grant({ recipientId: 'nobody', recipientLabel: 'Nobody' }),
      operations.scope,
      authorization,
    )
    expect(verdict.effective).toBe(false)
    expect(verdict.reason).toContain('could not be resolved')
  })

  test('granting on a Personal Dashboard explains that the Scope must widen first', async () => {
    const verdict = await evaluateGrant(grant(), { kind: 'personal' }, authorization)
    expect(verdict.effective).toBe(false)
    expect(verdict.reason).toContain('Widen the Scope first')
  })

  test('a group Grant reaches every member inside the Scope', async () => {
    const verdict = await evaluateGrant(
      grant({ recipientKind: 'group', recipientId: 'operations', recipientLabel: 'Operations' }),
      operations.scope,
      authorization,
    )
    expect(verdict).toMatchObject({ effective: true, reach: 2 })
  })
})

// --- visibility ------------------------------------------------------------

describe('Dashboard visibility', () => {
  test('FR-DA-02 — a Personal Dashboard is the Author’s alone', async () => {
    const personal = dashboard({ scope: { kind: 'personal' } })
    expect(await canViewDashboard(personal, opsLead, authorization)).toBe(true)
    expect(await canViewDashboard(personal, opsAnalyst, authorization)).toBe(false)
  })

  test('FR-DA-04 — an Organization-wide Dashboard is visible to any authenticated identity', async () => {
    const wide = dashboard({ scope: { kind: 'organization-wide' } })
    expect(await canViewDashboard(wide, financeAnalyst, authorization)).toBe(true)
  })

  test('FR-DA-03 — an organizational Scope admits its members and no one else', async () => {
    const ops = dashboard({
      scope: { kind: 'organizational-scope', scopeId: 'operations', label: 'Operations' },
    })
    expect(await canViewDashboard(ops, opsAnalyst, authorization)).toBe(true)
    expect(await canViewDashboard(ops, financeAnalyst, authorization)).toBe(false)
  })

  test('FR-CO-04 — a draft is invisible to everyone but its Author', async () => {
    const draft = dashboard({ status: 'draft', scope: { kind: 'organization-wide' } })
    expect(await canViewDashboard(draft, opsLead, authorization)).toBe(true)
    expect(await canViewDashboard(draft, financeAnalyst, authorization)).toBe(false)
  })

  test('Grants narrow the audience within the Scope (Finding 11)', async () => {
    const ops = dashboard({
      scope: { kind: 'organizational-scope', scopeId: 'operations', label: 'Operations' },
    })
    // Without Grants, every Operations member sees it.
    expect(await canViewDashboard(ops, opsAnalyst, authorization)).toBe(true)

    // Adding a Grant naming only the Author narrows it — the analyst, still in
    // Scope, is no longer named.
    const narrowed = {
      ...ops,
      shareGrants: [grant({ recipientId: 'ops-lead', recipientLabel: 'Operations lead' })],
    }
    expect(await canViewDashboard(narrowed, opsAnalyst, authorization)).toBe(false)
    expect(await canViewDashboard(narrowed, opsLead, authorization)).toBe(true)
  })

  test('an ineffective Grant does not narrow anything', async () => {
    const ops = dashboard({
      scope: { kind: 'organizational-scope', scopeId: 'operations', label: 'Operations' },
      // Names someone outside the Scope, so it never takes effect.
      shareGrants: [grant()],
    })

    expect((await evaluateGrants(ops, authorization))[0].effective).toBe(false)
    // The Dashboard therefore behaves as though it had no Grants at all.
    expect(await canViewDashboard(ops, opsAnalyst, authorization)).toBe(true)
    // And still cannot reach the out-of-scope recipient.
    expect(await canViewDashboard(ops, financeAnalyst, authorization)).toBe(false)
  })

  test('a Grant never reaches beyond the Scope, however it is written', async () => {
    const ops = dashboard({
      scope: { kind: 'organizational-scope', scopeId: 'operations', label: 'Operations' },
      shareGrants: [
        grant(),
        grant({ id: 'g2', recipientKind: 'group', recipientId: 'finance', recipientLabel: 'Finance' }),
      ],
    })
    expect(await canViewDashboard(ops, financeAnalyst, authorization)).toBe(false)
  })

  test('visibleDashboards filters a mixed set', async () => {
    const all = [
      dashboard({ id: 'a', scope: { kind: 'personal' } }),
      dashboard({ id: 'b', scope: { kind: 'organization-wide' } }),
      dashboard({
        id: 'c',
        scope: { kind: 'organizational-scope', scopeId: 'operations', label: 'Operations' },
      }),
    ]
    expect((await visibleDashboards(all, financeAnalyst, authorization)).map((d) => d.id)).toEqual([
      'b',
    ])
    expect((await visibleDashboards(all, opsAnalyst, authorization)).map((d) => d.id)).toEqual([
      'b',
      'c',
    ])
  })
})
