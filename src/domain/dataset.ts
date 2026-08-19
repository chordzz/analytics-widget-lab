/**
 * Analytics domain — publication model.
 *
 * Terms here are the Analytics Ubiquitous Language and are load-bearing:
 * Dataset, Field, Dimension, Measure, Time Dimension, Source System.
 * Do not introduce synonyms.
 *
 * Mirrors FR-DP-02 — FR-DP-07.
 */

/** FR-DP-04 — which aggregations are meaningful for a Measure. */
export type Aggregation =
  | 'sum'
  | 'average'
  | 'count'
  | 'minimum'
  | 'maximum'
  | 'distinct-count'

/** FR-DP-07 — sensitivity of the data a Dataset exposes. */
export type DataClassification = 'public' | 'internal' | 'confidential' | 'restricted'

/**
 * PROPOSED — not part of the published model in the FRD today.
 *
 * See Finding 1 in Analytics_Frontend_Plan.md §9. Five Visualization Families
 * declare Data Shapes referencing properties that FR-DP-03 — FR-DP-07 cannot
 * express, so FR-VZ-05 (P0) cannot be evaluated for them. This is the
 * recommended extension: one optional semantic descriptor rather than a
 * scatter of one-off flags.
 *
 * Every use of this is gated behind an explicit opt-in
 * (`SatisfactionOptions.useProposedSemantics`) so the gap stays visible in the
 * UI instead of being quietly papered over.
 */
export type FieldSemantic =
  | 'geographic-location' // unblocks Geospatial
  | 'additive-total' // unblocks Composition
  | 'state' // unblocks Status via its state-Dimension route
  | 'stage' // unblocks Ranking & Flow via its ordered-stage route

interface FieldBase {
  key: string
  label: string
  description?: string
  /** FR-DP-05 — may this Field be used to filter records? */
  filterable: boolean
  /** FR-DP-05 — may this Field be used to order records? */
  sortable: boolean
  /** PROPOSED — see FieldSemantic. */
  semantic?: FieldSemantic
}

/** A Field whose values identify or categorize records. */
export interface Dimension extends FieldBase {
  role: 'dimension'
}

/** FR-DP-06 — a Dimension whose values represent points in time. */
export interface TimeDimension extends FieldBase {
  role: 'time-dimension'
}

/** A Field whose values can be meaningfully aggregated. */
export interface Measure extends FieldBase {
  role: 'measure'
  /** FR-DP-04 */
  aggregations: Aggregation[]
}

export type Field = Dimension | TimeDimension | Measure
export type FieldRole = Field['role']

export interface Dataset {
  id: string
  name: string
  description: string
  /** FR-DP-02 — ownership is singular and unambiguous. */
  sourceSystem: string
  /** FR-DP-07 */
  classification: DataClassification
  /** FR-DP-07 — whether the Dataset exposes personal data. Drives FR-DA-14. */
  exposesPersonalData: boolean
  /** FR-DP-03 */
  fields: Field[]
  /**
   * PROPOSED — Finding 1. The Distribution Family requires "one Measure across
   * many records"; record volume is not expressible in the published model.
   */
  recordVolume?: 'few' | 'many'
}

/**
 * A Time Dimension *is* a Dimension (per the Definitions table), so it counts
 * wherever a Dimension is required. Families that need a non-temporal
 * Dimension must say so explicitly.
 */
export function dimensionsOf(dataset: Dataset): (Dimension | TimeDimension)[] {
  return dataset.fields.filter(
    (f): f is Dimension | TimeDimension => f.role === 'dimension' || f.role === 'time-dimension',
  )
}

export function timeDimensionsOf(dataset: Dataset): TimeDimension[] {
  return dataset.fields.filter((f): f is TimeDimension => f.role === 'time-dimension')
}

export function measuresOf(dataset: Dataset): Measure[] {
  return dataset.fields.filter((f): f is Measure => f.role === 'measure')
}

export function fieldsWithSemantic(dataset: Dataset, semantic: FieldSemantic): Field[] {
  return dataset.fields.filter((f) => f.semantic === semantic)
}
