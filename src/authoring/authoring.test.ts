/**
 * Phase 3 acceptance: UC-02 end to end.
 *
 * Run with `bun test`.
 */

import { describe, expect, test } from 'bun:test'
import { FakeCatalogue } from '../catalogue/fake-catalogue'
import { FakeDatasetRetrieval } from '../retrieval/fake-retrieval'
import { InMemoryDashboardStore } from '../dashboard/store'
import { FakeAuthorization } from '../access/fake-authorization'
import { emptyDashboard } from '../domain/dashboard'
import {
  defaultMapping,
  fieldsAcceptedBy,
  slotValues,
  slotsForVisualizationType,
  validateMapping,
  withSlotValues,
} from './mapping'
import { offeredVisualizationTypes } from '../visualization/registry'
import { visualizationFamilies } from '../visualization/families'
import { slotsForFamily } from '../visualization/mapping-slots'
import { catalogueFixtures, peniremitSettlements } from '../catalogue/fixtures'
import { registerBuiltInRenderers } from '../renderers'
import { registeredRendererIds } from '../widget-runtime/renderer'
import type { ViewerIdentity } from '../retrieval/port'
import type { Widget } from '../domain/widget'

registerBuiltInRenderers()

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

const CONSUMABLE = {
  'finance-analyst': ['payroll-disbursements', 'iam-active-users', 'accounting-journal'],
}

const scopes = [
  { scopeId: 'operations', label: 'Operations' },
  { scopeId: 'finance', label: 'Finance' },
]

/** Unrestricted: every identity may consume everything. */
const openAuth = new FakeAuthorization({ identities: [opsLead, financeAnalyst], scopes })

/** The finance analyst sits outside Peniremit's organizational scope. */
const restrictedAuth = new FakeAuthorization({
  identities: [opsLead, financeAnalyst],
  scopes,
  consumableDatasets: CONSUMABLE,
})

// --- D1: the Catalogue -----------------------------------------------------

describe('D1 — Catalogue', () => {
  test('browsing returns descriptions for every Dataset an unrestricted Viewer may consume', async () => {
    const catalogue = new FakeCatalogue({ authorization: openAuth })
    const results = await catalogue.browse(opsLead)
    expect(results).toHaveLength(catalogueFixtures.length)
    expect(results[0]).toHaveProperty('measureCount')
  })

  test('FR-DP-12 — browsing shows only authorized Datasets', async () => {
    const catalogue = new FakeCatalogue({ authorization: restrictedAuth })
    const ids = (await catalogue.browse(financeAnalyst)).map((d) => d.id)

    expect(ids).not.toContain('peniremit-settlements')
    expect(ids).toContain('payroll-disbursements')
  })

  test('describing an unauthorized Dataset is indistinguishable from one that does not exist', async () => {
    const catalogue = new FakeCatalogue({ authorization: restrictedAuth })
    expect(await catalogue.describe('peniremit-settlements', financeAnalyst)).toBeNull()
    expect(await catalogue.describe('no-such-dataset', financeAnalyst)).toBeNull()
  })

  test('FR-DP-11 — the Catalogue offers no way to retrieve records', () => {
    // Structural, not behavioural: browsing cannot pull data by accident
    // because the port exposes nothing that returns rows.
    const catalogue = new FakeCatalogue({ authorization: openAuth })
    const surface = [
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(catalogue)),
      ...Object.keys(catalogue),
    ]
    expect(surface).not.toContain('retrieve')
    expect(surface.filter((m) => m !== 'constructor').sort()).toEqual([
      'browse',
      'describe',
      'options',
      'visibleTo',
    ])
  })

  test('a withdrawn Dataset leaves the Catalogue (FR-DP-13)', async () => {
    const catalogue = new FakeCatalogue({ authorization: openAuth, withdrawn: ['peniremit-settlements'] })
    const ids = (await catalogue.browse(opsLead)).map((d) => d.id)
    expect(ids).not.toContain('peniremit-settlements')
  })
})

// --- D2: binding -----------------------------------------------------------

