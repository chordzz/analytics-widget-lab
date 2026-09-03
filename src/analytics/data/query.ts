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
 */
export function queryFor(spec: WidgetSpec, dataset: Dataset): DatasetQuery {
  const { typeId, mapping, options = {} } = spec
  const override = typeof options.aggregation === 'string' ? options.aggregation : undefined
  const timeKey = timeKeyOf(dataset, mapping)

  switch (typeId) {
    case 'stat-card': {
      const key = mapping.value
      if (!key) return {}
      // `latest` is not an aggregation — it is one record, most recent first.
      if (override === 'latest') {
        return timeKey
          ? { sort: [{ field: timeKey, direction: 'descending' }], limit: 1 }
          : { limit: 1 }
      }
      return { measures: [selection(key, aggregationFor(dataset, key, override))] }
    }

    case 'gauge':
    case 'progress-tracker':
      return timeKey ? { sort: [{ field: timeKey, direction: 'ascending' }] } : {}

    case 'sparkline-card':
    case 'delta-card':
    case 'line-chart':
    case 'area-chart':
    case 'spline-chart':
    case 'step-chart':
    case 'calendar-heatmap':
      return timeKey ? { sort: [{ field: timeKey, direction: 'ascending' }] } : {}

    default:
      return {}
  }
}

/**
 * The rows a widget draws.
 *
 * One function, so there is exactly one place Stage 5 has to change. Everything
 * above it deals in specs and receives rows; nothing above it knows whether the
 * records came from a fixture, a cache or a Source System.
 */
export function rowsForWidget(spec: WidgetSpec, dataset: Dataset): Row[] {
  return executeQuery(rowsFor(dataset.id), queryFor(spec, dataset))
}
