/**
 * Why a widget type is not on offer.
 *
 * The composer's rule has been that an unbuildable widget is simply absent.
 * That is right when the absence is obvious and wrong when it is not: two
 * thirds of the catalogue can be missing for a reason nobody can see, and an
 * Author who came to build a funnel is left wondering whether the product has
 * one.
 *
 * The three kinds are the substance, because they call for different actions —
 * one is ours to fix with the Analytics team, one is the publisher's, and one is
 * nobody's.
 */

import { describe, expect, test } from 'bun:test'
import { typesFor, unavailableTypesFor } from './requirements'
import { requireDataset } from '../data/datasets'
import { datasetFrom, type ApiDataset } from '../../catalogue/api-dataset'
import { UNMAPPED_TYPE_IDS } from '../../dashboard/api-taxonomy'
import { WIDGET_TYPES } from '../widgets/catalog'

const regions = requireDataset('sales-by-region')

const apiDataset = (fields: ApiDataset['fields']): ApiDataset => ({
  id: 'peniremit.settlements',
  name: 'Settlements',
  source_system_id: 'peniremit',
  time_dimension_field: 'day',
  classification: 'internal',
  fields,
})

const reasonFor = (dataset: Parameters<typeof unavailableTypesFor>[0], typeId: string) =>
  unavailableTypesFor(dataset).find((entry) => entry.type.id === typeId)?.reason

describe('every built type is either offered or explained', () => {
  test('the two lists together are the whole catalogue', () => {
    // The property that makes this worth having. A type in neither list is one
    // that vanished with no account of itself, which is what this replaces.
    const offered = typesFor(regions).map((type) => type.id)
    const explained = unavailableTypesFor(regions).map((entry) => entry.type.id)
    const built = WIDGET_TYPES.filter((type) => type.built).map((type) => type.id)

    expect([...offered, ...explained].sort()).toEqual([...built].sort())
  })

  test('and nothing appears in both', () => {
    const offered = new Set(typesFor(regions).map((type) => type.id))
    for (const entry of unavailableTypesFor(regions)) {
      // Except the ones the API refuses, which are unavailable *despite* fitting
      // the data — that is the point of separating the reasons.
      if (entry.reason.kind === 'not-accepted') continue
      expect(offered.has(entry.type.id)).toBe(false)
    }
  })
})

describe('the backend will not accept it', () => {
  test('every unmapped type is listed whatever the data', () => {
    const listed = unavailableTypesFor(regions)
      .filter((entry) => entry.reason.kind === 'not-accepted')
      .map((entry) => entry.type.id)
      .sort()
    expect(listed).toEqual([...UNMAPPED_TYPE_IDS].sort())
  })

  test('the reason blames the API, not the data', () => {
    /*
     * Built, working, and a fit for the Dataset. Telling an Author their data is
     * unsuitable would send them to change the wrong thing.
     *
     * `status-list` is the last of these. It was one of three until 15
     * September, when the backend adopted §4.2 and the Chronological Family
     * came with it — `activity-feed` and `event-log-view` are accepted now, and
     * this test moved to the one Type that is still ours alone (D7).
     */
    const reason = reasonFor(regions, 'status-list')
    expect(reason?.kind).toBe('not-accepted')
    expect(reason?.because).toContain('Analytics API')
    expect(reason?.because.toLowerCase()).not.toContain('this data')
  })

  test('they come first, because they are the most actionable', () => {
    expect(unavailableTypesFor(regions)[0].reason.kind).toBe('not-accepted')
  })
})

