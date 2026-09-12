/**
 * The Catalogue over HTTP, and the translation it performs.
 *
 * The translation is where three recorded divergences are paid off — D21
 * (three roles against two), D24 (filterability), D29 (`min` against
 * `minimum`) — and each has a failure it was written about. The assertions
 * name them.
 */

import { describe, expect, test } from 'bun:test'
import { httpCatalogue } from './http-catalogue'
import { datasetFrom, isPublished, labelFor, type ApiDataset } from './api-dataset'
import { createApiClient } from '../api/client'
import { fakeTokenProvider } from '../auth/fake-provider'

const settlements: ApiDataset = {
  id: 'peniremit.settlements',
  name: 'Settlements',
  description: 'Daily settlement totals by corridor.',
  source_system_id: 'peniremit',
  status: 'published',
  classification: 'financial',
  time_dimension_field: 'day',
  fields: [
    { name: 'day', type: 'date', role: 'dimension', sortable: true },
    { name: 'corridor', type: 'category', role: 'dimension' },
    { name: 'total_amount', type: 'number', role: 'measure', aggregations: ['sum', 'min', 'max'] },
  ],
  filter_parameters: [
    { name: 'corridor', type: 'category' },
    { name: 'from', type: 'date' },
  ],
}

const field = (dataset: ReturnType<typeof datasetFrom>, key: string) =>
  dataset.fields.find((entry) => entry.key === key)

describe('the third role is reconstructed exactly', () => {
  test('the named time dimension becomes a Time Dimension', () => {
    /*
     * D21. The API has two roles and names the temporal Field separately, so
     * this is exact rather than a guess at `type: 'date'` — and every mapping
     * slot that accepts a temporal axis depends on the role being right.
     */
    expect(field(datasetFrom(settlements), 'day')?.role).toBe('time-dimension')
  })

  test('another dimension stays a Dimension', () => {
    expect(field(datasetFrom(settlements), 'corridor')?.role).toBe('dimension')
  })

  test('a Dataset naming none has no Time Dimension', () => {
    const flat = datasetFrom({ ...settlements, time_dimension_field: null })
    expect(flat.fields.every((entry) => entry.role !== 'time-dimension')).toBe(true)
  })
})

describe('aggregations are translated, not passed through', () => {
  test('min and max become minimum and maximum', () => {
    /*
     * D29. An aggregation our reducer does not recognise falls through its
     * switch to a silent zero, so a declared `min` would draw 0 rather than
     * fail — which looks exactly like an empty column.
     */
    const measure = field(datasetFrom(settlements), 'total_amount')
    expect(measure?.role === 'measure' && measure.aggregations).toEqual([
      'sum',
      'minimum',
      'maximum',
    ])
  })

  test('an unrecognised one is dropped rather than offered', () => {
    const odd = datasetFrom({
      ...settlements,
      fields: [{ name: 'x', type: 'number', role: 'measure', aggregations: ['median', 'sum'] }],
    })
    const measure = field(odd, 'x')
    expect(measure?.role === 'measure' && measure.aggregations).toEqual(['sum'])
  })

  test('a Measure is never left with none', () => {
    // An empty list fails every Family's satisfaction check, which would hide
    // the Field from an Author rather than explain it.
    const odd = datasetFrom({
      ...settlements,
      fields: [{ name: 'x', type: 'number', role: 'measure', aggregations: [] }],
    })
    const measure = field(odd, 'x')
    expect(measure?.role === 'measure' && measure.aggregations.length).toBeGreaterThan(0)
  })
})

describe('filterability comes from the parameter list, not the field list', () => {
  test('a Field with a matching Filter Parameter is filterable', () => {
    expect(field(datasetFrom(settlements), 'corridor')?.filterable).toBe(true)
  })

  test('one without is not', () => {
    // D24 — the API keeps two lists and we collapse them, which cannot express
    // a parameter that is not also a returned column. `from` is exactly that.
    expect(field(datasetFrom(settlements), 'day')?.filterable).toBe(false)
  })
})

