/**
 * Phase 5 acceptance: Control propagation across all three correspondence
 * kinds, including the cases FR-CO-06 does not cover as written.
 */

import { describe, expect, test } from 'bun:test'
import { canSwitchTo, correspondenceFor, effectFor, resolveControlReach } from './correspondence'
import {
  dateRangeControl,
  presentationToggleControl,
  selectControl,
  viewSwitcherControl,
  withBinding,
} from '../domain/composition'
import type { Control } from '../domain/composition'
import {
  accountingJournal,
  corridorCoverage,
  payrollDisbursements,
  peniremitSettlements,
} from '../catalogue/fixtures'
import { defaultMapping } from '../authoring/mapping'
import { WIDGET_TYPES } from '../analytics/widgets/catalog'
import { canPresent } from '../visualization/registry'
import type { Dataset } from '../domain/dataset'
import type { Widget } from '../domain/widget'

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
const hasRenderer = (id: string) => drawableIds.has(id)

const widgetOn = (dataset: Dataset, typeId: string): Widget => ({
  id: `${dataset.id}-${typeId}`,
  datasetId: dataset.id,
  visualizationTypeId: typeId,
  title: dataset.name,
  mapping: defaultMapping(dataset, typeId),
})

const settlementsTrend = widgetOn(peniremitSettlements, 'area-chart')
const settlementsBars = widgetOn(peniremitSettlements, 'bar-chart-vertical')
const payrollTrend = widgetOn(payrollDisbursements, 'line-chart')
const coverageBars = widgetOn(corridorCoverage, 'bar-chart-vertical')
const journalTable = widgetOn(accountingJournal, 'data-table')

const datasets: Record<string, Dataset> = {
  [peniremitSettlements.id]: peniremitSettlements,
  [payrollDisbursements.id]: payrollDisbursements,
  [corridorCoverage.id]: corridorCoverage,
  [accountingJournal.id]: accountingJournal,
}

const effect = (controls: Control[], values: Record<string, unknown>, widget: Widget) =>
  effectFor(controls, values as never, widget, datasets[widget.datasetId], hasRenderer)

// --- explicit binding (Finding 2) ------------------------------------------

describe('explicit-binding Controls — value-domain filters', () => {
  const bound = withBinding(
    withBinding(selectControl('corridor', 'Corridor'), settlementsBars.id, 'corridor'),
    coverageBars.id,
    'corridor',
  )

  test('reaches only the Widgets the Author bound', () => {
    const reach = resolveControlReach(
      bound,
      [settlementsBars, coverageBars, payrollTrend],
      datasets,
    )
    expect(reach.affected.map((a) => a.widgetId).sort()).toEqual(
      [settlementsBars.id, coverageBars.id].sort(),
    )
    expect(reach.unaffected.map((u) => u.widgetId)).toEqual([payrollTrend.id])
  })

  test('an unbound Widget is untouched even though its Dataset has filterable Dimensions', () => {
    // Payroll has a `cost_centre` Dimension, filterable, and a Control matching
    // on role alone would have wrongly reached it. Binding is what prevents
    // that, and it is why the binding has to be explicit.
    expect(payrollDisbursements.fields.some((f) => f.role === 'dimension' && f.filterable)).toBe(
      true,
    )
    expect(effect([bound], { corridor: 'NG → GB' }, payrollTrend)).toEqual({
      query: {},
      presentation: {},
    })
  })

  test('each bound Widget is filtered on its own Field', () => {
    expect(effect([bound], { corridor: 'NG → GB' }, settlementsBars).query.filters).toEqual({
      corridor: 'NG → GB',
    })
    expect(effect([bound], { corridor: 'NG → GB' }, coverageBars).query.filters).toEqual({
      corridor: 'NG → GB',
    })
  })

  test('unbinding removes the Widget from the Control’s reach', () => {
    const unbound = withBinding(bound, coverageBars.id, null)
    const reach = resolveControlReach(unbound, [settlementsBars, coverageBars], datasets)
    expect(reach.affected).toHaveLength(1)
    expect(reach.unaffected[0].reason).toContain('No Field bound')
  })
})

