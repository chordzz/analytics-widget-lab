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
  exposes_personal_data: false,
  grain: ['day', 'corridor'],
  fields: [
    { key: 'day', label: 'Day', type: 'date', role: 'dimension', filterable: true, orderable: true },
    { key: 'corridor', label: 'Corridor', type: 'category', role: 'dimension', filterable: true, orderable: false },
    {
      key: 'settlement_amount',
      label: 'Settlement amount',
      type: 'number',
      role: 'measure',
      aggregations: ['sum', 'minimum', 'maximum'],
      filterable: false,
      orderable: true,
    },
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
    const measure = field(datasetFrom(settlements), 'settlement_amount')
    expect(measure?.role === 'measure' && measure.aggregations).toEqual([
      'sum',
      'minimum',
      'maximum',
    ])
  })

  test('an unrecognised one is dropped rather than offered', () => {
    const odd = datasetFrom({
      ...settlements,
      fields: [{ key: 'x', label: 'X', type: 'number', role: 'measure', aggregations: ['median', 'sum'] }],
    })
    const measure = field(odd, 'x')
    expect(measure?.role === 'measure' && measure.aggregations).toEqual(['sum'])
  })

  test('a Measure is never left with none', () => {
    // An empty list fails every Family's satisfaction check, which would hide
    // the Field from an Author rather than explain it.
    const odd = datasetFrom({
      ...settlements,
      fields: [{ key: 'x', label: 'X', type: 'number', role: 'measure', aggregations: [] }],
    })
    const measure = field(odd, 'x')
    expect(measure?.role === 'measure' && measure.aggregations.length).toBeGreaterThan(0)
  })
})

describe('filterability is declared, not inferred', () => {
  /*
   * This used to be derived from whether a Filter Parameter of the same name
   * existed — a guess we were forced into, and D24. Since 15 September a Field
   * states it, and the API's note is emphatic that an omitted value is *an
   * undeclared Field, not a default*.
   */
  test('a Field that declares itself filterable is', () => {
    expect(field(datasetFrom(settlements), 'corridor')?.filterable).toBe(true)
  })

  test('one that declares itself not filterable is not', () => {
    expect(field(datasetFrom(settlements), 'settlement_amount')?.filterable).toBe(false)
  })

  test('an omitted declaration is false, not inferred from anything else', () => {
    // Specifically: not inferred from a matching Filter Parameter. `corridor`
    // has one, and saying nothing about the Field still means nothing.
    const silent = {
      ...settlements,
      fields: settlements.fields.map((entry) =>
        entry.key === 'corridor' ? { ...entry, filterable: undefined } : entry,
      ),
    }
    expect(field(datasetFrom(silent), 'corridor')?.filterable).toBe(false)
  })

  test('orderability is read the same way', () => {
    // `sortable` became `orderable` in the same change, and reading the old name
    // would have silently disabled sorting everywhere rather than failing.
    expect(field(datasetFrom(settlements), 'day')?.sortable).toBe(true)
  })
})

describe('classification errs upward', () => {
  test('pii becomes the most restrictive level we have', () => {
    // Their own note: it may be raised but never lowered, because data already
    // went out under that label.
    const dataset = datasetFrom({ ...settlements, classification: 'pii' })
    expect(dataset.classification).toBe('restricted')
  })

  test('financial is confidential', () => {
    expect(datasetFrom(settlements).classification).toBe('confidential')
  })

  test('an unknown tag lands on internal rather than on nothing', () => {
    expect(datasetFrom({ ...settlements, classification: 'novel' }).classification).toBe('internal')
  })
})

describe('personal data is declared, not read off the classification', () => {
  /*
   * The two were separated on 15 September for a reason worth protecting: a
   * Dataset can be `financial` *and* personal. We used to infer this flag as
   * `classification === 'pii'`, which answered `false` for exactly that case —
   * and since the flag drives an access-recording obligation (FR-DA-14), the
   * inference silently skipped the record.
   */
  test('a financial Dataset can still expose personal data', () => {
    const dataset = datasetFrom({ ...settlements, exposes_personal_data: true })
    expect(dataset.classification).toBe('confidential')
    expect(dataset.exposesPersonalData).toBe(true)
  })

  test('and the declaration beats the classification either way', () => {
    const dataset = datasetFrom({
      ...settlements,
      classification: 'pii',
      exposes_personal_data: false,
    })
    expect(dataset.exposesPersonalData).toBe(false)
  })

  test('an older declaration without the field falls back to the old inference', () => {
    // Absent is not `false`. A declaration written before the field existed is
    // better read the way it was written than treated as an assertion.
    const legacy = { ...settlements, classification: 'pii', exposes_personal_data: undefined }
    expect(datasetFrom(legacy).exposesPersonalData).toBe(true)
  })
})

describe('the row grain comes through', () => {
  test('the Fields that identify one row', () => {
    expect(datasetFrom(settlements).grain).toEqual(['day', 'corridor'])
  })

  test('an empty grain means one summary row, and is not the same as absent', () => {
    /*
     * The distinction the whole field exists for. `[]` says the endpoint answers
     * with a single figure — a stat card over it is correct by construction.
     * Absent says the publisher has not declared one, and nothing can be assumed.
     */
    expect(datasetFrom({ ...settlements, grain: [] }).grain).toEqual([])
    expect(datasetFrom({ ...settlements, grain: undefined }).grain).toBeUndefined()
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