describe('classification errs upward', () => {
  test('pii becomes the most restrictive level we have', () => {
    // Their own note: it may be raised but never lowered, because data already
    // went out under that label.
    const dataset = datasetFrom({ ...settlements, classification: 'pii' })
    expect(dataset.classification).toBe('restricted')
    expect(dataset.exposesPersonalData).toBe(true)
  })

  test('financial is confidential and asserts no personal data', () => {
    expect(datasetFrom(settlements).classification).toBe('confidential')
    expect(datasetFrom(settlements).exposesPersonalData).toBe(false)
  })

  test('an unknown tag lands on internal rather than on nothing', () => {
    expect(datasetFrom({ ...settlements, classification: 'novel' }).classification).toBe('internal')
  })
})

describe('a Field gets a readable label', () => {
  test('snake case becomes a sentence', () => {
    expect(labelFor('total_amount')).toBe('Total amount')
  })

  test('camel case too', () => {
    expect(labelFor('totalAmount')).toBe('Total amount')
  })

  test('a name with nothing to split is kept', () => {
    expect(labelFor('day')).toBe('Day')
  })
})

describe('withdrawn Datasets leave the Catalogue', () => {
  test('status withdrawn is not published', () => {
    // FR-DP-13.
    expect(isPublished({ ...settlements, status: 'withdrawn' })).toBe(false)
  })

  test('nor is a deleted one', () => {
    expect(isPublished({ ...settlements, deleted: true })).toBe(false)
  })
})

function catalogueWith(replies: (url: string) => Response) {
  const fetchImpl = ((input: RequestInfo | URL) =>
    Promise.resolve(replies(String(input)))) as typeof globalThis.fetch
  const api = createApiClient({
    baseUrl: 'https://api.example.test',
    tokens: fakeTokenProvider(),
    fetch: fetchImpl,
    onDiagnostic: () => {},
  })
  return httpCatalogue(api)
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ status: status === 200, message: 'OK', data }), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('browsing', () => {
  test('summaries come back with the counts an Author judges on', async () => {
    const catalogue = catalogueWith(() => json([settlements]))
    const [summary] = await catalogue.browse(viewer())
    expect(summary).toMatchObject({
      id: 'peniremit.settlements',
      dimensionCount: 1,
      timeDimensionCount: 1,
      measureCount: 1,
    })
  })

  test('a named collection is accepted as well as a bare array', async () => {
    const catalogue = catalogueWith(() => json({ datasets: [settlements] }))
    expect(await catalogue.browse(viewer())).toHaveLength(1)
  })

  test('withdrawn Datasets are not offered', async () => {
    const catalogue = catalogueWith(() =>
      json([settlements, { ...settlements, id: 'gone', status: 'withdrawn' }]),
    )
    expect((await catalogue.browse(viewer())).map((entry) => entry.id)).toEqual([
      'peniremit.settlements',
    ])
  })
})

describe('describing one', () => {
  test('the full Field list comes back', async () => {
    const catalogue = catalogueWith(() => json(settlements))
    expect((await catalogue.describe('peniremit.settlements', viewer()))?.fields).toHaveLength(3)
  })

  test('absent and forbidden are indistinguishable', async () => {
    /*
     * The port's contract, and the API takes the same position — its 404 covers
     * "does not exist, is deleted, or the viewer may not see it". So the
     * Catalogue cannot be used to probe for Datasets a viewer cannot see.
     */
    for (const status of [404, 403]) {
      const catalogue = catalogueWith(() => json(null, status))
      expect(await catalogue.describe('whatever', viewer())).toBeNull()
    }
  })

  test('but a service being down is not "no such Dataset"', async () => {
    // Returning null here would tell an Author their Dataset had been
    // withdrawn, and they would go and ask the publisher about it.
    const catalogue = catalogueWith(() => json(null, 503))
    expect(catalogue.describe('peniremit.settlements', viewer())).rejects.toMatchObject({
      kind: 'unavailable',
    })
  })
})

const viewer = () => ({ id: 'u1', displayName: 'Test' })
