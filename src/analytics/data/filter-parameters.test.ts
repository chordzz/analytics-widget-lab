/**
 * Filter Parameters — D24, and the two facts a filter control cannot work
 * without.
 *
 * The publication model keeps two lists on purpose. `fields` describes what
 * comes back; `filter_parameters` describes what may be sent. We collapsed both
 * into a boolean for most of this project's life, which could express neither
 * *which values are accepted* nor *which parameters are mandatory* — so every
 * Viewer-facing filter rendered an empty control, and a Dataset with a required
 * parameter produced a Widget that could only fail.
 */

import { describe, expect, test } from 'bun:test'
import { allowedValuesFor, filterParameterFor, requiredParameters } from '../../domain/dataset'
import { datasetFrom, filterParametersFrom, type ApiDataset } from '../../catalogue/api-dataset'
import { requireDataset, rowsFor } from './datasets'

const api = (overrides: Partial<ApiDataset> = {}): ApiDataset => ({
  id: 'peniremit.settlements',
  name: 'Settlements',
  source_system_id: 'peniremit',
  time_dimension_field: 'settlement_date',
  fields: [
    { name: 'settlement_date', type: 'date', role: 'dimension' },
    { name: 'corridor', type: 'category', role: 'dimension' },
    { name: 'settlement_amount', type: 'number', role: 'measure', aggregations: ['sum'] },
  ],
  filter_parameters: [
    { name: 'from', type: 'date', required: true },
    { name: 'corridor', type: 'category', allowed_values: ['NG-UK', 'NG-US'] },
  ],
  ...overrides,
})

describe('the declaration is carried whole, not flattened', () => {
  test('a parameter that is not a returned column survives', () => {
    /*
     * `from` bounds a date range and is not a column the endpoint returns, so
     * under the old boolean-on-a-Field model it was unreachable — there was no
     * Field to hang it from. This is the case D24 was written about.
     */
    const dataset = datasetFrom(api())
    expect(filterParameterFor(dataset, 'from')).toBeDefined()
    expect(dataset.fields.some((field) => field.key === 'from')).toBe(false)
  })

  test('required is carried', () => {
    expect(requiredParameters(datasetFrom(api())).map((p) => p.name)).toEqual(['from'])
  })

  test('allowed values are carried', () => {
    expect(allowedValuesFor(datasetFrom(api()), 'corridor')).toEqual(['NG-UK', 'NG-US'])
  })

  test('a parameter gets a readable label from its name', () => {
    const [parameter] = filterParametersFrom(
      api({ filter_parameters: [{ name: 'settlement_status', type: 'category' }] }),
    )
    expect(parameter.label).toBe('Settlement status')
  })
})

describe('absent allowed values stay absent', () => {
  test('undefined, not an empty list', () => {
    /*
     * The two are different claims and a control must tell them apart.
     * `undefined` means the values are open-ended and have to come from
     * somewhere else — Finding 8. `[]` would mean the publisher declared this
     * parameter accepts nothing, which is a broken declaration rather than an
     * empty dropdown, and collapsing the first into the second would silently
     * stop us asking.
     */
    expect(allowedValuesFor(datasetFrom(api()), 'from')).toBeUndefined()
  })

  test('a declared empty list is kept as declared', () => {
    const dataset = datasetFrom(
      api({ filter_parameters: [{ name: 'corridor', type: 'category', allowed_values: [] }] }),
    )
    expect(allowedValuesFor(dataset, 'corridor')).toEqual([])
  })

  test('required defaults to false rather than undefined', () => {
    // A parameter that does not say is not required. Leaving it undefined would
    // make `requiredParameters` depend on a falsy check rather than a declared one.
    const [parameter] = filterParametersFrom(
      api({ filter_parameters: [{ name: 'corridor', type: 'category' }] }),
    )
    expect(parameter.required).toBe(false)
  })
})

describe('a numeric parameter carries numeric values', () => {
  test('allowed values are parsed for a number-typed parameter', () => {
    /*
     * `allowed_values` is declared as strings whatever the parameter's type,
     * while rows arrive with JSON numbers. Leaving `'5'` as a string makes every
     * comparison fail on type — the same silent mismatch the widget data
     * contract warns publishers about from the other side.
     */
    const dataset = datasetFrom(
      api({ filter_parameters: [{ name: 'tier', type: 'number', allowed_values: ['1', '2', '3'] }] }),
    )
    expect(allowedValuesFor(dataset, 'tier')).toEqual([1, 2, 3])
  })

  test('a non-numeric value on a number parameter is left alone', () => {
    // Coercing it would produce NaN, which is worse than reporting what was
    // declared and letting the mismatch be visible.
    const dataset = datasetFrom(
      api({ filter_parameters: [{ name: 'tier', type: 'number', allowed_values: ['1', 'gold'] }] }),
    )
    expect(allowedValuesFor(dataset, 'tier')).toEqual([1, 'gold'])
  })

  test('a category parameter keeps its strings', () => {
    expect(allowedValuesFor(datasetFrom(api()), 'corridor')).toEqual(['NG-UK', 'NG-US'])
  })
})

describe('the fixtures declare parameters the way a publisher should', () => {
  test('every filterable Field has a parameter', () => {
    const dataset = requireDataset('sales-by-region')
    const declared = new Set((dataset.filterParameters ?? []).map((p) => p.name))
    for (const field of dataset.fields.filter((f) => f.filterable)) {
      expect(declared.has(field.key)).toBe(true)
    }
  })

  test('an enumerable Dimension carries its values', () => {
    const dataset = requireDataset('sales-by-region')
    const regions = [...new Set(rowsFor('sales-by-region').map((row) => String(row.region)))]
    expect(allowedValuesFor(dataset, 'region')?.length).toBe(regions.length)
  })

  test('a Field with too many distinct values carries none', () => {
    /*
     * 365 dates is not a dropdown. Declaring them would be worse than declaring
     * nothing: it turns a control the Viewer can use into one they have to
     * scroll, and it is the judgement a real publisher makes too.
     */
    expect(allowedValuesFor(requireDataset('revenue-daily'), 'date')).toBeUndefined()
  })

  test('values are ordered, and numbers numerically', () => {
    // `10` must not sort before `9`, which is what string comparison would do
    // and what a Viewer would read as a broken list.
    const values = allowedValuesFor(requireDataset('sales-by-region'), 'region') ?? []
    expect([...values].sort((a, b) => String(a).localeCompare(String(b)))).toEqual(values)
  })

  test('one fixture declares a required parameter', () => {
    /*
     * Deliberately exactly one. A required parameter is a state a live API will
     * not produce on demand, and the fixtures exist to reach those — the same
     * argument that keeps `denied`, `withdrawn` and `partial` reachable.
     */
    const required = requiredParameters(requireDataset('transactions'))
    expect(required.map((p) => p.name)).toEqual(['channel'])
  })

  test('and it is required for a reason a real Dataset would share', () => {
    // Record grain over personal financial data: an endpoint serving it should
    // refuse to answer "all of them", so narrowing is a condition of asking.
    const dataset = requireDataset('transactions')
    expect(dataset.exposesPersonalData).toBe(true)
    expect(allowedValuesFor(dataset, 'channel')).toBeDefined()
  })

  test('no other fixture requires anything', () => {
    for (const id of ['revenue-daily', 'sales-by-region', 'product-performance']) {
      expect(requiredParameters(requireDataset(id))).toEqual([])
    }
  })
})
