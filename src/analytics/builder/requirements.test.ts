/**
 * The builder's domain rules.
 *
 * These are the tests that keep the create flow honest. The picker promising a
 * type it cannot fill, or an automatic mapping that puts a transaction id on an
 * axis, are both failures you only notice by clicking through every combination
 * — which is exactly what a test should be doing instead.
 */

import { describe, expect, test } from 'bun:test'
import {
  autoMap,
  candidatesFor,
  isComplete,
  requiredSlots,
  satisfies,
  slotsFor,
  suggestedTypesFor,
  typesFor,
  unfilledSlots,
} from './requirements'
import type { Dataset } from '../data/types'
import { WIDGET_TYPES } from '../widgets/catalog'
import { datasets, requireDataset } from '../data/datasets'

const builtTypes = WIDGET_TYPES.filter((type) => type.built)

/**
 * Every (dataset, widget type) pairing the builder can actually produce.
 *
 * Driven from the data side, because that is the order the flow goes in: you
 * choose a dataset, and it offers the types it can fill. Sweeping this is what
 * catches a mapping that only breaks for one combination out of two hundred.
 */
const pairings: { dataset: Dataset; typeId: string }[] = datasets.flatMap((dataset) =>
  typesFor(dataset).map((type) => ({ dataset, typeId: type.id })),
)

describe('slot table', () => {
  test('every built widget type declares slots', () => {
    const missing = builtTypes.filter((type) => slotsFor(type.id).length === 0)
    expect(missing.map((type) => type.id)).toEqual([])
  })

  test('unbuilt types are not offered slots', () => {
    expect(slotsFor('choropleth-map')).toEqual([])
  })

  test('slot bounds are coherent', () => {
    for (const type of builtTypes) {
      for (const entry of slotsFor(type.id)) {
        expect(entry.max).toBeGreaterThanOrEqual(Math.max(1, entry.min))
        expect(entry.accepts.length).toBeGreaterThan(0)
        expect(entry.help.length).toBeGreaterThan(0)
      }
    }
  })
})

describe('satisfies', () => {
  test('every built type is reachable from at least one dataset', () => {
    const reachable = new Set(pairings.map((pair) => pair.typeId))
    const orphans = builtTypes.filter((type) => !reachable.has(type.id))
    expect(orphans.map((type) => type.id)).toEqual([])
  })

  test('a type is only offered where every required slot can be filled', () => {
    for (const { dataset, typeId } of pairings) {
      for (const entry of requiredSlots(typeId)) {
        expect(candidatesFor(dataset, entry).length).toBeGreaterThanOrEqual(entry.min)
      }
    }
  })

  test('slots compete for fields rather than counting one twice', () => {
    // signup-funnel has exactly two measures. A bubble chart wants three
    // distinct ones, so it must not be offered.
    const funnel = requireDataset('signup-funnel')
    expect(satisfies('bubble-chart', funnel)).toBe(false)
    expect(satisfies('scatter-plot', funnel)).toBe(true)
  })

  test('a gauge needs two measures, not one used twice', () => {
    expect(satisfies('gauge', requireDataset('revenue-monthly'))).toBe(true)
    // activity-events is all dimensions and a time field.
    expect(satisfies('gauge', requireDataset('activity-events'))).toBe(false)
  })

  test('a point map is only reachable from geo-flagged data', () => {
    // Regional sales has a dimension and three measures, so it satisfies the
    // point map on kinds alone — and would plot revenue as a latitude.
    const withMaps = datasets
      .filter((dataset) => typesFor(dataset).some((type) => type.id === 'point-map'))
      .map((dataset) => dataset.id)
    expect(withMaps).toEqual(['sales-by-country'])
  })

  test('a geo slot offers only geographic fields', () => {
    const place = slotsFor('point-map').find((entry) => entry.id === 'x')!
    const offered = candidatesFor(requireDataset('sales-by-country'), place)
    expect(offered.map((field) => field.key)).toEqual(['code'])
    expect(candidatesFor(requireDataset('sales-by-region'), place)).toEqual([])
  })

  test('every declared fit is actually servable', () => {
    // A hint pointing at data that cannot fill the widget's slots would be
    // silently ignored, which is the sort of thing that rots unnoticed.
    for (const dataset of datasets) {
      for (const typeId of dataset.suits ?? []) {
        expect({ dataset: dataset.id, typeId, ok: satisfies(typeId, dataset) }).toEqual({
          dataset: dataset.id,
          typeId,
          ok: true,
        })
      }
    }
  })

  test('a time-axis type is refused a dataset with no time field', () => {
    expect(satisfies('line-chart', requireDataset('sales-by-region'))).toBe(false)
    expect(satisfies('line-chart', requireDataset('revenue-daily'))).toBe(true)
  })
})

