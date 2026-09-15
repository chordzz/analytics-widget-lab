/**
 * The API's Dataset declaration, translated into ours.
 *
 * This is where divergences D21, D24 and D29 are paid off. Each was recorded
 * with `endedAt: 'the HTTP adapter'`, and this is that adapter: the API's wire
 * format wins, and the translation lives in our repo rather than in a contract
 * other teams have already read.
 *
 * Three of the four translations lose something, and each says what:
 *
 *   - **Role.** The API has two (`dimension | measure`) and names the temporal
 *     one separately in `time_dimension_field`. We have three. Reconstructing
 *     the third is exact, because the API names exactly one.
 *   - **Filterability.** The API keeps two lists — `fields` describes what comes
 *     back, `filter_parameters` describes what may be sent. We collapse the
 *     second into a boolean on the first, which cannot express a parameter that
 *     is not also a returned column. That is D24, and it is the one place their
 *     model is plainly richer than ours.
 *   - **Classification.** Four levels against three, and the two vocabularies
 *     are not nested. See `CLASSIFICATION` below.
 */

import type {
  Aggregation,
  DataClassification,
  Dataset,
  Field,
  FilterParameter,
  Measure,
} from '../domain/dataset'

/** `Dataset` as the API declares it. Only the parts we read. */
export interface ApiDataset {
  id: string
  name: string
  description?: string
  source_system_id: string
  service_id?: string
  path?: string
  status?: 'published' | 'withdrawn'
  classification?: string
  time_dimension_field?: string | null
  fields: ApiField[]
  filter_parameters?: ApiFilterParameter[]
  required_permission_key?: string
  deleted?: boolean
}

export interface ApiField {
  name: string
  type: string
  role: 'dimension' | 'measure'
  description?: string
  aggregations?: string[]
  filter_operators?: string[]
  sortable?: boolean
}

export interface ApiFilterParameter {
  name: string
  type: string
  required?: boolean
  description?: string
  allowed_values?: string[]
}

/**
 * Filter Parameters, carried whole — D24.
 *
 * Previously this list was read only to set a boolean on each Field, which
 * discarded the two facts a filter control actually needs: whether the endpoint
 * refuses to answer without the parameter, and which values it accepts. Both
 * were declared and both were thrown away, so every Viewer-facing filter
 * rendered an empty dropdown and every Dataset with a required parameter
 * produced a widget that could only fail.
 */
export function filterParametersFrom(api: ApiDataset): FilterParameter[] {
  return (api.filter_parameters ?? []).map((parameter) => ({
    name: parameter.name,
    label: labelFor(parameter.name),
    ...(parameter.description === undefined ? {} : { description: parameter.description }),
    required: parameter.required === true,
    /*
     * Absent stays absent rather than becoming `[]`. The two mean different
     * things to a control — open-ended values it must find elsewhere, versus a
     * publisher declaring this parameter accepts nothing.
     */
    ...(parameter.allowed_values === undefined
      ? {}
      : { allowedValues: numericIfAll(parameter.allowed_values, parameter.type) }),
  }))
}

/**
 * `allowed_values` is declared as strings whatever the parameter's type.
 *
 * A numeric parameter's values are compared against row data that arrives as
 * JSON numbers, so leaving them as strings would make every comparison fail on
 * type — the same class of silent mismatch the widget data contract warns
 * publishers about from the other direction.
 */
function numericIfAll(values: string[], type: string): (string | number)[] {
  if (type !== 'number') return values
  return values.map((value) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) && value.trim() !== '' ? parsed : value
  })
}

/**
 * D29 — the same six operations, two of them abbreviated.
 *
 * Worth a table rather than a cast. An aggregation we do not recognise looks
 * exactly like an empty column: it falls through the reducer's switch to a
 * silent zero rather than failing, so a board ends up showing 0 where it should
 * show a minimum.
 */
const AGGREGATIONS: Record<string, Aggregation> = {
  sum: 'sum',
  average: 'average',
  count: 'count',
  min: 'minimum',
  max: 'maximum',
  minimum: 'minimum',
  maximum: 'maximum',
  'distinct-count': 'distinct-count',
}

