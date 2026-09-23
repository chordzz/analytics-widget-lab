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
import { datasets, requireDataset } from '../data/datasets'
import { datasetFrom, type ApiDataset } from '../../catalogue/api-dataset'
import { UNMAPPED_TYPE_IDS } from '../../dashboard/api-taxonomy'
import { FAMILIES, WIDGET_TYPES } from '../widgets/catalog'
import { satisfies } from '../../visualization/data-shape'
import { visualizationFamilies } from '../../visualization/families'

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
     * The distinction worth protecting: a Dataset that genuinely holds
     * coordinates and has not said so looks identical to one that does not, and
     * "your data is the wrong shape" would be a guess stated as a fact.
     *
     * This asserted the phrase "cannot express yet", which was true of the API
     * until `semantic` landed on 17 September and then pinned a sentence
     * blaming the contract for a gap that had moved to the declaration. The
     * `kind` is the property worth holding; the wording is not.
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
    // Says what is missing and who can supply it, rather than that it is
    // impossible — which it no longer is.
    expect(reason?.because).toContain('latitude and a longitude')
    expect(reason?.because).toContain('publisher')
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

describe('every family survives, even when none of it can be built', () => {
  /*
   * The case the locked cards exist for. Measured against a real declaration it
   * is not an edge case: `peniremit.profit` offers 20 of 37 types and three
   * whole families disappear — Composition, Ranking & Flow and Geospatial. An
   * Author who came to build a pie chart finds no pie chart and no explanation,
   * and cannot tell "this product has none" from "not with this data".
   */
  const profit = datasetFrom(
    apiDataset([
      { key: 'date', label: 'Date', type: 'date', role: 'dimension', filterable: true, orderable: true },
      { key: 'usd', label: 'USD', type: 'number', role: 'measure', aggregations: ['sum'], filterable: false, orderable: true },
      { key: 'ngn', label: 'NGN', type: 'number', role: 'measure', aggregations: ['sum'], filterable: false, orderable: true },
    ]),
  )

  test('a family with nothing available still has something to render', () => {
    const offered = new Set(typesFor(profit).map((type) => type.id))
    const locked = unavailableTypesFor(profit)

    const emptied = FAMILIES.filter(
      (family) =>
        WIDGET_TYPES.some((type) => type.built && type.family === family.id) &&
        !WIDGET_TYPES.some((type) => type.built && type.family === family.id && offered.has(type.id)),
    )

    expect(emptied.length).toBeGreaterThan(0)
    for (const family of emptied) {
      expect(locked.some((entry) => entry.type.family === family.id)).toBe(true)
    }
  })

  test('between them, the two lists account for every built type', () => {
    // The property that makes "shown rather than hidden" true rather than
    // approximately true: nothing may fall out of both lists.
    const offered = typesFor(profit).map((type) => type.id)
    const locked = unavailableTypesFor(profit).map((entry) => entry.type.id)
    const built = WIDGET_TYPES.filter((type) => type.built).map((type) => type.id)

    expect(new Set([...offered, ...locked]).size).toBe(built.length)
  })

  test('no type is in both lists', () => {
    const offered = new Set(typesFor(profit).map((type) => type.id))
    expect(unavailableTypesFor(profit).every((entry) => !offered.has(entry.type.id))).toBe(true)
  })

  test('every locked type carries a reason a person could act on', () => {
    for (const entry of unavailableTypesFor(profit)) {
      expect(entry.reason.because.length).toBeGreaterThan(10)
      // Named, not generic: "needs a time dimension" tells an Author what to
      // look for in another source; "unavailable" tells them nothing.
      expect(entry.reason.because.toLowerCase()).not.toBe('unavailable')
    }
  })
})

/*
 * Record volume, which is not a slot and so had no home in the loop above.
 *
 * `needs.manyRows` sat in the catalogue read by nothing. That was defensible
 * while record volume was a descriptor we had proposed and no API carried —
 * there was nothing to enforce it against. `record_volume` landed on
 * 18 September and the omission became a contradiction: Distribution withheld
 * at Family level, and a histogram offered at Type level on the same Dataset.
 *
 * Found by declaring the control case — a Dataset that answers with one summary
 * row — and noticing we offered it a histogram.
 */
