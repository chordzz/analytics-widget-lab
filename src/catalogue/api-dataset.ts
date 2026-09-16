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
  /**
   * Explicit since 15 September, and deliberately separate from
   * `classification` — a Dataset can be `financial` *and* personal, so
   * inferring one from the other under-records (FR-DA-14).
   */
  exposes_personal_data?: boolean
  /**
   * The Field keys whose combination identifies one row; `[]` where the endpoint
   * answers with a single summary row. What we asked for as BE-2 and D30.
   */
  grain?: string[]
  time_dimension_field?: string | null
  fields: ApiField[]
  filter_parameters?: ApiFilterParameter[]
  required_permission_key?: string
  deleted?: boolean
}

/**
 * A Field, as declared since 15 September.
 *
 * Four changes landed at once, and three of them replace something we were
 * guessing at: `name` became `key`, `label` is now supplied rather than derived
 * from the key, and `filterable` and `orderable` are stated rather than inferred
 * — the API's own note says an omitted value is *an undeclared Field, not a
 * default*, so neither is optional here.
 */
export interface ApiField {
  key: string
  label: string
  type: string
  role: 'dimension' | 'measure'
  description?: string
  aggregations?: string[]
  filter_operators?: string[]
  filterable?: boolean
  orderable?: boolean
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
 * The sensitivity ladder, which both sides now spell the same way.
 *
 * This was a translation table — their `internal | pii | financial` against our
 * four — and it became a hazard the moment the API adopted our vocabulary. A
 * table keyed on words nobody sends any more matches nothing, and the `??`
 * behind it substituted `internal` for every real value: a `confidential`
 * Dataset read as ordinary company data and a `restricted` one did too.
 *
 * Silent, because a missing key is not an error — the lookup returns
 * `undefined`, the default fills in, and the type of the result is still
 * correct. `Record<string, …>` accepts any key, so nothing could have caught it.
 *
 * So the values pass straight through now, and the only job left is refusing
 * one we do not recognise.
 */
const CLASSIFICATIONS: readonly DataClassification[] = [
  'public',
  'internal',
  'confidential',
  'restricted',
]

/**
 * An unrecognised label reads as the *most* protected, not the default.
 *
 * The API attaches one rule to this field — it may be raised but never lowered,
 * because data already went out under the higher label — and a fallback of
 * `internal` broke exactly that rule on every read. If the vocabulary drifts
 * again, over-caution is the direction to drift in: the cost is a Dataset that
 * looks more sensitive than it is, against a Dataset that looks safer to spread
 * around than it is.
 */
function classificationFrom(declared: string | undefined): DataClassification {
  return (CLASSIFICATIONS as readonly string[]).includes(declared ?? '')
    ? (declared as DataClassification)
    : 'restricted'
}

export function datasetFrom(api: ApiDataset): Dataset {
  const timeField = api.time_dimension_field ?? null

  return {
    id: api.id,
    name: api.name,
    description: api.description ?? '',
    sourceSystem: api.source_system_id,
    classification: classificationFrom(api.classification),
    /*
     * Read, never inferred.
     *
     * The two fields answer different questions — *how protected* is this, and
     * *is it about an identifiable person* — and the API says so directly: a
     * Dataset can be `confidential` **and** personal. So one has never implied
     * the other.
     *
     * This carried `classification === 'pii'` as a fallback, which is now worse
     * than useless: `pii` was retired from the ladder, so the fallback answers
     * `false` for everything. And `false` is the dangerous answer — it drives
     * the access-recording obligation in FR-DA-14, so a wrong `false` means a
     * retrieval of personal data that nobody wrote down.
     *
     * An absent field is therefore not a licence to guess. `true` is the safe
     * reading: recording an access that did not need recording costs a row.
     */
    exposesPersonalData: api.exposes_personal_data ?? true,
    /*
     * BE-2, granted. `[]` is meaningful — the endpoint answers with one summary
     * row — so it is kept distinct from an absent declaration, which says
     * nothing.
     */
    ...(api.grain === undefined ? {} : { grain: api.grain }),
    fields: api.fields.map((field) => fieldFrom(field, timeField)),
    filterParameters: filterParametersFrom(api),
  }
}

function fieldFrom(api: ApiField, timeField: string | null): Field {
  const base = {
    key: api.key,
    /*
     * Supplied since 15 September. `labelFor` remains the fallback for a
     * declaration written before the field existed — it humanises the key,
     * which beats showing `total_amount` in a picker but is a guess at what the
     * publisher would have called it.
     */
    label: api.label || labelFor(api.key),
    description: api.description,
    /*
     * Stated, not derived.
     *
     * These were inferred — `filterable` from the presence of a matching Filter
     * Parameter, `sortable` from a field that no longer exists under that name.
     * Both are now explicit, and the API's note is worth honouring exactly: an
     * omitted value is *an undeclared Field, not a default*. So absent becomes
     * `false` rather than being guessed at from anything else.
     */
    filterable: api.filterable === true,
    sortable: api.orderable === true,
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
  const role = api.key === timeField ? 'time-dimension' : 'dimension'

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
