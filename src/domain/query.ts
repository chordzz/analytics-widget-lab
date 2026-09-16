/**
 * What a consumer asks a Dataset for.
 *
 * Aggregation is expressed *in the query*, not applied to the response. A
 * Widget asks for "sum of settlement_value grouped by corridor" and receives
 * grouped, aggregated rows. It never receives raw records and reduces them
 * itself — that would silently reintroduce the divergent-definition problem
 * the capability exists to remove, by letting each Widget decide what "sum"
 * means, and it would require shipping records a Viewer may not be entitled to.
 */

import type { Aggregation } from './dataset'

export interface MeasureSelection {
  field: string
  /** Must be one the Dataset declared meaningful for this Measure (FR-DP-04). */
  aggregation: Aggregation
}

export type TimeGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year'

export interface TimeRange {
  field: string
  from?: string
  to?: string
  granularity?: TimeGranularity
}

export interface SortSpecification {
  field: string
  direction: 'ascending' | 'descending'
}

export interface DatasetQuery {
  /** Group by these Dimensions. Omitted or empty means a single aggregate row. */
  dimensions?: string[]
  measures?: MeasureSelection[]
  timeRange?: TimeRange
  /**
   * Keyed by **Field key** — a column and the value it must equal.
   *
   * Applied locally over returned rows, so every key here must be a column the
   * Dataset actually returns. A key that is not empties the result: the
   * comparison is `row[key] === value`, and `undefined` equals nothing.
   */
  filters?: Record<string, string | number>
  /**
   * Keyed by **Filter Parameter name** — what the endpoint is asked.
   *
   * Kept apart from `filters` because the two are not interchangeable and
   * conflating them silently empties widgets. `peniremit.profit` takes `from`
   * and `to`; neither is a returned column, so applying them locally compares
   * `row['from']` — which does not exist — against a date, and drops every row
   * the endpoint just returned.
   *
   * These are the endpoint's business alone. It has already applied them by the
   * time the rows arrive, so nothing downstream re-applies them.
   */
  parameters?: Record<string, string | number>
  sort?: SortSpecification[]
  limit?: number
}

export type DatasetRow = Record<string, string | number | null>

/** The key a Measure's aggregated value appears under in a returned row. */
export function measureKey(selection: MeasureSelection): string {
  return selection.field
}
