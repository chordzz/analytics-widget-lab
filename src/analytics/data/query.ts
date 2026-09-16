/**
 * What a widget asks its Dataset for.
 *
 * Merge Plan Stage 4. Until now a widget received every record its Dataset held
 * and reduced them in the view: `values.reduce(...)` inside `Widget.tsx`'s
 * render switch, with sum-versus-average chosen by sniffing the field's
 * *format*. That is two separate problems.
 *
 * **It is the divergent-definition failure.** Letting each widget decide what
 * "sum" means is precisely what the capability exists to remove. The rule the
 * view was applying is a good one — adding revenue across months gives revenue
 * for the year, adding uptime across services gives 890%, which is not a number
 * that exists — and being right in a view-layer switch statement is still the
 * wrong place for it. FR-DP-04 says the *publisher* declares which aggregations
 * are meaningful for a Measure. So that is where it is read from now.
 *
 * **It is unenforceable once there is a backend.** FR-DA-12 by way of Finding 5:
 * a client that receives raw records and reduces them has already obtained data
 * the Viewer may not be entitled to, whatever it renders afterwards.
 *
 * So a widget builds a `DatasetQuery` and something else executes it. Today that
 * something else is `executeQuery` over the in-memory fixtures; at Stage 5 it is
 * `DatasetRetrievalPort.retrieve`, and nothing above this file changes — which
 * is the whole reason for the shape.
 */

import { executeQuery } from '../../retrieval/aggregate'
import {
  applyContribution,
  type ControlSubject,
  type QueryContribution,
} from '../../composition/correspondence'
import { requiredParameters } from '../../domain/dataset'
import type { Aggregation, Dataset, FilterParameter } from '../../domain/dataset'
import type { DatasetQuery, MeasureSelection } from '../../domain/query'
import type { WidgetSpec } from '../widgets/Widget'
import { rowsFor } from './datasets'
import { fieldOf, timeFields } from './types'
import type { Row } from './types'

/**
 * How a Measure rolls up.
 *
 * The Dataset's first declared aggregation is the answer unless the Author has
 * chosen another — and an Author may only choose one the publisher declared
 * meaningful, which is FR-DP-04 doing its job. An override naming an
 * undeclared aggregation is ignored rather than honoured: the publisher's
 * declaration is the constraint, and silently obeying the widget would let a
 * board average a count or total a percentage.
 */
export function aggregationFor(
  dataset: Dataset,
  fieldKey: string,
  override?: string,
): Aggregation {
  const field = fieldOf(dataset, fieldKey)
  if (!field || field.role !== 'measure' || field.aggregations.length === 0) return 'sum'

  const declared = field.aggregations
  return override !== undefined && (declared as string[]).includes(override)
    ? (override as Aggregation)
    : declared[0]
}

/**
 * Apply an aggregation to a column of rows.
 *
 * The arithmetic behind `aggregationFor`, so the same declaration decides both
 * what we *ask* for and what we compute if the answer arrives unaggregated. Two
 * implementations of "sum" is precisely the divergent-definition failure this
 * capability exists to remove, and it would be an easy one to reintroduce here.
 */
function applyAggregation(values: number[], aggregation: Aggregation): number {
  if (values.length === 0) return 0

  switch (aggregation) {
    case 'average':
      return values.reduce((total, value) => total + value, 0) / values.length
    case 'count':
      return values.length
    case 'distinct-count':
      return new Set(values).size
    // `minimum`/`maximum` here; the deployed API spells the same two `min`/`max`
    // (D29). The adapter translates; nothing above it should know.
    case 'minimum':
      return Math.min(...values)
    case 'maximum':
      return Math.max(...values)
    case 'sum':
      return values.reduce((total, value) => total + value, 0)
  }
}

