/**
 * A Peniremit declaration, in the shape the API would return it.
 *
 * The catalogue records what their guide states; this turns that into an
 * `ApiDataset` so the ordinary adapter and composer can evaluate it. Going
 * through `datasetFrom` rather than building a domain `Dataset` directly is the
 * point: the checks then exercise the same translation the live path does, so a
 * card that passes here is a card the running app can bind.
 *
 * Roles follow the guide's own annotations: the leading `date` or `category` is
 * the Dimension, everything else is a Measure. No `semantic` is set, because
 * none is declared — which is exactly why the Composition charts are withheld.
 */

import type { ApiDataset, ApiField } from '../catalogue/api-dataset'
import type { PeniremitDataset } from './peniremit-catalogue'

/** Their permission key, from the guide's AUTH section. */
export const PENIREMIT_PERMISSION = 'holdings.penilabs.peniremit::stats.read'

const measure = (key: string): ApiField => ({
  key,
  label: labelFor(key),
  type: 'number',
  role: 'measure',
  // `sum` where a total is meaningful, `average` otherwise. Percentages and
  // rates are averaged: this is the aggregation list, not a claim that the sum
  // means anything — that is `semantic`, and nothing here declares one.
  aggregations: /percent|rate|ratio|Ratio|Percent/.test(key) ? ['average'] : ['sum', 'average'],
  filterable: false,
  orderable: true,
})

export function toApiDataset(entry: PeniremitDataset): ApiDataset {
  const [first, ...rest] = entry.keys
  const dimensional = entry.shape !== 'aggregate'

  const fields: ApiField[] = dimensional
    ? [
        {
          key: first,
          label: labelFor(first),
          type: entry.shape === 'date' ? 'date' : 'category',
          role: 'dimension',
          filterable: true,
          orderable: entry.shape === 'date',
        },
        ...rest.map(measure),
      ]
    : entry.keys.map(measure)

  return {
    id: entry.id,
    name: entry.name,
    source_system_id: 'peniremit',
    status: 'published',
    exposes_personal_data: false,
    classification: 'confidential',
    required_permission_key: PENIREMIT_PERMISSION,
    // An aggregate endpoint answers with one row, which is an empty grain.
    grain: dimensional ? [first] : [],
    ...(entry.shape === 'date' ? { time_dimension_field: first } : {}),
    fields,
    filter_parameters: [
      { name: 'from', type: 'date', required: true },
      { name: 'to', type: 'date', required: true },
      ...(entry.shape === 'date'
        ? [{ name: 'granularity', type: 'category', allowed_values: ['day', 'month'] }]
        : []),
    ],
  }
}

/** `changePercent` → `Change percent`, `usd` → `USD`. */
function labelFor(key: string): string {
  if (/^(usd|ngn|dau|mau|kyc|fx)$/i.test(key)) return key.toUpperCase()
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}
