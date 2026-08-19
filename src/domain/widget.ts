/**
 * Widget — "a single visual presentation of data drawn from exactly one
 * Dataset, together with the presentation choices applied to it."
 *
 * Note what a Widget is *not*: it is not a type. `stat-widget` and
 * `trend-widget` are not things. A Widget is an instance binding one Dataset
 * to one Visualization Type. The Type comes from the classification manifest;
 * the Dataset comes from the Catalogue; this record is the binding.
 */

import type { MeasureSelection } from './query'

/**
 * Which Fields of the bound Dataset play which part in the visualization.
 *
 * The Author chooses this after the Data Shape predicate has established that
 * the Family *can* present the Dataset — satisfaction says a shape is possible,
 * the mapping says which Fields fill it.
 */
export interface FieldMapping {
  /** Trend, Temporal Pattern, Chronological. */
  timeDimension?: string
  /** Categorical Comparison, Composition, Ranking. */
  dimensions?: string[]
  /** Everything that aggregates. */
  measures?: MeasureSelection[]
  /** Tabular — Field keys to show as columns, in order. */
  columns?: string[]
}

export interface Widget {
  id: string
  /** FR-VZ-04 — exactly one Dataset. A Widget cannot span Datasets. */
  datasetId: string
  visualizationTypeId: string
  mapping: FieldMapping
  /** Defaults to the Dataset's name when the Author has not overridden it. */
  title?: string
  description?: string
  /**
   * FR-VZ-06 — which of the bound Dataset's filterable Fields the Author has
   * chosen to expose to the Viewer. Distinct from a Dashboard Control
   * (FR-CO-05), which acts across Widgets; these belong to this Widget alone.
   */
  exposedFilters?: string[]
  /** FR-VZ-06 — Fields the Viewer may reorder by. */
  exposedSorts?: string[]
  /** Options specific to the Visualization Type — line vs. area, stacked vs. grouped. */
  presentation?: Record<string, unknown>
}