/**
 * One number for a single-value widget, however the rows arrived.
 *
 * A stat card, a threshold indicator and an alert banner each show one figure,
 * and each asks the query for it. Whether the query is honoured is not ours to
 * decide: the deployed API is a proxy that forwards to the Source System and
 * relays the body verbatim (D22), so `measures` may be ignored entirely and the
 * whole column may come back.
 *
 * So the widget stops caring. One row means somebody aggregated — use it.
 * Several means nobody did — aggregate here, with the aggregation the publisher
 * *declared*, which is the same one the query asked for.
 *
 * This is not the reduction Stage 4 removed. That one re-derived the roll-up
 * rule from the field's display `format`, so a widget decided what "sum" meant.
 * This one obeys the declaration either way, and the figure is identical
 * whichever side computes it — which is the property that makes the uncertainty
 * survivable rather than merely hidden.
 */
export function singleValueOf(
  spec: WidgetSpec,
  dataset: Dataset,
  rows: readonly Row[],
  fieldKey: string,
): number {
  if (rows.length === 0) return Number.NaN
  if (rows.length === 1) return Number(rows[0][fieldKey] ?? Number.NaN)

  const override =
    typeof spec.options?.aggregation === 'string' ? spec.options.aggregation : undefined
  const values = rows
    .map((row) => Number(row[fieldKey] ?? Number.NaN))
    .filter((value) => Number.isFinite(value))

  /*
   * Nothing readable is not a zero.
   *
   * Skipping values we cannot parse is the right call per row — one absent
   * service should not blank a fleet-wide figure. Skipping *all* of them and
   * then reporting the empty sum would put a confident `0` on the card, which
   * claims the figure is zero when we only failed to read it. That is the
   * precise failure §3 of the widget data contract asks Source Systems to avoid,
   * and it would be poor form to commit it ourselves on the way past.
   */
  if (values.length === 0) return Number.NaN

  return applyAggregation(values, aggregationFor(dataset, fieldKey, override))
}

/** The Time Dimension a widget orders by, if its Dataset has one. */
const timeKeyOf = (dataset: Dataset, mapping: WidgetSpec['mapping']): string | undefined => {
  const named = mapping.x !== undefined ? fieldOf(dataset, mapping.x) : undefined
  if (named?.role === 'time-dimension') return named.key
  return timeFields(dataset)[0]?.key
}

const selection = (field: string, aggregation: Aggregation): MeasureSelection => ({
  field,
  aggregation,
})

/**
 * What a Viewer has chosen from the filters an Author exposed.
 *
 * Session state, not board state. A Viewer narrowing a chart to one region is
 * reading the Author's dashboard, not editing it — persisting these would change
 * what everyone else sees because one person looked.
 */
export interface ViewerChoices {
  /** Keyed by Field key. */
  filters?: Record<string, string | number>
  sort?: { field: string; direction: 'ascending' | 'descending' }
}

/**
 * The Author's bindings, reduced to parameters the publisher actually declared.
 *
 * Same enforcement pattern as `permitted`, and for the same reason: the form
 * that collected the value and the query that sends it are different code, and
 * only one of them is the enforcement point. A binding naming a parameter the
 * Dataset does not publish is dropped rather than sent — the API refuses
 * undeclared parameters before the request leaves, so passing one on would fail
 * the whole query rather than the one filter.
 */
export function boundParameters(
  spec: WidgetSpec,
  dataset: Dataset,
): Record<string, string | number> {
  const declared = new Set((dataset.filterParameters ?? []).map((parameter) => parameter.name))
  const bound: Record<string, string | number> = {}

  for (const [name, value] of Object.entries(spec.parameterBindings ?? {})) {
    if (value === '' || value === undefined) continue
    if (declared.has(name)) bound[name] = value
  }

  return bound
}

/**
 * Required parameters this Widget has not bound.
 *
 * Empty means the Widget can be composed. Anything else is a query the Source
 * System will refuse, and the composer's job is to make that impossible to
 * commit rather than to discover when the card fails.
 */
export function unboundRequirements(spec: WidgetSpec, dataset: Dataset): FilterParameter[] {
  const bound = boundParameters(spec, dataset)
  return requiredParameters(dataset).filter((parameter) => bound[parameter.name] === undefined)
}