describe('autoMap', () => {
  test('produces a complete mapping for every offered pairing', () => {
    for (const { dataset, typeId } of pairings) {
      const mapping = autoMap(typeId, dataset)
      expect(mapping).not.toBeNull()
      const unfilled = unfilledSlots(typeId, mapping!)
      expect({
        typeId,
        dataset: dataset.id,
        unfilled: unfilled.map((entry) => entry.id),
      }).toEqual({ typeId, dataset: dataset.id, unfilled: [] })
    }
  })

  test('only ever maps fields the dataset actually has', () => {
    for (const { dataset, typeId } of pairings) {
      const keys = new Set(dataset.fields.map((field) => field.key))
      const mapping = autoMap(typeId, dataset)!
      for (const value of Object.values(mapping)) {
        for (const key of Array.isArray(value) ? value : [value]) {
          expect(keys.has(key as string)).toBe(true)
        }
      }
    }
  })

  test('respects the field kinds a slot accepts', () => {
    for (const { dataset, typeId } of pairings) {
      const mapping = autoMap(typeId, dataset)!
      for (const entry of slotsFor(typeId)) {
        const value = mapping[entry.id]
        const keys = Array.isArray(value) ? value : value ? [value] : []
        for (const key of keys) {
          const field = dataset.fields.find((candidate) => candidate.key === key)!
          expect(entry.accepts).toContain(field.kind)
        }
      }
    }
  })

  test('never puts the same field in two slots', () => {
    for (const { dataset, typeId } of pairings) {
      const mapping = autoMap(typeId, dataset)!
      const used = Object.values(mapping).flatMap((value) =>
        Array.isArray(value) ? value : value ? [value] : [],
      )
      expect(used.length).toBe(new Set(used).size)
    }
  })

  test('prefers a real category over an identifier on a grouping axis', () => {
    // `transactions` leads with `id`, which is unique per row. Grouping by it
    // would draw two thousand boxes.
    const mapping = autoMap('box-plot', requireDataset('transactions'))!
    expect(mapping.x).toBe('channel')
    expect(mapping.value).toBe('amount')
  })

  test('never ranks by a coordinate', () => {
    // sales-by-country declares lat and lng before revenue, so first-measure
    // wins would rank countries by how far north they are.
    const ranked = autoMap('ranked-list', requireDataset('sales-by-country'))!
    expect(ranked.value).toBe('revenue')

    const bars = autoMap('bar-chart-vertical', requireDataset('sales-by-country'))!
    expect(bars.series).not.toContain('lat')
    expect(bars.series).not.toContain('lng')
  })

  test('a coordinate slot offers only coordinates', () => {
    const dataset = requireDataset('sales-by-country')
    const lat = slotsFor('point-map').find((entry) => entry.id === 'lat')!
    expect(candidatesFor(dataset, lat).map((field) => field.key)).toEqual(['lat', 'lng'])
  })

  test('puts latitude and longitude in their own slots', () => {
    const mapping = autoMap('point-map', requireDataset('sales-by-country'))!
    expect(mapping.lat).toBe('lat')
    expect(mapping.lng).toBe('lng')
    // The measure slot must not have swallowed a coordinate.
    expect(mapping.value).not.toBe('lat')
    expect(mapping.value).not.toBe('lng')
  })

  test('keeps a unique-per-row label when it is the only sensible axis', () => {
    // Every row of sales-by-region *is* a region; near-uniqueness is correct here.
    const mapping = autoMap('donut-chart', requireDataset('sales-by-region'))!
    expect(mapping.x).toBe('region')
  })

  test('fills a multi-field slot to its minimum', () => {
    const radar = autoMap('radar-chart', requireDataset('product-performance'))!
    expect(radar.series?.length).toBe(3)

    const bubble = autoMap('bubble-chart', requireDataset('product-performance'))!
    expect(bubble.series?.length).toBe(3)
  })

  test('gives a table several columns rather than one', () => {
    const mapping = autoMap('data-table', requireDataset('support-tickets'))!
    expect(mapping.columns!.length).toBeGreaterThan(1)
  })

  test('returns null when the dataset cannot serve the type', () => {
    expect(autoMap('point-map', requireDataset('revenue-daily'))).toBeNull()
  })
})