describe('too few records to distribute', () => {
  const volumed = (recordVolume?: 'few' | 'many') => ({
    ...datasetFrom(
      apiDataset([
        { key: 'day', label: 'Day', type: 'date', role: 'dimension' },
        { key: 'channel', label: 'Channel', type: 'category', role: 'dimension' },
        { key: 'amount', label: 'Amount', type: 'number', role: 'measure', aggregations: ['sum'] },
      ]),
    ),
    ...(recordVolume === undefined ? {} : { recordVolume }),
  })

  test('a single-row Dataset is offered no histogram', () => {
    expect(typesFor(volumed('few')).some((type) => type.id === 'histogram')).toBe(false)
  })

  test('and is told the shape is wrong, which is the publisher having said so', () => {
    expect(reasonFor(volumed('few'), 'histogram')).toMatchObject({ kind: 'shape' })
  })

  test('an undeclared volume withholds too, but as a declaration gap', () => {
    /*
     * Different answers, and only one is anyone's to act on. Undeclared means
     * nobody has said how many rows; `few` means they said, and a distribution
     * over tens of rows is genuinely the wrong shape.
     */
    expect(typesFor(volumed()).some((type) => type.id === 'histogram')).toBe(false)
    expect(reasonFor(volumed(), 'histogram')).toMatchObject({ kind: 'undeclared' })
  })

  test('declaring many rows offers the whole Family', () => {
    const many = typesFor(volumed('many')).map((type) => type.id)
    expect(many).toContain('histogram')
    expect(many).toContain('box-plot')
  })

  test('the Type picker and the Family agree', () => {
    /*
     * The actual defect. These are two evaluations of one question, and they
     * disagreed: `satisfies` for the Family said no, `typesFor` said yes.
     */
    for (const volume of [undefined, 'few', 'many'] as const) {
      const dataset = volumed(volume)
      const distribution = visualizationFamilies.find((f) => f.id === 'distribution')!
      const family = satisfies(dataset, distribution.dataShape).status === 'satisfied'
      const picker = typesFor(dataset).some((type) => type.id === 'histogram')
      expect({ volume, family, picker }).toEqual({ volume, family: picker, picker })
    }
  })
})

/*
 * The picker and the Family answer the same question and used to disagree.
 *
 * `Widget.visualization_type` is documented as "must belong to a Family the
 * bound Dataset's Data Shape satisfies — checked on save", so an offer the
 * Family refuses is work an Author can do and cannot keep: choose the chart,
 * map the fields, watch it draw, have the save rejected. Across the fixtures
 * that was 54 of 349 offers before this was closed.
 */
describe('the picker never offers what the API would refuse', () => {
  const familyOf = new Map(WIDGET_TYPES.map((type) => [type.id, type.family]))

  test('every offered Type belongs to a satisfied Family, for every fixture', () => {
    const contradictions: string[] = []
    for (const summary of datasets) {
      const dataset = requireDataset(summary.id)
      const satisfied = new Set(
        visualizationFamilies
          .filter((family) => satisfies(dataset, family.dataShape).status === 'satisfied')
          .map((family) => family.id),
      )
      for (const type of typesFor(dataset)) {
        if (!satisfied.has(familyOf.get(type.id) ?? '')) {
          contradictions.push(`${summary.id}/${type.id}`)
        }
      }
    }
    expect(contradictions).toEqual([])
  })

  test('a Composition Type is withheld where no Measure is additive', () => {
    /*
     * The case that motivated this. A donut's slots are one Dimension and one
     * Measure, which nearly every Dataset has — so slots alone offered a donut
     * over a Dataset declaring nothing additive, and summing percentages is the
     * canonical meaningless total.
     */
    const plain = datasetFrom(
      apiDataset([
        { key: 'token', label: 'Token', type: 'category', role: 'dimension' },
        { key: 'share', label: 'Share', type: 'number', role: 'measure', aggregations: ['average'] },
      ]),
    )
    expect(typesFor(plain).some((type) => type.id === 'donut-chart')).toBe(false)
    expect(reasonFor(plain, 'donut-chart')).toMatchObject({ kind: 'undeclared' })
  })

  test('and offered once one is', () => {
    const declared = datasetFrom(
      apiDataset([
        { key: 'token', label: 'Token', type: 'category', role: 'dimension' },
        { key: 'usd', label: 'USD', type: 'number', role: 'measure', semantic: 'additive-total', aggregations: ['sum'] },
      ]),
    )
    expect(typesFor(declared).some((type) => type.id === 'donut-chart')).toBe(true)
  })

  test('the absence says who can fix it', () => {
    // `undeclared` and `shape` are different situations. One is the publisher's
    // to act on today; the other is arithmetic nobody can declare away.
    const noMeasure = datasetFrom(
      apiDataset([{ key: 'token', label: 'Token', type: 'category', role: 'dimension' }]),
    )
    expect(reasonFor(noMeasure, 'scatter-plot')).toMatchObject({ kind: 'shape' })
  })
})