/**
 * The Viewer's choices, reduced to what the publisher actually permits.
 *
 * Applied here rather than trusted from the UI, for the same reason
 * `aggregationFor` ignores an undeclared aggregation: the control that offered
 * the choice and the query that acts on it are different code, and only one of
 * them is the enforcement point. A filter on a Field the publisher did not mark
 * `filterable` is dropped, not honoured — FR-DP-05 binds the Author and the
 * Viewer both.
 */
function permitted(
  spec: WidgetSpec,
  dataset: Dataset,
  choices: ViewerChoices | undefined,
): { filters?: Record<string, string | number>; sort?: DatasetQuery['sort'] } {
  if (!choices) return {}

  /*
   * Checked against the Dataset's **Filter Parameters**, not its filterable
   * Fields.
   *
   * These are two lists and they do not line up. `fields` describes the
   * response — which columns come back, and whether the endpoint supports
   * narrowing on them. `filter_parameters` describes the *request* — the query
   * names the endpoint accepts. `peniremit.profit` is the plain case: one
   * filterable Field, `date`, and three parameters, `from`, `to` and
   * `granularity`. Filtering that column means sending two parameters with
   * different names, so `filterable: true` never meant "send ?date=".
   *
   * Checking the Field list here is what let a Widget be composed exposing
   * `date` and rejected on save with `"date" is not a Filter Parameter`. D24,
   * in the last place it still lived.
   */
  const exposed = new Set(spec.exposedFilters ?? [])
  const declared = new Set((dataset.filterParameters ?? []).map((parameter) => parameter.name))

  const entries = Object.entries(choices.filters ?? {}).filter(([name, value]) => {
    if (value === '' || value === undefined) return false
    if (!exposed.has(name)) return false
    return declared.has(name)
  })

  const wanted = choices.sort
  const sortable =
    wanted &&
    (spec.exposedSorts ?? []).includes(wanted.field) &&
    fieldOf(dataset, wanted.field)?.sortable === true

  return {
    ...(entries.length > 0 ? { filters: Object.fromEntries(entries) } : {}),
    ...(sortable && wanted ? { sort: [wanted] } : {}),
  }
}

/**
 * The query a widget's spec amounts to.
 *
 * Most types return an empty query, and that is correct rather than lazy: a bar
 * chart over `sales-by-region` draws one bar per region, and the Dataset is
 * already at that grain. Asking for a needless roll-up would collapse six bars
 * into one.
 *
 * Three shapes need more:
 *
 *   - a **stat card** is a single number over the whole period, so it asks for
 *     the aggregate and receives exactly one row
 *   - a **gauge** shows the current value against its target, so it asks for the
 *     most recent record rather than trusting array order to end in the right
 *     place — a server has no obligation to return rows in any order at all
 *   - anything reading a **series** orders by its Time Dimension explicitly, for
 *     the same reason
 *
 * A Viewer's exposed-filter choices narrow whichever of those it would otherwise
 * have asked for, and their chosen sort replaces the widget's own ordering.
 */