// --- presentation toggle (Finding 6) ---------------------------------------

describe('presentation-toggle Controls — correspondence by Visualization Type', () => {
  const toggle = presentationToggleControl('values')

  test('reaches bar charts and not trend charts, whatever the Dataset', () => {
    const reach = resolveControlReach(toggle, [settlementsBars, settlementsTrend], datasets)
    // Both Widgets are on the *same* Dataset. Only the Visualization Type
    // differs, which is precisely the distinction FR-CO-06 cannot express.
    expect(settlementsBars.datasetId).toBe(settlementsTrend.datasetId)
    expect(reach.affected.map((a) => a.widgetId)).toEqual([settlementsBars.id])
    expect(reach.unaffected.map((u) => u.widgetId)).toEqual([settlementsTrend.id])
  })

  test('it changes presentation and never the query, so no retrieval is needed', () => {
    const result = effect([toggle], { values: 'percentage' }, settlementsBars)
    expect(result.presentation).toEqual({ valueMode: 'percentage' })
    expect(result.query).toEqual({})
  })
})

// --- view switcher (Finding 6 + FR-VZ-05) ----------------------------------

describe('view-switcher Controls — the target must also be permissible', () => {
  const switcher = viewSwitcherControl(
    'view',
    [
      { value: 'data-table', label: 'Data table' },
      { value: 'scatter-plot', label: 'Scatter plot' },
      { value: 'bar-chart-vertical', label: 'Bar chart' },
    ],
    ['categorical-comparison', 'tabular', 'trend'],
  )

  test('switching to a permissible Type substitutes the renderer', () => {
    expect(effect([switcher], { view: 'data-table' }, settlementsBars).visualizationTypeId).toBe(
      'data-table',
    )
  })

  test('FR-VZ-05 is not circumventable through a Control', () => {
    // Settlements has one Measure, so Correlation is not offered by the
    // authoring surface. A Control must not be able to put a scatter plot on it
    // by the back door.
    expect(canSwitchTo('scatter-plot', peniremitSettlements, hasRenderer).applies).toBe(false)
    expect(
      effect([switcher], { view: 'scatter-plot' }, settlementsBars).visualizationTypeId,
    ).toBeUndefined()
  })

  test('an eligible Type with no renderer is refused, and gives the right reason', () => {
    /*
     * A Type the Dataset *can* present but nothing can draw is a different
     * refusal from a Type the Dataset cannot present, and the two must not be
     * reported the same way.
     *
     * The predicate is a stub rather than the live catalogue, which is the
     * third version of this test. It was `pivot-table` until merge §2 built
     * one, then `comparison-table` until that was built too — each time the
     * test broke for the happiest possible reason and had to be re-pointed at
     * whatever was still missing. Only one Type is unbuilt now and no fixture
     * satisfies it, so there is no fourth name to swap in.
     *
     * What is under test here is `canSwitchTo`'s reasoning, not which renderers
     * exist today: given a Type that fits and a renderer that is absent, does
     * it say the right thing. Withholding one explicitly asks exactly that, and
     * cannot be invalidated by shipping a renderer. That the real catalogue's
     * gap is one named Type is asserted in `governance.test.ts`, where it
     * belongs.
     */
    expect(canPresent(corridorCoverage, 'data-table')).toBe(true)
    const withoutTables = (id: string) => id !== 'data-table' && hasRenderer(id)

    const verdict = canSwitchTo('data-table', corridorCoverage, withoutTables)
    expect(verdict.applies).toBe(false)
    if (verdict.applies) throw new Error('unreachable')
    expect(verdict.reason).toContain('no renderer')

    // And with the renderer present it is allowed, so the refusal above is the
    // missing renderer talking and not something else about this Type.
    expect(canSwitchTo('data-table', corridorCoverage, hasRenderer).applies).toBe(true)

    // Contrast: a Type the Dataset genuinely cannot satisfy.
    const ineligible = canSwitchTo('scatter-plot', corridorCoverage, hasRenderer)
    if (ineligible.applies) throw new Error('unreachable')
    expect(ineligible.reason).toContain('Data Shape')
  })

  test('reach reflects the selected target, not merely the Family', () => {
    const widgets = [settlementsBars, journalTable, payrollTrend]

    // Every Widget's Family is in scope for this switcher…
    const withoutValue = resolveControlReach(switcher, widgets, datasets)
    expect(withoutValue.affected).toHaveLength(3)

    // …but a scatter plot is permissible only where the Dataset has two
    // Measures, so reach collapses to the one Widget whose Dataset does.
    const withScatter = resolveControlReach(switcher, widgets, datasets, {
      value: 'scatter-plot',
      hasRenderer,
    })
    expect(withScatter.affected.map((a) => a.widgetId)).toEqual([payrollTrend.id])
    expect(withScatter.unaffected.map((u) => u.widgetId).sort()).toEqual(
      [settlementsBars.id, journalTable.id].sort(),
    )
    expect(withScatter.unaffected[0].reason).toContain('Data Shape')
  })

  test('the substitution is presentation only — the Widget keeps its own binding', () => {
    const result = effect([switcher], { view: 'data-table' }, settlementsBars)
    expect(result.visualizationTypeId).toBe('data-table')
    expect(settlementsBars.visualizationTypeId).toBe('bar-chart-vertical')
  })
})