describe('the widget picker', () => {
  test('offers only what the chosen data can fill', () => {
    for (const dataset of datasets) {
      for (const type of typesFor(dataset)) {
        expect({ dataset: dataset.id, type: type.id, ok: satisfies(type.id, dataset) }).toEqual({
          dataset: dataset.id,
          type: type.id,
          ok: true,
        })
      }
    }
  })

  test('never offers an unbuilt type', () => {
    for (const dataset of datasets) {
      expect(typesFor(dataset).every((type) => type.built)).toBe(true)
    }
  })

  test('every dataset can build something', () => {
    const barren = datasets.filter((dataset) => typesFor(dataset).length === 0)
    expect(barren.map((dataset) => dataset.id)).toEqual([])
  })

  test('suggestions are a subset of what is offered', () => {
    for (const dataset of datasets) {
      const offered = new Set(typesFor(dataset).map((type) => type.id))
      for (const type of suggestedTypesFor(dataset)) {
        expect(offered.has(type.id)).toBe(true)
      }
    }
  })

  test('the data that declares a widget suggests it', () => {
    const suggested = (id: string) =>
      suggestedTypesFor(requireDataset(id)).map((type) => type.id)
    expect(suggested('signup-funnel')).toContain('funnel')
    expect(suggested('project-timeline')).toContain('timeline-chart')
    expect(suggested('traffic-flow')).toContain('sankey')
  })
})

describe('completeness', () => {
  test('a mapping missing a required slot is not placeable', () => {
    expect(isComplete('gauge', { value: 'revenue' })).toBe(false)
    expect(isComplete('gauge', { value: 'revenue', target: 'target' })).toBe(true)
  })

  test('optional slots do not block placement', () => {
    // A pivot table counts rows when no measure is chosen.
    expect(isComplete('pivot-table', { x: 'team', secondary: 'status' })).toBe(true)
  })

  test('a multi-field slot below its minimum is not placeable', () => {
    expect(isComplete('grouped-bar-chart', { x: 'region', series: ['revenue'] })).toBe(false)
    expect(isComplete('grouped-bar-chart', { x: 'region', series: ['revenue', 'orders'] })).toBe(true)
  })

  test('an unknown type is never placeable', () => {
    expect(isComplete('not-a-widget', {})).toBe(false)
  })
})

describe('the unbuilt', () => {
  test('a type with no renderer is never reachable', () => {
    for (const dataset of datasets) {
      expect(typesFor(dataset).map((type) => type.id)).not.toContain('choropleth-map')
    }
  })
})

describe('identifiers versus labels', () => {
  test('a unique label in a short table is the axis', () => {
    // Every row of project-timeline is a task; that is the row label, even
    // though it is unique per row.
    const mapping = autoMap('timeline-chart', requireDataset('project-timeline'))!
    expect(mapping.x).toBe('task')
  })

  test('optional slots are left for the person to fill', () => {
    // A Gantt is valid without a grouping or a progress measure. Guessing at
    // them would put data on the chart nobody asked to see.
    const mapping = autoMap('timeline-chart', requireDataset('project-timeline'))!
    expect(mapping.secondary).toBeUndefined()
    expect(mapping.value).toBeUndefined()
  })

  test('a unique key in a long table is not', () => {
    // `ref` is unique across 120 tickets — a key, not a category.
    const mapping = autoMap('pivot-table', requireDataset('support-tickets'))!
    expect(mapping.x).not.toBe('ref')
  })
})
