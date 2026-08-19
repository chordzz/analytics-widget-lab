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
  /** Keyed by Field key. Only Fields the Dataset declared filterable (FR-DP-05). */
  filters?: Record<string, string | number>
  sort?: SortSpecification[]
  limit?: number
}

export type DatasetRow = Record<string, string | number | null>

/** The key a Measure's aggregated value appears under in a returned row. */
export function measureKey(selection: MeasureSelection): string {
  return selection.field
}
