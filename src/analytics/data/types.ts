/**
 * The module's data shape.
 *
 * Deliberately lighter than the FRD's publication model. This module exists to
 * design widgets, so a dataset needs to say just enough for a widget to draw it
 * and for a picker to offer sensible fields. Governance, aggregations and
 * authorization live on the other track.
 *
 * The vocabulary is kept aligned with the FRD — Dataset, Dimension, Measure,
 * Time Dimension — so the two converge cleanly later.
 */

export type FieldKind = 'dimension' | 'time' | 'measure'

/** How a value should read. Drives axis ticks, tooltips and table cells alike. */
export type ValueFormat = 'number' | 'currency' | 'percent' | 'compact' | 'duration' | 'text'

export interface Field {
  key: string
  label: string
  kind: FieldKind
  format?: ValueFormat
  /**
   * Marks a field as geographic.
   *
   * `country`/`region` name a place; `lat`/`lng` locate one. The coordinate
   * roles matter as much as the naming ones: latitude is a Measure by kind, so
   * without the marker it is offered as the measure to rank countries by, and a
   * ranked list happily sorts them by how far north they are.
   */
  geo?: 'country' | 'region' | 'lat' | 'lng'
}

export type Row = Record<string, string | number | null>

export interface Dataset {
  id: string
  name: string
  description: string
  /** Which system published it. Shown in the picker for orientation. */
  source: string
  fields: Field[]
  rows: Row[]
  /**
   * Widget types this dataset is *meant* for, by id.
   *
   * Field kinds say what a dataset can technically feed; they cannot say what
   * it means. Any table with a dimension and a measure satisfies a funnel, but
   * only one of them describes ordered stages. That is semantics, and the only
   * honest source for it is the person who wrote the dataset — so they declare
   * it, and the builder offers it first. Purely a hint: nothing is excluded.
   */
  suits?: string[]
}

export const fieldsOfKind = (dataset: Dataset, kind: FieldKind): Field[] =>
  dataset.fields.filter((field) => field.kind === kind)

export const measures = (dataset: Dataset) => fieldsOfKind(dataset, 'measure')
export const dimensions = (dataset: Dataset) => fieldsOfKind(dataset, 'dimension')
export const timeFields = (dataset: Dataset) => fieldsOfKind(dataset, 'time')

export const fieldOf = (dataset: Dataset, key: string): Field | undefined =>
  dataset.fields.find((field) => field.key === key)
