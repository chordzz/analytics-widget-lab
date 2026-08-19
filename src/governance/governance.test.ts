/**
 * Phase 7 acceptance — UC-07, plus renderer coverage.
 */

import { describe, expect, test } from 'bun:test'
import { FakeGovernance, detectOverlaps } from './fake-governance'
import { malformedSubmission, peniremitActiveUsers, pendingSubmissions } from './pending-fixtures'
import { FakeAuthorization } from '../access/fake-authorization'
import { catalogueFixtures, iamActiveUsers, payrollDisbursements } from '../catalogue/fixtures'
import { validatePublication } from '../domain/publication-contract'
import { registerBuiltInRenderers } from '../renderers'
import { registeredRendererIds } from '../widget-runtime/renderer'
import { getVisualizationType, visualizationTypes } from '../visualization/visualization-types'
import { visualizationFamilies } from '../visualization/families'
import type { ViewerIdentity } from '../retrieval/port'

registerBuiltInRenderers()

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
  test('every registered renderer maps to a classified Visualization Type', () => {
    for (const id of registeredRendererIds()) {
      expect(getVisualizationType(id)).toBeDefined()
    }
  })

  test('nine of the thirteen Families can now be drawn', () => {
    const covered = new Set(
      registeredRendererIds().map((id) => getVisualizationType(id)!.familyId),
    )
    expect(covered.size).toBe(9)
  })

  test('the four unbuilt Families are unbuilt for recorded reasons', () => {
    const covered = new Set(
      registeredRendererIds().map((id) => getVisualizationType(id)!.familyId),
    )
    const uncovered = visualizationFamilies.filter((f) => !covered.has(f.id)).map((f) => f.id)

    // Composition, Distribution and Geospatial cannot be evaluated at all under
    // the current publication model (Finding 1); Temporal Pattern needs
    // daily-grain data the monthly fixtures do not carry.
    expect(uncovered.sort()).toEqual(
      ['composition', 'distribution', 'geospatial', 'temporal-pattern'].sort(),
    )
  })

  test('classification stays ahead of rendering, as intended', () => {
    // All 42 Types are classified whether or not anything can draw them —
    // FR-VZ-01/02 are satisfied independently of renderer work.
    expect(visualizationTypes).toHaveLength(42)
    expect(registeredRendererIds().length).toBeLessThan(visualizationTypes.length)
  })
})
