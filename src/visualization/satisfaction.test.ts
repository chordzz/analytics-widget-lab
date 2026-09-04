/**
 * Phase 1 acceptance: "given N fixture Datasets, the offered Type list is
 * correct and explains exclusions."
 *
 * Run with `bun test`.
 */

import { describe, expect, test } from 'bun:test'
import {
  accountingJournal,
  catalogueFixtures,
  corridorCoverage,
  iamActiveUsers,
  payrollDisbursements,
  peniremitSettlements,
} from '../catalogue/fixtures'
import { visualizationFamilies } from './families'
import { visualizationTypes } from './visualization-types'
import { canPresent, evaluateFamilies, offeredVisualizationTypes } from './registry'
import type { Satisfaction } from './data-shape'

type Status = Satisfaction['status']

const statusFor = (dataset: typeof peniremitSettlements, familyId: string, semantics = false): Status =>
  evaluateFamilies(dataset, { useProposedSemantics: semantics }).find(
    (e) => e.family.id === familyId,
  )!.satisfaction.status

// --- classification integrity (FR-VZ-01) -----------------------------------

describe('classification', () => {
  test('every Visualization Type belongs to a registered Family', () => {
    const familyIds = new Set(visualizationFamilies.map((f) => f.id))
    for (const type of visualizationTypes) {
      expect(familyIds.has(type.familyId)).toBe(true)
    }
  })

  test('every Family has at least one Visualization Type', () => {
    for (const family of visualizationFamilies) {
      expect(visualizationTypes.some((t) => t.familyId === family.id)).toBe(true)
    }
  })

  test('all thirteen Families of §4.2 are registered', () => {
    expect(visualizationFamilies).toHaveLength(13)
  })

  test('Family and Type ids are unique', () => {
    expect(new Set(visualizationFamilies.map((f) => f.id)).size).toBe(visualizationFamilies.length)
    expect(new Set(visualizationTypes.map((t) => t.id)).size).toBe(visualizationTypes.length)
  })
})

// --- the matrix: every fixture against every Family ------------------------

/** Expected status under the published model as the FRD defines it today. */
const EXPECTED_AS_PUBLISHED: Record<string, Record<string, Status>> = {
  'peniremit-settlements': {
    tabular: 'satisfied',
    trend: 'satisfied',
    'categorical-comparison': 'satisfied',
    composition: 'indeterminate',
    distribution: 'indeterminate',
    correlation: 'unsatisfied', // UC-02: only one Measure
    'ranking-and-flow': 'satisfied',
    geospatial: 'indeterminate',
    radial: 'satisfied',
    'single-value': 'satisfied',
    'temporal-pattern': 'satisfied',
    chronological: 'satisfied',
    status: 'satisfied',
  },
  'payroll-disbursements': {
    tabular: 'satisfied',
    trend: 'satisfied',
    'categorical-comparison': 'satisfied',
    composition: 'indeterminate',
    distribution: 'indeterminate',
    correlation: 'satisfied', // two Measures
    'ranking-and-flow': 'satisfied',
    geospatial: 'indeterminate',
    radial: 'satisfied',
    'single-value': 'satisfied',
    'temporal-pattern': 'satisfied',
    chronological: 'satisfied',
    status: 'satisfied',
  },
  'iam-active-users': {
    tabular: 'satisfied',
    trend: 'satisfied',
    'categorical-comparison': 'satisfied',
    composition: 'indeterminate',
    distribution: 'indeterminate',
    correlation: 'unsatisfied',
    'ranking-and-flow': 'satisfied',
    geospatial: 'indeterminate',
    radial: 'satisfied',
    'single-value': 'satisfied',
    'temporal-pattern': 'satisfied',
    chronological: 'satisfied',
    status: 'satisfied',
  },
  'peniremit-corridor-coverage': {
    tabular: 'satisfied',
    trend: 'unsatisfied', // no Time Dimension
    'categorical-comparison': 'satisfied',
    composition: 'indeterminate',
    distribution: 'indeterminate',
    correlation: 'unsatisfied',
    'ranking-and-flow': 'satisfied',
    geospatial: 'indeterminate',
    radial: 'satisfied',
    'single-value': 'satisfied',
    'temporal-pattern': 'unsatisfied',
    chronological: 'unsatisfied',
    status: 'satisfied',
  },
  'accounting-journal': {
    tabular: 'satisfied',
    trend: 'unsatisfied', // no Measure
    'categorical-comparison': 'unsatisfied',
    composition: 'unsatisfied',
    distribution: 'unsatisfied',
    correlation: 'unsatisfied',
    'ranking-and-flow': 'indeterminate', // no Measure, but has a stage-less state Dimension
    geospatial: 'unsatisfied',
    radial: 'unsatisfied',
    'single-value': 'unsatisfied',
    'temporal-pattern': 'unsatisfied',
    chronological: 'satisfied',
    status: 'indeterminate', // no Measure; only the state-Dimension route remains
  },
}

