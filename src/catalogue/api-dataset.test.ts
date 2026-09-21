/**
 * The three declaration fields the API gained on 17–18 September, and the
 * translation each needs.
 *
 * There was no coverage on this mapper's new paths, which is exactly how the
 * `types` / `visualization_types` mismatch sat broken for six days: reading a
 * property the wire does not carry yields `undefined`, `undefined` becomes an
 * absent field, and an absent field is a legitimate state everywhere
 * downstream. Nothing throws, nothing logs, and a capability quietly does not
 * exist.
 *
 * So each of these asserts the value *arrives*, not merely that the shape
 * parses.
 */

import { describe, expect, test } from 'bun:test'
import { datasetFrom, type ApiDataset } from './api-dataset'
import { timeRangeParameters } from '../domain/dataset'

const api = (over: Partial<ApiDataset> = {}): ApiDataset => ({
  id: 'peniremit.settlements',
  name: 'Settlements',
  source_system_id: 'peniremit',
  status: 'published',
  exposes_personal_data: false,
  grain: ['day', 'corridor'],
  time_dimension_field: 'day',
  fields: [
    { key: 'day', label: 'Day', type: 'date', role: 'dimension', filterable: true, orderable: true },
    { key: 'amount', label: 'Amount', type: 'number', role: 'measure', aggregations: ['sum'], filterable: false, orderable: true },
  ],
  filter_parameters: [
    { name: 'start_date', type: 'date' },
    { name: 'end_date', type: 'date' },
  ],
  ...over,
})

const measure = (semantic?: string) => ({
  key: 'amount', label: 'Amount', type: 'number', role: 'measure' as const,
  aggregations: ['sum'], filterable: false, orderable: true,
  ...(semantic === undefined ? {} : { semantic }),
})

describe('Field semantics', () => {
  test('a declared semantic is carried', () => {
    const dataset = datasetFrom(api({ fields: [measure('additive-total')] }))
    expect(dataset.fields[0].semantic).toBe('additive-total')
  })

  test('an unrecognised one is dropped, not passed through', () => {
    // A vocabulary we do not share. Guessing at one is how a table of regional
    // sales gets plotted with revenue as a latitude.
    const dataset = datasetFrom(api({ fields: [measure('revenue-ish')] }))
    expect(dataset.fields[0].semantic).toBeUndefined()
  })

  test('a location Dimension still names a place when nobody declared one', () => {
    /*
     * The inference that was all we had. Kept because the backend deliberately
     * kept it too — a bare `location` Field still qualifies for Geospatial on
     * their side, so removing it here would make us narrower than the API and
     * hide a Family that genuinely works.
     */
    const dataset = datasetFrom(
      api({ fields: [{ key: 'country', label: 'Country', type: 'location', role: 'dimension', filterable: true, orderable: false }] }),
    )
    expect(dataset.fields[0].semantic).toBe('geographic-area')
  })

  test('a declared semantic wins over the inference', () => {
    const dataset = datasetFrom(
      api({ fields: [{ key: 'lat', label: 'Latitude', type: 'location', role: 'dimension', semantic: 'geographic-latitude', filterable: true, orderable: false }] }),
    )
    expect(dataset.fields[0].semantic).toBe('geographic-latitude')
  })
})

describe('record volume', () => {
  test.each([
    ['millions', 'many'],
    ['thousands', 'many'],
    ['tens', 'few'],
    ['single-row', 'few'],
  ])('%s reads as %s', (declared, expected) => {
    expect(datasetFrom(api({ record_volume: declared })).recordVolume).toBe(expected as 'few' | 'many')
  })

  test('undeclared is absent, not few', () => {
    /*
     * Different answers. `few` is the publisher saying it is small — a reason
     * to tell an Author a histogram is wrong. Absent is nobody having said,
     * which is why Distribution is withheld rather than refused.
     */
    expect(datasetFrom(api()).recordVolume).toBeUndefined()
  })

  test('a magnitude we do not recognise is absent rather than guessed', () => {
    expect(datasetFrom(api({ record_volume: 'billions' })).recordVolume).toBeUndefined()
  })
})

describe('the declared date range', () => {
  const withRange = (range: ApiDataset['time_range']) => datasetFrom(api({ time_range: range }))

  test('reaches parameters we could never have guessed', () => {
    // The whole value of BE-8. Before it, this Dataset's range control moved
    // and nothing happened: we sent `from`/`to`, which it does not declare.
    const dataset = withRange({ field: 'day', from_parameter: 'start_date', to_parameter: 'end_date' })
    expect(timeRangeParameters(dataset)).toEqual({ from: 'start_date', to: 'end_date' })
  })

  test('a half-declared range is no range', () => {
    // Sending `from` without `to` narrows one end and leaves the other open,
    // which draws a chart that looks filtered and is not.
    expect(withRange({ field: 'day', from_parameter: 'start_date' }).timeRange).toBeUndefined()
  })

  test('both ends the same parameter is no range', () => {
    expect(
      withRange({ field: 'day', from_parameter: 'same', to_parameter: 'same' }).timeRange,
    ).toBeUndefined()
  })

  test('a range naming an undeclared parameter sends nothing', () => {
    /*
     * The API validates this at publication and we are not the authority — but
     * naming a parameter this Dataset does not carry would send an argument the
     * endpoint has never heard of, and sending nothing is the better failure.
     */
    const dataset = withRange({ field: 'day', from_parameter: 'nope', to_parameter: 'end_date' })
    expect(timeRangeParameters(dataset)).toEqual({ to: 'end_date' })
  })

  test('without a declaration, only `from`/`to` are reachable', () => {
    const dataset = datasetFrom(
      api({ filter_parameters: [{ name: 'from', type: 'date' }, { name: 'to', type: 'date' }] }),
    )
    expect(timeRangeParameters(dataset)).toEqual({ from: 'from', to: 'to' })
  })

  test('and a Dataset spelling them otherwise reaches neither', () => {
    // Deliberate. A list of naming conventions is assumptions nobody agreed to,
    // and wrong *silently* — `start` meaning something else accepts our date.
    expect(timeRangeParameters(datasetFrom(api()))).toEqual({})
  })
})