describe('D2 — binding', () => {
  test('UC-02 — settlements offers a trend chart and a categorical comparison, not a scatter plot', () => {
    const offered = offeredVisualizationTypes(peniremitSettlements).map((t) => t.id)
    expect(offered).toContain('line-chart')
    expect(offered).toContain('bar-chart-vertical')
    expect(offered).not.toContain('scatter-plot')
  })

  test('every Family declares mapping slots consistent with its Data Shape', () => {
    for (const family of visualizationFamilies) {
      const slots = slotsForFamily(family.id)
      expect({ family: family.id, hasSlots: slots.length > 0 }).toEqual({
        family: family.id,
        hasSlots: true,
      })

      // A shape requiring a Time Dimension must have a slot to put one in.
      const needsTime = family.dataShape.clauses.some((c) => c.describe.includes('Time Dimension'))
      if (needsTime) {
        expect(slots.some((s) => s.id === 'timeDimension' && s.min >= 1)).toBe(true)
      }

      // Likewise for Measures, where the shape names a definite minimum.
      const measureClause = family.dataShape.clauses.find((c) => /\bMeasures?\b/.test(c.describe))
      if (measureClause?.describe === 'at least 2 Measures') {
        expect(slots.find((s) => s.id === 'measures')?.min).toBe(2)
      }
    }
  })

  test('a default mapping is proposed and is immediately valid', () => {
    for (const type of offeredVisualizationTypes(peniremitSettlements)) {
      if (!registeredRendererIds().includes(type.id)) continue
      const mapping = defaultMapping(peniremitSettlements, type.id)
      expect({ type: type.id, problems: validateMapping(mapping, type.id) }).toEqual({
        type: type.id,
        problems: [],
      })
    }
  })

  test('a Measure is mapped with an aggregation the publisher declared meaningful', () => {
    const mapping = defaultMapping(peniremitSettlements, 'line-chart')
    const declared = peniremitSettlements.fields.find((f) => f.key === 'settlement_value')
    expect(declared?.role).toBe('measure')
    if (declared?.role !== 'measure') throw new Error('unreachable')
    expect(declared.aggregations).toContain(mapping.measures![0].aggregation)
  })

  test('slots only accept Fields of the role they declare', () => {
    for (const slot of slotsForVisualizationType('line-chart')) {
      for (const field of fieldsAcceptedBy(peniremitSettlements, slot)) {
        expect(slot.accepts).toContain(field.role)
      }
    }
  })

  test('an incomplete mapping reports what is missing rather than binding', () => {
    const slots = slotsForVisualizationType('line-chart')
    const timeSlot = slots.find((s) => s.id === 'timeDimension')!
    const cleared = withSlotValues(
      defaultMapping(peniremitSettlements, 'line-chart'),
      timeSlot,
      [],
      peniremitSettlements,
    )

    const problems = validateMapping(cleared, 'line-chart')
    expect(problems).toHaveLength(1)
    expect(problems[0].detail).toContain('time axis')
  })

  test('a single-valued slot holds one Field at a time', () => {
    const slots = slotsForVisualizationType('bar-chart-vertical')
    const categorySlot = slots.find((s) => s.id === 'dimensions')!
    expect(categorySlot.max).toBe(1)

    const mapping = withSlotValues({}, categorySlot, ['corridor'], peniremitSettlements)
    expect(slotValues(mapping, categorySlot)).toEqual(['corridor'])
  })
})

// --- D3 + FR-CO-04: exposure, draft, publish -------------------------------

