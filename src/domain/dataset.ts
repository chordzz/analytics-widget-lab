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
  /**
   * PROPOSED — Finding 16. How many distinct values this Field holds.
   *
   * Needed to tell a category from an identifier without reading the records.
   * A Dataset with a near-unique Dimension is either a list of countries or a
   * table of transaction ids, and the choice of grouping axis turns on which:
   * putting an id on an axis draws two thousand marks. Deriving it requires a
   * scan, so an Author's tool either receives it as metadata or performs a
   * retrieval merely to *offer* a chart — which FR-DP-11 is precisely trying to
   * avoid.
   */
  distinctCount?: number
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

/**
 * A parameter the Dataset's endpoint accepts — D24.
 *
 * Separate from `Field` because the publication model keeps two lists and they
 * answer different questions. `fields` describes what comes *back*, and a Field
 * name must match the key the Source System returns. A Filter Parameter
 * describes what may be *sent*, and the two overlap without being the same set:
 * a `from` bounding a date range is rarely a returned column, and a returned
 * column is not automatically accepted as a filter.
 *
 * We collapsed both into a boolean on the Field for most of this project's life,
 * which could express neither of the two facts below — and both are needed
 * before a Viewer-facing filter can work at all.
 */
export interface FilterParameter {
  /** The query parameter name sent upstream. */
  name: string
  /** How it reads to a person. Falls back to a humanised `name`. */
  label: string
  description?: string
  /**
   * The endpoint cannot answer without it.
   *
   * An unbound required parameter is not a filter left at "All" — it is a query
   * the Source System will refuse, so a Widget over such a Dataset must supply
   * one at composition time or not be composable.
   */
  required: boolean
  /**
   * The values this parameter accepts, when they are enumerable.
   *
   * This is what populates a Viewer's filter control. Absent means the values
   * are open-ended rather than that there are none — see Finding 8, which is
   * about the case the declaration cannot answer.
   */
  allowedValues?: (string | number)[]
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
   * What one row represents — D30.
   *
   * The Fields whose combination identifies a row, or an empty list where the
   * endpoint answers with a single summary row. A declaration lists the columns
   * and, without this, never says how many rows to expect — so an Author cannot
   * tell a one-row summary from two thousand records, and the two feed almost
   * disjoint sets of Visualization Types.
   *
   * Optional on the type because the deployed API does not carry it yet; PC-08
   * requires it, so a Dataset arriving without one is a Dataset we can say is
   * incompletely declared rather than one we have to guess about.
   */
  rowGrain?: { dimensions: string[] }
  /**
   * What the endpoint accepts as query input — D24.
   *
   * Optional because the fixtures predate it and a Dataset may legitimately
   * accept nothing. `filterableFields` derives the older boolean view from it,
   * so callers that only ask "may I filter on this Field" keep working.
   */
  filterParameters?: FilterParameter[]
  /**
   * What one row represents: the Field keys whose combination identifies it.
   *
   * An empty array is meaningful and is not the same as an absent one — `[]`
   * says the endpoint answers with a *single summary row*, where absent says the
   * publisher has not declared a grain at all.
   *
   * This is the fact an Author needs at the moment they pick a Dataset and
   * could not previously get: two declarations with identical Fields can answer
   * with one summary row or with thousands of records, and the choice decides
   * whether the widget they are building is correct. Asked for as D30 and
   * granted on 15 September.
   */
  grain?: string[]
  /**
   * PROPOSED — Finding 1. The Distribution Family requires "one Measure across
   * many records"; record volume is not expressible in the published model.
   */
  recordVolume?: 'few' | 'many'
  /**
   * PROPOSED — Finding 16. How many records the Dataset holds.
   *
   * Strictly more useful than `recordVolume` and subsumes it: "many" is a
   * threshold over this number, and a threshold nobody can see is a threshold
   * nobody can agree with. Same motivation — a Catalogue that cannot say how
   * big a Dataset is forces a retrieval to find out.
   */
  recordCount?: number
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

// --- Filter Parameters (D24) -----------------------------------------------

export function filterParameterFor(
  dataset: Dataset,
  name: string,
): FilterParameter | undefined {
  return dataset.filterParameters?.find((parameter) => parameter.name === name)
}

/**
 * Parameters the endpoint cannot answer without.
 *
 * A Widget bound to a Dataset with any of these must supply every one of them,
 * every time — an unbound required parameter is a guaranteed rejection rather
 * than a filter left unset.
 */
export function requiredParameters(dataset: Dataset): FilterParameter[] {
  return (dataset.filterParameters ?? []).filter((parameter) => parameter.required)
}

/**
 * The values a filter control may offer, or `undefined` when the declaration
 * does not say.
 *
 * `undefined` and `[]` are different answers and the caller must be able to tell
 * them apart: the first means the values are open-ended and have to come from
 * somewhere else, the second means the publisher declared this parameter accepts
 * nothing — which is a broken declaration rather than an empty dropdown.
 */
export function allowedValuesFor(
  dataset: Dataset,
  name: string,
): (string | number)[] | undefined {
  return filterParameterFor(dataset, name)?.allowedValues
}
