/**
 * Phase 7 acceptance — UC-07, plus renderer coverage.
 */

import { describe, expect, test } from 'bun:test'
import { FakeGovernance, detectOverlaps } from './fake-governance'
import { malformedSubmission, peniremitActiveUsers, pendingSubmissions } from './pending-fixtures'
import { FakeAuthorization } from '../access/fake-authorization'
import { catalogueFixtures, iamActiveUsers, payrollDisbursements } from '../catalogue/fixtures'
import { validatePublication } from '../domain/publication-contract'
import { WIDGET_TYPES } from '../analytics/widgets/catalog'
import { getVisualizationType, visualizationTypes } from '../visualization/visualization-types'
import { visualizationFamilies } from '../visualization/families'
import type { ViewerIdentity } from '../retrieval/port'

/*
 * Which Visualization Types can be drawn.
 *
 * Was the workbench renderer registry, which merge §2 deleted along with the
 * renderers it registered. The product module's catalogue is the answer now, and
 * `analytics/widgets/built.test.ts` is what keeps its `built` flag from being a
 * claim — it fails if a type flagged built has no branch in the render switch.
 */
const drawableIds = new Set(
  WIDGET_TYPES.filter((type) => type.built).map((type) => type.id),
)

const admin: ViewerIdentity = { id: 'analytics-admin', displayName: 'Analytics administrator' }
const author: ViewerIdentity = { id: 'ops-lead', displayName: 'Operations lead' }

const authorization = new FakeAuthorization({
  identities: [admin, author],
  scopes: [],
  administrators: [admin.id],
})

const fresh = () => new FakeGovernance({ submissions: pendingSubmissions })

// --- FR-GV-02 / FR-GV-03 ---------------------------------------------------

describe('UC-07 — catching a duplicate before it spreads', () => {
  test('the second "active users" Dataset is flagged against the incumbent', () => {
    const findings = detectOverlaps(peniremitActiveUsers, catalogueFixtures)
    expect(findings.length).toBeGreaterThan(0)
    expect(findings.some((f) => f.incumbentId === iamActiveUsers.id)).toBe(true)
  })

  test('it is flagged on both name and content, which are different signals', () => {
    const findings = detectOverlaps(peniremitActiveUsers, catalogueFixtures).filter(
      (f) => f.incumbentId === iamActiveUsers.id,
    )
    expect(new Set(findings.map((f) => f.kind))).toEqual(new Set(['name', 'content']))
  })

  test('the danger is that it is perfectly well-formed', () => {
    // Nothing mechanical rejects this Dataset. Only an Administrator noticing
    // the overlap stops two incompatible "active users" figures circulating —
    // which is exactly why FR-GV-03 exists as a separate requirement.
    expect(validatePublication(peniremitActiveUsers).accepted).toBe(true)
  })

  test('unrelated Datasets are not flagged against each other', () => {
    const findings = detectOverlaps(payrollDisbursements, [iamActiveUsers])
    expect(findings).toHaveLength(0)
  })

  test('the overlap is surfaced while the Dataset is still pending', async () => {
    const governance = fresh()
    const pending = await governance.pendingPublications()
    const candidate = pending.find((p) => p.dataset.id === peniremitActiveUsers.id)!

    expect(candidate.status).toBe('pending')
    expect(candidate.overlaps.length).toBeGreaterThan(0)
    // Not yet in the Catalogue — that is what "before it enters general use" means.
    expect((await governance.reviewCatalogue()).some((d) => d.id === candidate.dataset.id)).toBe(
      false,
    )
  })

  test('an Administrator can reject and coordinate, or admit with a reason', async () => {
    const rejecting = fresh()
    await rejecting.resolve(peniremitActiveUsers.id, 'rejected', 'Coordinating one definition.')
    const rejected = (await rejecting.pendingPublications()).find(
      (p) => p.dataset.id === peniremitActiveUsers.id,
    )!
    expect(rejected.status).toBe('rejected')
    expect(rejected.resolution?.note).toContain('Coordinating')

    const admitting = fresh()
    await admitting.resolve(peniremitActiveUsers.id, 'admitted', 'Distinct metric; renamed.')
    expect(
      (await admitting.pendingPublications()).find((p) => p.dataset.id === peniremitActiveUsers.id)!
        .status,
    ).toBe('in-general-use')
  })
})

// --- FR-GV-04 --------------------------------------------------------------

