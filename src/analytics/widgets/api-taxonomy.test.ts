/**
 * Our manifest against the API's, once the API is the one being asked.
 *
 * BE-5 exists because a local copy is how the two taxonomies came apart: ours
 * said `line-chart` where theirs said `line`, sixteen ids diverged, and nothing
 * noticed until a save was refused. `GET /v1/visualizations` is the authority
 * now, and these are the properties that make adopting it safe — an endpoint
 * that declines must not be able to lock the product.
 */

import { describe, expect, test } from 'bun:test'
import { httpCatalogue } from '../../catalogue/http-catalogue'
import { createApiClient } from '../../api/client'
import { fakeTokenProvider } from '../../auth/fake-provider'
import { unavailableTypesFor, typesFor } from '../builder/requirements'
import { requireDataset } from '../data/datasets'
import { WIDGET_TYPES } from './catalog'

const regions = requireDataset('sales-by-region')

const catalogueReplying = (body: unknown, status = 200) => {
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(JSON.stringify({ status: status < 400, message: 'OK', data: body }), {
        status,
        headers: { 'content-type': 'application/json' },
      }),
    )) as unknown as typeof globalThis.fetch

  return httpCatalogue(
    createApiClient({
      baseUrl: 'https://api.example.test',
      tokens: fakeTokenProvider(),
      fetch: fetchImpl,
      onDiagnostic: () => {},
    }),
  )
}

describe('the taxonomy is read, not kept', () => {
  test('the Types come back flattened across Families', async () => {
    const entries = await catalogueReplying([
      { family: 'trend', types: ['line-chart', 'area-chart'], requirement: 'a Measure and a Time Dimension' },
      { family: 'single-value', types: ['stat-card'], single_value: true },
    ]).visualizations()

    expect(entries.flatMap((entry) => entry.types)).toEqual([
      'line-chart',
      'area-chart',
      'stat-card',
    ])
  })

  test('`single_value` survives, since it steers an Author to an aggregate Dataset', async () => {
    const entries = await catalogueReplying([
      { family: 'single-value', types: ['stat-card'], single_value: true },
    ]).visualizations()
    expect(entries[0].singleValue).toBe(true)
  })

  test('an endpoint that refuses returns nothing rather than throwing', async () => {
    /*
     * `403` is the likely refusal: it needs `dataset.read`, which someone who
     * can compose might not hold. A throw here would take the composer down
     * over a list it can manage without.
     */
    expect(await catalogueReplying({ }, 403).visualizations()).toEqual([])
  })
})

describe('an absent answer falls back rather than locking the product', () => {
  const built = WIDGET_TYPES.filter((type) => type.built).length

  test('with no taxonomy, the local list decides', () => {
    // What shipped before BE-5. Still correct, and still the floor.
    const locked = unavailableTypesFor(regions, null)
    expect(typesFor(regions).length + locked.length).toBe(built)
  })

  test('with a taxonomy, it decides instead', () => {
    /*
     * The point of adopting it. A Type our local list believes is fine but the
     * API has never heard of is locked on the API's word, without anyone
     * editing a constant.
     */
    const accepted = new Set(WIDGET_TYPES.map((type) => type.id).filter((id) => id !== 'bar-chart-vertical'))
    const locked = unavailableTypesFor(regions, accepted)
    expect(locked.some((entry) => entry.type.id === 'bar-chart-vertical')).toBe(true)
  })

  test('an empty set is not a taxonomy, and must not lock everything', () => {
    /*
     * The failure worth engineering against. An endpoint answering `[]` — or a
     * viewer without `dataset.read` — would otherwise mark all 37 built types
     * unavailable and leave an Author staring at a catalogue of locked cards
     * with no way to tell it from a real answer.
     */
    const locked = unavailableTypesFor(regions, null)
    expect(locked.length).toBeLessThan(built)
  })
})
