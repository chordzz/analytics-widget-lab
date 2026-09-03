/**
 * Phase 4 acceptance: UC-03, and the FR-CO-06 correspondence rule.
 */

import { describe, expect, test } from 'bun:test'
import {
  applyContribution,
  contributionFor,
  correspondenceFor,
  resolveControlReach,
} from './correspondence'
import { dateRangeControl, clampSpan, section } from '../domain/composition'
import type { Control } from '../domain/composition'
import {
  corridorCoverage,
  payrollDisbursements,
  peniremitSettlements,
} from '../catalogue/fixtures'
import { defaultMapping } from '../authoring/mapping'
import { executeQuery } from '../retrieval/aggregate'
import { fixtureRows } from '../catalogue/fixture-rows'
import type { Widget } from '../domain/widget'


const widgetOn = (dataset: typeof peniremitSettlements, typeId: string): Widget => ({
  id: `${dataset.id}-${typeId}`,
  datasetId: dataset.id,
  visualizationTypeId: typeId,
  mapping: defaultMapping(dataset, typeId),
})

const settlementsTrend = widgetOn(peniremitSettlements, 'area-chart')
const payrollTrend = widgetOn(payrollDisbursements, 'line-chart')
const coverageBars = widgetOn(corridorCoverage, 'bar-chart-vertical')

const datasets = {
  [peniremitSettlements.id]: peniremitSettlements,
  [payrollDisbursements.id]: payrollDisbursements,
  [corridorCoverage.id]: corridorCoverage,
}

const dateRange = dateRangeControl('range')

// --- UC-03 -----------------------------------------------------------------

describe('UC-03 — a cross-product Dashboard', () => {
  test('Widgets may be bound to Datasets from different Source Systems (FR-CO-03)', () => {
    expect(peniremitSettlements.sourceSystem).not.toBe(payrollDisbursements.sourceSystem)
    // Nothing in the model relates the two Widgets, which is the point: their
    // only shared context is the Dashboard.
    expect(settlementsTrend.datasetId).not.toBe(payrollTrend.datasetId)
  })

  test('a date-range Control reaches both Widgets, since both Datasets have a Time Dimension', () => {
    const reach = resolveControlReach(dateRange, [settlementsTrend, payrollTrend], datasets)
    expect(reach.affected.map((a) => a.widgetId)).toEqual([settlementsTrend.id, payrollTrend.id])
    expect(reach.unaffected).toHaveLength(0)
  })

  test('the Control binds each Widget to its own Dataset’s Time Dimension, not a shared name', () => {
    const reach = resolveControlReach(dateRange, [settlementsTrend, payrollTrend], datasets)
    expect(reach.affected.map((a) => a.via)).toEqual(['settled_at', 'disbursed_on'])
  })

  test('changing the Control narrows both Widgets’ data', () => {
    const values = { range: { from: '2026-02', to: '2026-07' } }

    for (const widget of [settlementsTrend, payrollTrend]) {
      const dataset = datasets[widget.datasetId]
      const contribution = contributionFor([dateRange], values, widget, dataset)
      const timeField = widget.mapping.timeDimension!

      const base = {
        dimensions: [timeField],
        measures: widget.mapping.measures,
      }
      const before = executeQuery(fixtureRows[widget.datasetId], base)
      const after = executeQuery(fixtureRows[widget.datasetId], applyContribution(base, contribution))

      expect(after.length).toBeLessThan(before.length)
      expect(after.length).toBe(6)
    }
  })
})

// --- FR-CO-06: the other half ---------------------------------------------