export function queryFor(
  spec: WidgetSpec,
  dataset: Dataset,
  choices?: ViewerChoices,
  /**
   * What a Dashboard Control contributes to this widget, already resolved by
   * `contributionFor`. Empty when no Control reaches it — which is the same
   * thing as the widget being unaffected, and is why an unreachable Control
   * needs no special case here.
   */
  contribution?: QueryContribution,
): DatasetQuery {
  const { typeId, mapping, options = {} } = spec
  const override = typeof options.aggregation === 'string' ? options.aggregation : undefined
  const timeKey = timeKeyOf(dataset, mapping)
  const chosen = permitted(spec, dataset, choices)
  const bound = boundParameters(spec, dataset)

  // A Viewer's sort replaces the widget's own ordering; their filters narrow
  // whatever it would otherwise have asked for.
  const withChoices = (base: DatasetQuery): DatasetQuery => {
    /*
     * Three layers, narrowest last. The Author's parameter bindings are the
     * floor — a required one must survive every other choice, or the query is
     * refused — and a Viewer narrowing the same Field on top of it still
     * supplies a value, so the parameter is never lost by being overridden.
     */
    const filters = { ...bound, ...base.filters, ...chosen.filters }

    const own: DatasetQuery = {
      ...base,
      ...(Object.keys(filters).length > 0 ? { filters } : {}),
      ...(chosen.sort ? { sort: chosen.sort } : {}),
    }

    /*
     * Finding 10 — where a Dashboard Control and this widget's own exposed
     * filter name the same Field, the widget's wins. Both are the Viewer's
     * choices; the widget-level one is the more specific, and silently
     * overriding the control someone just used on a particular card is the more
     * surprising outcome. `applyContribution` is where that precedence lives, so
     * it is decided once rather than per caller.
     */
    return contribution ? applyContribution(own, contribution) : own
  }

  switch (typeId) {
    case 'stat-card': {
      const key = mapping.value
      if (!key) return withChoices({})
      // `latest` is not an aggregation — it is one record, most recent first.
      if (override === 'latest') {
        return withChoices(
          timeKey ? { sort: [{ field: timeKey, direction: 'descending' }], limit: 1 } : { limit: 1 },
        )
      }
      return withChoices({ measures: [selection(key, aggregationFor(dataset, key, override))] })
    }

    /*
     * The Status Family's threshold route. One Measure, no grouping — so the
     * query returns a single aggregate row and the widget assesses that.
     *
     * Without this the query was empty, every raw row came back, and
     * `rows[0]` took whichever record happened to be first: the tile reported
     * Payments API at 99.98% while FX rates sat at 94.12%. That is the same
     * failure Stage 4 removed from the single-value cards, and it is worse here,
     * because a Status widget's entire job is to be trusted when it says
     * healthy.
     *
     * The aggregation comes from the Measure's declared set, which is what stops
     * uptime being summed across nine services into 898%.
     */
    case 'threshold-indicator':
    case 'alert-banner': {
      const key = mapping.value
      if (!key) return withChoices({})
      return withChoices({ measures: [selection(key, aggregationFor(dataset, key, override))] })
    }

    case 'gauge':
    case 'progress-tracker':
      return withChoices(timeKey ? { sort: [{ field: timeKey, direction: 'ascending' }] } : {})

    case 'sparkline-card':
    case 'delta-card':
    case 'line-chart':
    case 'area-chart':
    case 'spline-chart':
    case 'step-chart':
    case 'calendar-heatmap':
      return withChoices(timeKey ? { sort: [{ field: timeKey, direction: 'ascending' }] } : {})

    default:
      return withChoices({})
  }
}

/**
 * The rows a widget draws.
 *
 * One function, so there is exactly one place Stage 5 has to change. Everything
 * above it deals in specs and receives rows; nothing above it knows whether the
 * records came from a fixture, a cache or a Source System.
 */
export function rowsForWidget(
  spec: WidgetSpec,
  dataset: Dataset,
  choices?: ViewerChoices,
  contribution?: QueryContribution,
): Row[] {
  return executeQuery(rowsFor(dataset.id), queryFor(spec, dataset, choices, contribution))
}

/**
 * The module's spec, as the correspondence rules need to see it.
 *
 * `ControlSubject` asks for the Time Dimension a widget is *drawn against*, and
 * the module keeps that in `mapping.x` — which may equally hold a category. So
 * the Dataset decides: `x` counts only when it names a Time Dimension.
 */
export function controlSubjectFor(spec: WidgetSpec, dataset: Dataset): ControlSubject {
  const mapped = spec.mapping.x !== undefined ? fieldOf(dataset, spec.mapping.x) : undefined

  return {
    id: spec.id,
    datasetId: spec.datasetId,
    visualizationTypeId: spec.typeId,
    timeDimension: mapped?.role === 'time-dimension' ? mapped.key : undefined,
  }
}
