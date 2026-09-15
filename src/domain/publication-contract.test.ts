import { describe, expect, test } from 'bun:test'
import { validatePublication } from './publication-contract'
import { catalogueFixtures } from '../catalogue/fixtures'

const valid = () => ({
  id: 'demo',
  name: 'Demo',
  sourceSystem: 'Peniremit',
  classification: 'internal',
  exposesPersonalData: false,
  fields: [
    { key: 'occurred_at', label: 'Occurred at', role: 'time-dimension', filterable: true, sortable: true },
    {
      key: 'amount',
      label: 'Amount',
      role: 'measure',
      aggregations: ['sum'],
      filterable: false,
      sortable: true,
    },
  ],
  rowGrain: { dimensions: ['occurred_at'] },
  filterParameters: [{ name: 'occurred_at', label: 'Occurred at', required: false }],
})

const detailsOf = (candidate: unknown) =>
  validatePublication(candidate).violations.map((v) => v.detail)

describe('publication contract', () => {
  test('every fixture Dataset satisfies the contract', () => {
    for (const dataset of catalogueFixtures) {
      expect(validatePublication(dataset)).toEqual({ accepted: true, violations: [] })
    }
  })

  test('a complete submission is accepted', () => {
    expect(validatePublication(valid()).accepted).toBe(true)
  })

  test('a non-object submission is rejected rather than throwing', () => {
    expect(validatePublication(null).accepted).toBe(false)
    expect(validatePublication('a dataset').accepted).toBe(false)
  })
})

describe('FR-DP-08 — rejection identifies what is missing', () => {
  test('missing Source System', () => {
    const { sourceSystem, ...rest } = valid()
    void sourceSystem
    expect(detailsOf(rest)).toContain('No owning Source System was identified.')
  })

  test('a Field with no role', () => {
    const candidate = valid()
    delete (candidate.fields[0] as Record<string, unknown>).role
    expect(detailsOf(candidate)[0]).toContain('does not declare a role')
  })

  test('a Measure with no declared aggregations', () => {
    const candidate = valid()
    delete (candidate.fields[1] as Record<string, unknown>).aggregations
    expect(detailsOf(candidate)).toContain("Measure 'amount' declares no meaningful aggregations.")
  })

  test('an unrecognised aggregation', () => {
    const candidate = valid()
    ;(candidate.fields[1] as Record<string, unknown>).aggregations = ['median']
    expect(detailsOf(candidate)[0]).toContain("declares aggregation 'median'")
  })

  test('filterable and sortable omitted', () => {
    const candidate = valid()
    delete (candidate.fields[0] as Record<string, unknown>).filterable
    delete (candidate.fields[0] as Record<string, unknown>).sortable
    const details = detailsOf(candidate)
    expect(details).toContain("Field 'occurred_at' does not declare whether it is filterable.")
    expect(details).toContain("Field 'occurred_at' does not declare whether it is sortable.")
  })

  test('duplicate Field keys', () => {
    const candidate = valid()
    ;(candidate.fields[1] as Record<string, unknown>).key = 'occurred_at'
    expect(detailsOf(candidate)).toContain("Field key 'occurred_at' is used more than once.")
  })

  test('personal-data exposure left unstated', () => {
    const { exposesPersonalData, ...rest } = valid()
    void exposesPersonalData
    expect(detailsOf(rest)).toContain('The Dataset does not state whether it exposes personal data.')
  })

  test('all violations are reported in one pass, not just the first', () => {
    const verdict = validatePublication({ fields: [{}] })
    const rules = new Set(verdict.violations.map((v) => v.rule))
    // identity, source system, field description, filter/sort, classification, personal data
    expect(rules.size).toBeGreaterThanOrEqual(5)
  })

  test('every violation cites the requirement it enforces', () => {
    /*
     * Two shapes, and the second has to be distinguishable from the first.
     *
     * Most rules transcribe an FRD clause. Two are ours — the row grain and the
     * Filter Parameter declarations the published model has nowhere to put — and
     * a rule we invented must say so rather than borrowing the FRD's authority
     * for a requirement the FRD does not make. Each names the divergence
     * carrying the argument for it.
     */
    for (const violation of validatePublication({}).violations) {
      expect(violation.requirement).toMatch(
        /^(FR-DP-\d\d|Definitions|Proposed extension — D\d+$)/,
      )
      expect(violation.detail.length).toBeGreaterThan(0)
    }
  })
})

describe('publication is independent of visualization', () => {
  test('a Dataset satisfying no Visualization Family is still publishable', () => {
    // One Dimension, no Measure and no Time Dimension: eligible for Tabular
    // only. It must still publish — UC-08 requires a Dataset to outlive, and
    // precede, any Widget built from it.
    const sparse = {
      id: 'reference-corridors',
      name: 'Corridor reference list',
      sourceSystem: 'Peniremit',
      classification: 'public',
      exposesPersonalData: false,
      fields: [{ key: 'corridor', label: 'Corridor', role: 'dimension', filterable: true, sortable: true }],
      // One row per corridor. A reference list has a grain like anything else,
      // and declaring it is what stops an Author binding it to a stat card
      // expecting one number.
      rowGrain: { dimensions: ['corridor'] },
      filterParameters: [{ name: 'corridor', label: 'Corridor', required: false }],
    }
    expect(validatePublication(sparse).accepted).toBe(true)
  })
})