/**
 * Their three sensitivity tags against our four.
 *
 * The vocabularies are not nested, so this is a judgement rather than a lookup
 * and it errs upward on purpose. `pii` becomes our most restrictive level
 * because their own note says it may never be lowered — data already went out
 * under that label. `financial` becomes `confidential`. Our `public` has no
 * counterpart and is simply unreachable from the API, which is the safe
 * direction for a mapping to be lossy in.
 */
const CLASSIFICATION: Record<string, DataClassification> = {
  internal: 'internal',
  financial: 'confidential',
  pii: 'restricted',
}

export function datasetFrom(api: ApiDataset): Dataset {
  const filterable = new Set((api.filter_parameters ?? []).map((parameter) => parameter.name))
  const timeField = api.time_dimension_field ?? null

  return {
    id: api.id,
    name: api.name,
    description: api.description ?? '',
    sourceSystem: api.source_system_id,
    classification: CLASSIFICATION[api.classification ?? ''] ?? 'internal',
    // FR-DP-07 drives the access record (FR-DA-14), and `pii` is the only tag
    // the API has that asserts personal data.
    exposesPersonalData: api.classification === 'pii',
    fields: api.fields.map((field) => fieldFrom(field, timeField, filterable)),
    filterParameters: filterParametersFrom(api),
  }
}

function fieldFrom(api: ApiField, timeField: string | null, filterable: Set<string>): Field {
  const base = {
    key: api.name,
    // The API declares no label — `name` is the key the Source System returns,
    // and it is the only human-facing string we have. Humanising it here beats
    // showing `total_amount` in a picker, and a publisher who wants better can
    // write a `description`.
    label: labelFor(api.name),
    description: api.description,
    filterable: filterable.has(api.name),
    sortable: api.sortable ?? false,
  }

  if (api.role === 'measure') {
    return {
      ...base,
      role: 'measure',
      aggregations: mapAggregations(api.aggregations),
    } satisfies Measure
  }

  // D21 — the third role, reconstructed. The API names exactly one temporal
  // Field per Dataset, so this is exact rather than a heuristic on `type`.
  const role = api.name === timeField ? 'time-dimension' : 'dimension'

  /*
   * A `location`-typed Dimension names a place — D2, and conformance rather
   * than inference.
   *
   * §4.2 asks Geospatial for "a location-typed Dimension", and the API has
   * exactly that in `FieldType`. Our model expresses the same fact as a
   * `semantic`, so reading one as the other is a translation, not a guess.
   *
   * The coordinate half stays undecidable and is left alone: a point map needs
   * two Measures that know which of them is latitude, and `type: 'location'` on
   * a number cannot say. Marking those would be the failure the semantic was
   * introduced to prevent — a table of regional sales plotted with revenue as a
   * latitude.
   */
  const semantic = role === 'dimension' && api.type === 'location' ? 'geographic-area' : undefined

  return { ...base, role, ...(semantic ? { semantic } : {}) }
}

/**
 * An unrecognised aggregation is dropped rather than passed through.
 *
 * Offering an Author an aggregation our reducer does not implement produces a
 * column of zeroes with no error — the failure D29 was written about. Dropping
 * it makes the option absent, which is visible.
 */
function mapAggregations(declared: string[] | undefined): Aggregation[] {
  const mapped = (declared ?? [])
    .map((name) => AGGREGATIONS[name])
    .filter((name): name is Aggregation => name !== undefined)

  // A Measure with no usable aggregation can still be counted, and a Measure
  // with an empty list fails every Visualization Family's satisfaction check —
  // which would hide the Field rather than explain it.
  return mapped.length > 0 ? mapped : ['sum']
}

/** `total_amount` → `Total amount`. */
export function labelFor(name: string): string {
  const words = name.replace(/[_-]+/g, ' ').replace(/([a-z\d])([A-Z])/g, '$1 $2').trim()
  if (words === '') return name
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase()
}

/** FR-DP-13 — a withdrawn Dataset leaves the Catalogue. */
export const isPublished = (api: ApiDataset): boolean =>
  api.deleted !== true && api.status !== 'withdrawn'