describe('Data Shape satisfaction — published model', () => {
  for (const dataset of catalogueFixtures) {
    const expected = EXPECTED_AS_PUBLISHED[dataset.id]

    describe(dataset.name, () => {
      for (const family of visualizationFamilies) {
        test(`${family.name} → ${expected[family.id]}`, () => {
          expect(statusFor(dataset, family.id)).toBe(expected[family.id])
        })
      }
    })
  }
})

// --- FR-VZ-05 -------------------------------------------------------------

describe('FR-VZ-05 — only satisfying Types are offered', () => {
  test('UC-02: settlements offers Trend and Categorical Comparison, never a scatter plot', () => {
    const offered = offeredVisualizationTypes(peniremitSettlements).map((t) => t.id)

    expect(offered).toContain('line-chart')
    expect(offered).toContain('bar-chart-vertical')
    expect(offered).not.toContain('scatter-plot')
    expect(offered).not.toContain('bubble-chart')
  })

  test('a second Measure makes Correlation eligible', () => {
    expect(canPresent(payrollDisbursements, 'scatter-plot')).toBe(true)
    expect(canPresent(peniremitSettlements, 'scatter-plot')).toBe(false)
  })

  test('indeterminate Families are not offered', () => {
    // Geospatial cannot be established under the published model, so its Types
    // must not appear even though the Dataset does carry a location Field.
    expect(canPresent(corridorCoverage, 'choropleth-map')).toBe(false)
  })

  test('a Dataset with no Measure offers no Measure-requiring Type', () => {
    const offered = offeredVisualizationTypes(accountingJournal).map((t) => t.id)
    expect(offered).not.toContain('stat-card')
    expect(offered).not.toContain('line-chart')
    expect(offered).toContain('activity-feed')
  })
})

// --- exclusions must be explained (UC-02) ----------------------------------

describe('exclusions are explained', () => {
  test('an unsatisfied Family states what is missing', () => {
    const correlation = evaluateFamilies(peniremitSettlements).find(
      (e) => e.family.id === 'correlation',
    )!
    expect(correlation.satisfaction.status).toBe('unsatisfied')
    if (correlation.satisfaction.status !== 'unsatisfied') throw new Error('unreachable')
    expect(correlation.satisfaction.unmet).toEqual(['at least 2 Measures'])
  })

  test('an indeterminate Family names the requirement and its resolution', () => {
    const geospatial = evaluateFamilies(corridorCoverage).find((e) => e.family.id === 'geospatial')!
    expect(geospatial.satisfaction.status).toBe('indeterminate')
    if (geospatial.satisfaction.status !== 'indeterminate') throw new Error('unreachable')
    expect(geospatial.satisfaction.undecided[0].requirement).toContain('location-typed Dimension')
    expect(geospatial.satisfaction.undecided[0].resolvedBy).toContain('geographic-area')
  })

  test('every non-satisfied outcome carries at least one reason', () => {
    for (const dataset of catalogueFixtures) {
      for (const { satisfaction } of evaluateFamilies(dataset)) {
        if (satisfaction.status === 'unsatisfied') expect(satisfaction.unmet.length).toBeGreaterThan(0)
        if (satisfaction.status === 'indeterminate')
          expect(satisfaction.undecided.length).toBeGreaterThan(0)
      }
    }
  })
})

// --- Finding 1: what the proposed extension would recover ------------------

describe('Finding 1 — proposed Field semantics', () => {
  test('no Family is indeterminate once semantics are permitted', () => {
    for (const dataset of catalogueFixtures) {
      for (const { family, satisfaction } of evaluateFamilies(dataset, {
        useProposedSemantics: true,
      })) {
        expect({ dataset: dataset.id, family: family.id, status: satisfaction.status }).not.toEqual({
          dataset: dataset.id,
          family: family.id,
          status: 'indeterminate',
        })
      }
    }
  })

  test('Geospatial resolves for a Dataset with a location Field', () => {
    expect(statusFor(corridorCoverage, 'geospatial')).toBe('indeterminate')
    expect(statusFor(corridorCoverage, 'geospatial', true)).toBe('satisfied')
  })

  test('Composition stays unsatisfied for a non-additive Measure', () => {
    // Active users are not summable across products. Semantics do not rescue
    // this Dataset — which is the point: the descriptor carries real meaning
    // rather than acting as a blanket unlock.
    expect(statusFor(iamActiveUsers, 'composition', true)).toBe('unsatisfied')
    expect(statusFor(peniremitSettlements, 'composition', true)).toBe('satisfied')
  })

  test('semantics never turn a satisfied Family unsatisfied', () => {
    for (const dataset of catalogueFixtures) {
      const asPublished = evaluateFamilies(dataset)
      const withSemantics = evaluateFamilies(dataset, { useProposedSemantics: true })

      asPublished.forEach((before, i) => {
        if (before.satisfaction.status === 'satisfied') {
          expect(withSemantics[i].satisfaction.status).toBe('satisfied')
        }
      })
    }
  })
})