// --- all three at once -----------------------------------------------------

describe('several Controls on one Dashboard', () => {
  const controls: Control[] = [
    dateRangeControl('range'),
    withBinding(selectControl('corridor', 'Corridor'), settlementsBars.id, 'corridor'),
    presentationToggleControl('values'),
  ]

  const values = {
    range: { from: '2026-02', to: '2026-07' },
    corridor: 'NG → GB',
    values: 'percentage',
  }

  test('each Widget receives exactly the Controls that reach it', () => {
    // A bar chart on settlements: bound filter and percentage apply; the date
    // range applies too, since the Dataset has a Time Dimension.
    const bars = effect(controls, values, settlementsBars)
    expect(bars.query.timeRange?.field).toBe('settled_at')
    expect(bars.query.filters).toEqual({ corridor: 'NG → GB' })
    expect(bars.presentation).toEqual({ valueMode: 'percentage' })

    // A trend chart on the same Dataset: date range only. Not bound to the
    // filter, and a percentage toggle is meaningless for it.
    const trend = effect(controls, values, settlementsTrend)
    expect(trend.query.timeRange?.field).toBe('settled_at')
    expect(trend.query.filters).toBeUndefined()
    expect(trend.presentation).toEqual({})

    // A bar chart on a Dataset with no Time Dimension and no binding: only the
    // presentation toggle, which needs neither.
    const coverage = effect(controls, values, coverageBars)
    expect(coverage.query).toEqual({})
    expect(coverage.presentation).toEqual({ valueMode: 'percentage' })
  })

  test('no Control reaches a Widget it should not, across the whole board', () => {
    const widgets = [settlementsBars, settlementsTrend, payrollTrend, coverageBars, journalTable]
    const summary = widgets.map((widget) => {
      const result = effect(controls, values, widget)
      return {
        widget: widget.id,
        timeRange: Boolean(result.query.timeRange),
        filtered: Boolean(result.query.filters),
        percentage: result.presentation.valueMode === 'percentage',
      }
    })

    expect(summary).toEqual([
      { widget: settlementsBars.id, timeRange: true, filtered: true, percentage: true },
      { widget: settlementsTrend.id, timeRange: true, filtered: false, percentage: false },
      { widget: payrollTrend.id, timeRange: true, filtered: false, percentage: false },
      { widget: coverageBars.id, timeRange: false, filtered: false, percentage: true },
      { widget: journalTable.id, timeRange: true, filtered: false, percentage: false },
    ])
  })

  test('clearing a Control returns every Widget to its unaffected state', () => {
    for (const widget of [settlementsBars, settlementsTrend, coverageBars]) {
      expect(effect(controls, {}, widget)).toEqual({ query: {}, presentation: {} })
    }
  })
})