describe('FR-GV-04 — the publication contract is not waivable', () => {
  test('an incomplete submission carries violations', async () => {
    const entry = (await fresh().pendingPublications()).find(
      (p) => p.dataset.id === malformedSubmission.id,
    )!
    expect(entry.violations.length).toBeGreaterThan(0)
  })

  test('an Administrator cannot admit it to general use', async () => {
    const governance = fresh()
    await expect(
      governance.resolve(malformedSubmission.id, 'admitted', 'Looks fine to me.'),
    ).rejects.toThrow(/publication contract/)

    expect(
      (await governance.pendingPublications()).find((p) => p.dataset.id === malformedSubmission.id)!
        .status,
    ).toBe('pending')
  })

  test('but they may still reject it — incompleteness is a reason to send it back', async () => {
    const governance = fresh()
    await governance.resolve(malformedSubmission.id, 'rejected', 'Missing classification.')
    expect(
      (await governance.pendingPublications()).find((p) => p.dataset.id === malformedSubmission.id)!
        .status,
    ).toBe('rejected')
  })
})

// --- FR-GV-01 --------------------------------------------------------------

describe('FR-GV-01 — reviewing the complete Catalogue', () => {
  test('every published Dataset is returned, unfiltered by consume authorization', async () => {
    const reviewed = await fresh().reviewCatalogue()
    expect(reviewed).toHaveLength(catalogueFixtures.length)
  })

  test('each carries its owning Source System, classification and Field descriptions', async () => {
    for (const dataset of await fresh().reviewCatalogue()) {
      expect(dataset.sourceSystem.length).toBeGreaterThan(0)
      expect(dataset.classification.length).toBeGreaterThan(0)
      expect(dataset.fields.length).toBeGreaterThan(0)
      for (const field of dataset.fields) expect(field.label.length).toBeGreaterThan(0)
    }
  })

  test('the surface is gated on the Analytics Administrator user class', async () => {
    expect(await authorization.mayAdministerCatalogue(admin)).toBe(true)
    expect(await authorization.mayAdministerCatalogue(author)).toBe(false)
  })

  test('nothing on the governance port returns records', () => {
    // The wider view is only safe because reviewing a description is not
    // consuming data. If a method ever returned rows, FR-DP-12 would be
    // circumventable by holding the Administrator class.
    const surface = Object.getOwnPropertyNames(FakeGovernance.prototype)
    expect(surface.sort()).toEqual(
      ['constructor', 'pendingPublications', 'resolve', 'reviewCatalogue', 'subscribe'].sort(),
    )
  })
})

// --- renderer coverage -----------------------------------------------------

describe('renderer coverage', () => {
  /*
   * The module builds one Type the FRD does not classify — `status-list`, the
   * proposed 43rd (D7). It is excluded here rather than filtered silently: this
   * block is about the relationship between classification and rendering, and a
   * deliberate proposal is not a hole in that relationship.
   */
  const classified = [...drawableIds].filter((id) => getVisualizationType(id) !== undefined)

  test('every drawable Type maps to a classified Visualization Type, bar the proposed one', () => {
    const unclassified = [...drawableIds].filter((id) => getVisualizationType(id) === undefined)
    expect(unclassified).toEqual(['status-list'])
  })

  test('all thirteen Families can now be drawn', () => {
    /*
     * Was nine of thirteen, when this counted the workbench's renderers.
     * Composition, Distribution, Geospatial and Temporal Pattern were the four
     * missing, and the recorded reason was Finding 1 — the publication model
     * could not express additivity, record volume or location. The module's
     * datasets declare all three, so those Families are drawable and the gap
     * moved from Families to six individual Types.
     */
    const covered = new Set(classified.map((id) => getVisualizationType(id)!.familyId))
    expect(covered.size).toBe(visualizationFamilies.length)
  })

  test('the remaining gap is Types, and each has a recorded reason', () => {
    // The Family-level assertion above is now trivially satisfiable, so the
    // property it used to carry lives here: what is unbuilt is enumerable, and
    // `contract-docs/render.test.ts` asserts every entry has a stated reason.
    const drawable = new Set(classified)
    const unbuilt = visualizationTypes.filter((type) => !drawable.has(type.id)).map((t) => t.id)

    expect(unbuilt.sort()).toEqual(['choropleth-map'])
  })

  /*
   * This asserted `drawable < all`, which was true while five Types were
   * ordinary work nobody had done. Those five are built, and the one that is
   * left is left for a reason that is not about renderer effort: a choropleth
   * needs roughly 100KB of boundary geometry bundled into every host, whether
   * or not it draws maps, and that dependency has never been agreed.
   *
   * So the inequality would now pass on a single deliberate omission and keep
   * passing if someone deleted four renderers. The property worth holding is
   * the one that was always underneath it: classification is independent of
   * rendering — all 42 Types are classified — and the gap between the two is
   * exactly the standing decision, named.
   */
  test('classification stays ahead of rendering, and the gap is one named decision', () => {
    expect(visualizationTypes).toHaveLength(42)

    const undrawable = visualizationTypes
      .map((type) => type.id)
      .filter((id) => !drawableIds.has(id))
    expect(undrawable).toEqual(['choropleth-map'])
  })
})