describe('the publisher has not said enough', () => {
  test('a geographic type is undeclared rather than unsuitable', () => {
    /*
     * The distinction worth protecting. Nothing in the deployed API can say a
     * Measure is a latitude, so a Dataset that genuinely holds coordinates looks
     * identical to one that does not. "Your data is the wrong shape" would be a
     * guess stated as a fact.
     */
    const dataset = datasetFrom(
      apiDataset([
        { key: 'day', label: 'Day', type: 'date', role: 'dimension' },
        { key: 'region', label: 'Region', type: 'location', role: 'dimension' },
        { key: 'lat', label: 'Lat', type: 'number', role: 'measure', aggregations: ['average'] },
        { key: 'lon', label: 'Lon', type: 'number', role: 'measure', aggregations: ['average'] },
      ]),
    )

    const reason = reasonFor(dataset, 'point-map')
    expect(reason?.kind).toBe('undeclared')
    expect(reason?.because).toContain('cannot express yet')
  })

  test('it names what the slot wants, not just the first thing missing', () => {
    /*
     * A location-typed Dimension already satisfies the place slot, so what is
     * left is the coordinate pair. An Author told only "needs a place" would go
     * and fix something that still would not finish.
     */
    const dataset = datasetFrom(
      apiDataset([
        { key: 'region', label: 'Region', type: 'location', role: 'dimension' },
        { key: 'lat', label: 'Lat', type: 'number', role: 'measure', aggregations: ['average'] },
        { key: 'lon', label: 'Lon', type: 'number', role: 'measure', aggregations: ['average'] },
      ]),
    )
    expect(reasonFor(dataset, 'point-map')?.because).toContain('latitude and a longitude')
  })
})

describe('a location-typed Dimension names a place', () => {
  test('the API can say it, so we read it', () => {
    /*
     * D2, and conformance rather than inference. §4.2 asks Geospatial for "a
     * location-typed Dimension" and `FieldType` has exactly that, so reading one
     * as our `semantic` is a translation.
     */
    const dataset = datasetFrom(
      apiDataset([
        { key: 'country', label: 'Country', type: 'location', role: 'dimension' },
        { key: 'amount', label: 'Amount', type: 'number', role: 'measure', aggregations: ['sum'] },
      ]),
    )
    expect(dataset.fields.find((field) => field.key === 'country')?.semantic).toBe(
      'geographic-area',
    )
  })

  test('a location-typed Measure is left undecided', () => {
    // The coordinate half. A point map needs two Measures that know which is
    // latitude, and `type: 'location'` on a number cannot say — marking it would
    // be the failure the semantic exists to prevent.
    const dataset = datasetFrom(
      apiDataset([
        { key: 'day', label: 'Day', type: 'date', role: 'dimension' },
        { key: 'lat', label: 'Lat', type: 'location', role: 'measure', aggregations: ['average'] },
      ]),
    )
    expect(dataset.fields.find((field) => field.key === 'lat')?.semantic).toBeUndefined()
  })
})

describe('the data is simply the wrong shape', () => {
  test('a shortfall names what is missing and how much there is', () => {
    const dataset = datasetFrom(
      apiDataset([
        { key: 'day', label: 'Day', type: 'date', role: 'dimension' },
        { key: 'amount', label: 'Amount', type: 'number', role: 'measure', aggregations: ['sum'] },
      ]),
    )
    const reason = reasonFor(dataset, 'scatter-plot')
    expect(reason?.kind).toBe('shape')
    expect(reason?.because).toMatch(/Needs .*measure/i)
  })

  test('"none" reads better than "only 0"', () => {
    const dataset = datasetFrom(
      apiDataset([{ key: 'region', label: 'Region', type: 'category', role: 'dimension' }]),
    )
    const reason = reasonFor(dataset, 'stat-card')
    expect(reason?.because).toContain('none')
    expect(reason?.because).not.toContain('only 0')
  })

  test('shape reasons come last', () => {
    const kinds = unavailableTypesFor(regions).map((entry) => entry.reason.kind)
    expect(kinds[kinds.length - 1]).toBe('shape')
  })
})

describe('a well-declared Dataset has little to explain', () => {
  test('the fixtures leave only the three the API refuses', () => {
    /*
     * The fixtures declare the semantics the contract asks for, so their
     * unavailable list is mostly the API's doing rather than theirs. A Dataset
     * that suits almost everything is what a good declaration looks like.
     */
    const sales = unavailableTypesFor(requireDataset('sales-by-country'))
    const undeclared = sales.filter((entry) => entry.reason.kind === 'undeclared')
    expect(undeclared).toEqual([])
  })
})