/*
 * A date range reaches a Dataset that takes one, not only one that has a date
 * column.
 *
 * Correspondence matched on Fields alone, which refused 25 of Peniremit's 41
 * Datasets — every one behind a stat card — with "declares no time dimension".
 * True, and not the question a Viewer asks when they move the board's range: an
 * aggregate has no date column because it answers *for* a window rather than
 * across one, and it takes `from` and `to` as Filter Parameters, which is a
 * different list from Fields.
 */
describe('a range reaches what can take a range', () => {
  const control = dateRangeControl('period', 'Period')

  /** An aggregate: Measures only, `from`/`to` published as parameters. */
  const aggregate: Dataset = {
    id: 'peniremit.signups-summary',
    name: 'Signups Summary',
    description: '',
    sourceSystem: 'peniremit',
    classification: 'internal',
    exposesPersonalData: false,
    grain: [],
    fields: [
      { key: 'value', label: 'Value', role: 'measure', aggregations: ['sum'] },
      { key: 'delta', label: 'Delta', role: 'measure', aggregations: ['sum'] },
    ],
    filterParameters: [
      { name: 'from', type: 'date', required: true },
      { name: 'to', type: 'date', required: true },
    ],
  }

  const subject = (boundParameters: string[] = []) => ({
    id: 'w',
    datasetId: aggregate.id,
    visualizationTypeId: 'stat-card',
    boundParameters,
  })

  test('it applies, though the Dataset has no Field of that role', () => {
    const verdict = correspondenceFor(control, subject() as never, aggregate)
    expect(verdict.applies).toBe(true)
  })

  test('and names the parameters, because that is all the publisher has said', () => {
    const verdict = correspondenceFor(control, subject() as never, aggregate)
    if (!verdict.applies) throw new Error('unreachable')
    expect(verdict.via).toBe('from/to')
  })

  test('a declared `time_range` names the Field instead', () => {
    // BE-8. The publisher says which Field the range narrows even where the
    // response does not carry the column.
    const declared: Dataset = {
      ...aggregate,
      timeRange: { field: 'day', from: 'from', to: 'to' },
    }
    const verdict = correspondenceFor(control, subject() as never, declared)
    if (!verdict.applies) throw new Error('unreachable')
    expect(verdict.via).toBe('day')
  })

  test('a bound range is still qualified, and more sharply here', () => {
    /*
     * A trend fetched for the Author's window can at least be cut down in the
     * browser. One pre-aggregated row is a number computed for a period, and no
     * local filtering turns it into a number for a different one — so a bound
     * range on an aggregate means the Control does nothing at all.
     */
    const verdict = correspondenceFor(control, subject(['from', 'to']) as never, aggregate)
    expect(verdict.applies).toBe(true)
    if (!verdict.applies || !('limited' in verdict)) throw new Error('expected a limit')
    expect(verdict.limited).toContain('cannot be narrowed after the fact')
  })

  test('a Dataset that takes no range at all is still refused', () => {
    // The honest "no": nothing to send, and nothing to say it reaches.
    const noRange: Dataset = { ...aggregate, filterParameters: [] }
    const verdict = correspondenceFor(control, subject() as never, noRange)
    expect(verdict.applies).toBe(false)
    if (verdict.applies) throw new Error('unreachable')
    expect(verdict.reason).toContain('no time dimension')
  })
})
