/**
 * The module's fixtures against the enforceable publication contract.
 *
 * Merge Plan Stage 2's exit criterion. The module's 13 datasets were authored
 * against a lighter model of its own — `kind` instead of `role`, nothing about
 * who published them or who may see them — so "they adopted the FRD's model" is
 * a claim that needs checking rather than asserting. `validatePublication` is
 * the same function the backend is expected to mirror; if a fixture cannot pass
 * it, neither could the real Source System publishing that shape.
 *
 * This also stops the fixtures quietly drifting back. Adding a Measure without
 * declaring its meaningful aggregations is easy, harmless-looking, and exactly
 * what FR-DP-04 exists to prevent.
 */

import { describe, expect, test } from 'bun:test'
import { datasets, rowCountOf, rowsFor } from './datasets'
import { validatePublication } from '../../domain/publication-contract'
import { isCoordinate, isGeographic } from './types'

describe('every fixture is a publishable Dataset', () => {
  test('all 13 satisfy the enforceable contract', () => {
    const failed = datasets
      .map((dataset) => ({ id: dataset.id, verdict: validatePublication(dataset) }))
      .filter((entry) => !entry.verdict.accepted)
      .map((entry) => ({ id: entry.id, violations: entry.verdict.violations }))

    expect(failed).toEqual([])
  })

  test('there are still 13 of them', () => {
    expect(datasets).toHaveLength(13)
  })
})

describe('a Dataset describes, it does not carry', () => {
  test('no Dataset exposes rows', () => {
    // The whole point of Stage 2. While the two were one object, every consumer
    // could reach records by accident — and `Widget` did, in a render body.
    const leaking = datasets.filter((dataset) => 'rows' in dataset)
    expect(leaking.map((d) => d.id)).toEqual([])
  })

  test('records are reachable only by asking for them', () => {
    for (const dataset of datasets) {
      expect(rowsFor(dataset.id).length).toBeGreaterThan(0)
      expect(rowCountOf(dataset.id)).toBe(rowsFor(dataset.id).length)
    }
  })

  test('asking about a dataset that does not exist is empty, not a throw', () => {
    // A widget bound to a withdrawn Dataset must render a state, not crash the
    // board. The state itself is Stage 3's problem; not throwing is this one's.
    expect(rowsFor('no-such-dataset')).toEqual([])
    expect(rowCountOf('no-such-dataset')).toBe(0)
  })
})

describe('declared aggregations follow what a Measure is', () => {
  test('a rate or a duration never declares sum', () => {
    /*
     * FR-DP-04, and the reason it matters: adding revenue across months gives
     * revenue for the year, and adding uptime across services gives 890%, which
     * is not a number that exists. `Widget.tsx` currently re-derives this from
     * the field's format in a switch statement; Stage 4 deletes that and reads
     * these declarations instead, so they have to be right first.
     */
    const wrong = datasets.flatMap((dataset) =>
      dataset.fields
        .filter((field) => field.role === 'measure')
        .filter((field) => field.format === 'percent' || field.format === 'duration')
        .filter((field) => field.aggregations.includes('sum'))
        .map((field) => `${dataset.id}.${field.key}`),
    )

    expect(wrong).toEqual([])
  })

  test('an ordinary quantity does declare sum', () => {
    // The counterpart. Without it the rule above is satisfied by declaring no
    // aggregations anywhere.
    const revenue = datasets
      .find((dataset) => dataset.id === 'revenue-monthly')!
      .fields.find((field) => field.key === 'revenue')!

    expect(revenue.role).toBe('measure')
    if (revenue.role !== 'measure') throw new Error('unreachable')
    expect(revenue.aggregations).toContain('sum')
  })
})

describe('geographic semantics survived the move off `geo`', () => {
  test('sales-by-country still declares an area and a coordinate pair', () => {
    const country = datasets.find((dataset) => dataset.id === 'sales-by-country')!
    const semantics = country.fields.filter(isGeographic).map((field) => field.semantic)

    expect(semantics).toContain('geographic-area')
    expect(semantics).toContain('geographic-latitude')
    expect(semantics).toContain('geographic-longitude')
  })

  test('latitude is a Measure and is still recognised as a coordinate', () => {
    /*
     * F15 in one assertion. Latitude is a Measure by role, so any rule that
     * reaches for "a geographic field that is not a Measure" excludes exactly
     * the fields a point map needs — which is what the FRD's Geospatial clause
     * did before this merge.
     */
    const lat = datasets
      .find((dataset) => dataset.id === 'sales-by-country')!
      .fields.find((field) => field.key === 'lat')!

    expect(lat.role).toBe('measure')
    expect(isCoordinate(lat)).toBe(true)
    expect(isGeographic(lat)).toBe(true)
  })

  test('a field naming a place is not mistaken for one locating it', () => {
    const code = datasets
      .find((dataset) => dataset.id === 'sales-by-country')!
      .fields.find((field) => field.key === 'code')!

    expect(isGeographic(code)).toBe(true)
    expect(isCoordinate(code)).toBe(false)
  })
})