describe('D3 and publication', () => {
  const widget: Widget = {
    id: 'settlements-trend',
    datasetId: 'peniremit-settlements',
    visualizationTypeId: 'line-chart',
    mapping: defaultMapping(peniremitSettlements, 'line-chart'),
    exposedFilters: ['corridor'],
  }

  test('FR-VZ-06 — only Fields declared filterable can be exposed', () => {
    for (const key of widget.exposedFilters ?? []) {
      const field = peniremitSettlements.fields.find((f) => f.key === key)
      expect(field?.filterable).toBe(true)
    }
  })

  test('FR-CO-04 — a draft is visible to its Author and to nobody else', async () => {
    const store = new InMemoryDashboardStore(openAuth)
    const dashboard = emptyDashboard('d1', 'Settlements review', opsLead.id)
    await store.save(
      {
        ...dashboard,
        widgets: { [widget.id]: widget },
        placements: [{ widgetId: widget.id, x: 0, y: 0, w: 12, h: 8 }],
      },
      opsLead,
    )

    expect(await store.list(opsLead)).toHaveLength(1)
    expect(await store.list(financeAnalyst)).toHaveLength(0)
    expect(await store.load('d1', financeAnalyst)).toBeNull()
  })

  test('publishing makes a Dashboard visible, and is a separate act from saving', async () => {
    const store = new InMemoryDashboardStore(openAuth)
    await store.save(
      {
        ...emptyDashboard('d1', 'Settlements review', opsLead.id),
        scope: { kind: 'organization-wide' },
      },
      opsLead,
    )

    // Saving alone does not publish — an Author reviews first (FR-CO-04).
    expect((await store.load('d1', opsLead))!.status).toBe('draft')
    expect(await store.list(financeAnalyst)).toHaveLength(0)

    await store.publish('d1', opsLead)
    expect((await store.load('d1', opsLead))!.status).toBe('published')
    expect(await store.list(financeAnalyst)).toHaveLength(1)
  })

  test('only the Author may publish', async () => {
    const store = new InMemoryDashboardStore(openAuth)
    await store.save(emptyDashboard('d1', 'Settlements review', opsLead.id), opsLead)
    expect(store.publish('d1', financeAnalyst)).rejects.toThrow('Author')
  })

  test('every Dashboard has a Scope (FR-DA-01), defaulting to Personal', () => {
    expect(emptyDashboard('d1', 'X', opsLead.id).scope).toEqual({ kind: 'personal' })
  })

  test('FR-DA-02 — publishing does not override a Personal Scope', async () => {
    // Publishing means "I have finished reviewing", not "everyone may see it".
    // Status and Scope are separate gates and both must pass.
    const store = new InMemoryDashboardStore(openAuth)
    await store.save(emptyDashboard('d1', 'Private notes', opsLead.id), opsLead)
    await store.publish('d1', opsLead)

    expect(await store.list(opsLead)).toHaveLength(1)
    expect(await store.list(financeAnalyst)).toHaveLength(0)
    expect(await store.load('d1', financeAnalyst)).toBeNull()
  })

  test('FR-DA-03 — an organizational Scope admits its members and nobody else', async () => {
    const store = new InMemoryDashboardStore(openAuth)
    await store.save(
      {
        ...emptyDashboard('d1', 'Ops review', opsLead.id),
        scope: { kind: 'organizational-scope', scopeId: 'operations', label: 'Operations' },
      },
      opsLead,
    )
    await store.publish('d1', opsLead)

    expect(await store.load('d1', financeAnalyst)).toBeNull()
    expect(
      await store.load('d1', { ...financeAnalyst, organizationalScopeIds: ['operations'] }),
    ).not.toBeNull()
  })

  test('FR-DA-04 — organization-wide admits any authenticated identity', async () => {
    const store = new InMemoryDashboardStore(openAuth)
    await store.save(
      { ...emptyDashboard('d1', 'All hands', opsLead.id), scope: { kind: 'organization-wide' } },
      opsLead,
    )
    await store.publish('d1', opsLead)
    expect(await store.load('d1', financeAnalyst)).not.toBeNull()
  })

  // FR-DA-07 / FR-DA-08 now live in src/access/dashboard-access.ts, where the
  // verdict carries the reason the Author is owed. Covered there.

  test('a Share Grant narrows an organization-wide Dashboard to its recipients', async () => {
    const store = new InMemoryDashboardStore(openAuth)
    await store.save(
      {
        ...emptyDashboard('d1', 'Selective', opsLead.id),
        scope: { kind: 'organization-wide' },
        shareGrants: [
          {
            id: 'g1',
            recipientKind: 'individual',
            recipientId: financeAnalyst.id,
            recipientLabel: financeAnalyst.displayName,
          },
        ],
      },
      opsLead,
    )
    await store.publish('d1', opsLead)

    // Named, and inside an organization-wide Scope, so the Grant takes effect.
    expect(await store.load('d1', financeAnalyst)).not.toBeNull()
    // In Scope but not named — the Grant narrowed the audience past them.
    expect(await store.load('d1', { id: 'ops-analyst', displayName: 'Operations analyst' })).toBeNull()
    // The Author always retains their own Dashboard.
    expect(await store.load('d1', opsLead)).not.toBeNull()
  })

  test('Widgets are referenced by id, not embedded (Finding 4)', () => {
    const dashboard = emptyDashboard('d1', 'X', opsLead.id)
    const withWidget = {
      ...dashboard,
      widgets: { [widget.id]: widget },
      placements: [{ widgetId: widget.id, span: 12, order: 0 }],
    }
    // A placement carries an id, so the same Widget could be placed on a second
    // Dashboard without being copied (FR-VZ-09).
    expect(withWidget.placements[0]).toEqual({ widgetId: 'settlements-trend', span: 12, order: 0 })
  })
})

// --- FR-DA-09/12: authorization survives binding ---------------------------

describe('authorization is re-checked at retrieval, not only at binding', () => {
  test('a Widget bound to a Dataset the Viewer cannot consume is denied', async () => {
    const retrieval = new FakeDatasetRetrieval({ latencyMs: 0, authorization: restrictedAuth })

    const denied = await retrieval.retrieve(
      'peniremit-settlements',
      { dimensions: ['settled_at'], measures: [{ field: 'settlement_value', aggregation: 'sum' }] },
      financeAnalyst,
    )
    expect(denied.kind).toBe('denied')

    const allowed = await retrieval.retrieve(
      'payroll-disbursements',
      { dimensions: ['disbursed_on'], measures: [{ field: 'gross_amount', aggregation: 'sum' }] },
      financeAnalyst,
    )
    expect(allowed.kind).toBe('rows')
  })

  test('FR-DA-12 — an exposed filter does not leak values from a denied Dataset', async () => {
    const retrieval = new FakeDatasetRetrieval({ latencyMs: 0, authorization: restrictedAuth })
    expect(
      await retrieval.listFilterValues('peniremit-settlements', 'corridor', financeAnalyst),
    ).toEqual([])
    expect(
      (await retrieval.listFilterValues('peniremit-settlements', 'corridor', opsLead)).length,
    ).toBeGreaterThan(0)
  })
})