describe('FR-CO-06 — Widgets that do not support a Control are left unaffected', () => {
  test('a Dataset with no Time Dimension is not reached, and says why', () => {
    const correspondence = correspondenceFor(dateRange, coverageBars, corridorCoverage)
    expect(correspondence.applies).toBe(false)
    if (correspondence.applies) throw new Error('unreachable')
    expect(correspondence.reason).toContain('no time dimension')
  })

  test('a mixed Dashboard reports exactly which Widgets moved and which did not', () => {
    const reach = resolveControlReach(
      dateRange,
      [settlementsTrend, payrollTrend, coverageBars],
      datasets,
    )
    expect(reach.affected).toHaveLength(2)
    expect(reach.unaffected).toHaveLength(1)
    expect(reach.unaffected[0].widgetId).toBe(coverageBars.id)
  })

  test('an unaffected Widget receives no contribution at all', () => {
    const contribution = contributionFor(
      [dateRange],
      { range: { from: '2026-02', to: '2026-07' } },
      coverageBars,
      corridorCoverage,
    )
    expect(contribution).toEqual({})
  })

  test('an unaffected Widget’s query is untouched, so its data does not change', () => {
    const base = {
      dimensions: ['destination_country'],
      measures: [{ field: 'active_corridors' as const, aggregation: 'sum' as const }],
    }
    const contribution = contributionFor(
      [dateRange],
      { range: { from: '2026-02', to: '2026-07' } },
      coverageBars,
      corridorCoverage,
    )
    const rows = executeQuery(fixtureRows[corridorCoverage.id], applyContribution(base, contribution))
    expect(rows).toEqual(executeQuery(fixtureRows[corridorCoverage.id], base))
  })

  test('a Control with no value set changes nothing', () => {
    expect(contributionFor([dateRange], {}, settlementsTrend, peniremitSettlements)).toEqual({})
    expect(
      contributionFor([dateRange], { range: {} }, settlementsTrend, peniremitSettlements),
    ).toEqual({})
  })

  test('a Control cannot filter on a Field the publisher did not declare filterable', () => {
    // FR-DP-05 — the publisher decides. A Dashboard Control does not overrule it.
    const locked = {
      ...peniremitSettlements,
      fields: peniremitSettlements.fields.map((f) =>
        f.role === 'time-dimension' ? { ...f, filterable: false } : f,
      ),
    }
    const correspondence = correspondenceFor(dateRange, settlementsTrend, locked)
    expect(correspondence.applies).toBe(false)
    if (correspondence.applies) throw new Error('unreachable')
    expect(correspondence.reason).toContain('not declared filterable')
  })
})

// --- merge precedence (Finding 10) ----------------------------------------

describe('Control and Widget-level filters', () => {
  test('a Widget’s own exposed filter wins over a Dashboard Control on the same Field', () => {
    const merged = applyContribution(
      { filters: { corridor: 'NG → GB' } },
      { filters: { corridor: 'NG → US' } },
    )
    expect(merged.filters).toEqual({ corridor: 'NG → GB' })
  })

  test('they combine when they name different Fields', () => {
    const merged = applyContribution(
      { filters: { corridor: 'NG → GB' } },
      { filters: { product: 'Peniwallet' } },
    )
    expect(merged.filters).toEqual({ corridor: 'NG → GB', product: 'Peniwallet' })
  })
})

// --- Composition Elements --------------------------------------------------

describe('Composition Elements', () => {
  test('FR-CO-08 — no Composition Element carries a Dataset binding', () => {
    const elements: object[] = [dateRangeControl('c1'), section('s1', 'Settlements')]
    for (const element of elements) {
      expect(Object.keys(element)).not.toContain('datasetId')
    }
  })

  test('a Control declares how it corresponds to Widgets, not which ones', () => {
    // Correspondence is computed against each Widget, never stored as a list —
    // otherwise adding a Widget would silently leave it outside the Control.
    expect(dateRange.correspondence).toEqual({ kind: 'field-role', role: 'time-dimension' })
    expect(Object.keys(dateRange)).not.toContain('widgetIds')
  })

  test('a newly added Widget is reached by an existing Control without reconfiguration', () => {
    const before = resolveControlReach(dateRange, [settlementsTrend], datasets)
    const after = resolveControlReach(dateRange, [settlementsTrend, payrollTrend], datasets)
    expect(before.affected).toHaveLength(1)
    expect(after.affected).toHaveLength(2)
  })

  test('spans are clamped to the grid (FR-CO-02)', () => {
    expect(clampSpan(0)).toBe(1)
    expect(clampSpan(99)).toBe(12)
    expect(clampSpan(6)).toBe(6)
  })
})

// --- Phase 5 cases, modelled but not yet wired -----------------------------

describe('correspondence cases deferred to Phase 5', () => {
  test('explicit binding reaches only Widgets the Author bound (Finding 2)', () => {
    const control: Control = {
      id: 'corridor',
      element: 'control',
      controlType: 'select',
      label: 'Corridor',
      correspondence: { kind: 'explicit-binding', bindings: { [settlementsTrend.id]: 'corridor' } },
    }

    expect(correspondenceFor(control, settlementsTrend, peniremitSettlements)).toEqual({
      applies: true,
      via: 'corridor',
    })
    // Payroll also has a categorical Dimension, but over a different value
    // domain. Matching on role alone would have wrongly reached it.
    expect(correspondenceFor(control, payrollTrend, payrollDisbursements).applies).toBe(false)
  })

  test('a presentation toggle corresponds by Visualization Type, not Dataset (Finding 6)', () => {
    const control: Control = {
      id: 'pct',
      element: 'control',
      controlType: 'presentation-toggle',
      label: 'Absolute / percentage',
      correspondence: { kind: 'visualization-type', familyIds: ['categorical-comparison'] },
    }

    expect(correspondenceFor(control, coverageBars, corridorCoverage).applies).toBe(true)
    // Same Dataset would not matter — a trend chart has nothing to express as a
    // percentage of a whole.
    expect(correspondenceFor(control, settlementsTrend, peniremitSettlements).applies).toBe(false)
  })
})
