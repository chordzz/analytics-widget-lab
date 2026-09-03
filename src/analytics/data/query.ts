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
import type { Aggregation, Dataset } from '../../domain/dataset'
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

  const exposed = new Set(spec.exposedFilters ?? [])
  const entries = Object.entries(choices.filters ?? {}).filter(([key, value]) => {
    if (value === '' || value === undefined) return false
    if (!exposed.has(key)) return false
    return fieldOf(dataset, key)?.filterable === true
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
): DatasetQuery {
  const { typeId, mapping, options = {} } = spec
  const override = typeof options.aggregation === 'string' ? options.aggregation : undefined
  const timeKey = timeKeyOf(dataset, mapping)
  const chosen = permitted(spec, dataset, choices)

  // A Viewer's sort replaces the widget's own ordering; their filters narrow
  // whatever it would otherwise have asked for.
  const withChoices = (base: DatasetQuery): DatasetQuery => ({
    ...base,
    ...(chosen.filters ? { filters: chosen.filters } : {}),
    ...(chosen.sort ? { sort: chosen.sort } : {}),
  })

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
): Row[] {
  return executeQuery(rowsFor(dataset.id), queryFor(spec, dataset, choices))
}
