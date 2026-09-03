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
  /**
   * Names a place — a country, a region. Unblocks Geospatial's choropleth
   * route.
   */
  | 'geographic-area'
  /**
   * Locates one. Latitude and longitude are **separate** semantics rather than
   * one `geographic-point`, because a point map needs both and has to know
   * which is which.
   *
   * Finding 15 (Merge Plan §5) is why these three replaced the single
   * `geographic-location` this type first carried. Two failures made the coarse
   * version untenable, and both are in this repository's history:
   *
   *   - Geospatial's clause read `semantic === 'geographic-location' && role
   *     !== 'measure'`. Latitude is a Measure by role, so the clause excluded
   *     precisely the Fields a point map needs, and no Dataset could ever
   *     satisfy it that way.
   *   - Without the latitude/longitude distinction a ranked list will rank
   *     countries by how far north they are, and a point map will accept a
   *     table of regional sales and plot revenue as a latitude.
   */
  | 'geographic-latitude'
  | 'geographic-longitude'
  | 'additive-total' // unblocks Composition
  | 'state' // unblocks Status via its state-Dimension route
  | 'stage' // unblocks Ranking & Flow via its ordered-stage route

/** Every semantic that says a Field is geographic. */
export const GEOGRAPHIC_SEMANTICS = [
  'geographic-area',
  'geographic-latitude',
  'geographic-longitude',
] as const

export const isGeographic = (field: { semantic?: FieldSemantic }): boolean =>
  field.semantic !== undefined &&
  (GEOGRAPHIC_SEMANTICS as readonly string[]).includes(field.semantic)

/** A Field holding a coordinate, as opposed to one naming a place. */
export const isCoordinate = (field: { semantic?: FieldSemantic }): boolean =>
  field.semantic === 'geographic-latitude' || field.semantic === 'geographic-longitude'

/**
 * How a Field's values should read.
 *
 * D12 — not part of the FRD's published model. It sits here rather than on the
 * Widget because it is a property of the data and not of any one picture of it:
 * revenue is a currency in every chart that draws it, and asking each Author to
 * re-declare that per Widget is how two Widgets over one Field end up disagreeing
 * about whether it is money. The publisher is the only party that knows.
 */
export type ValueFormat = 'number' | 'currency' | 'percent' | 'compact' | 'duration' | 'text'

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
  /** D12 — how the values read. See ValueFormat. */
  format?: ValueFormat
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
  /**
   * D5 — Visualization Types this Dataset is *meant* for, by id.
   *
   * A hint, never a filter. The invariant that a Dataset is bound to no
   * Visualization Type still holds: nothing is excluded by this, and every Type
   * whose Family the Dataset satisfies stays on offer. It reorders the picker so
   * the publisher's intent shows first.
   *
   * It exists because role is not meaning. Any table with a Dimension and a
   * Measure satisfies a funnel; one of them is *about* funnels, and the only
   * party who knows which is the publisher.
   */
  suits?: string[]
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

export function geographicFields(dataset: Dataset): Field[] {
  return dataset.fields.filter(isGeographic)
}
