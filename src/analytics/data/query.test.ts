/**
 * Aggregation happens in the query, and the numbers did not move.
 *
 * Merge Plan Stage 4. Two claims, and the second is the one that makes the
 * refactor safe to believe:
 *
 *   1. no widget reduces raw records any more — the roll-up is asked for
 *   2. every figure a Viewer saw before, they see now
 *
 * The second is easy to lose. Moving a `reduce` behind a query and changing what
 * it computes at the same time produces a board that is differently wrong and
 * passes any test that only checks the mechanism.
 */

import { describe, expect, test } from 'bun:test'
import { aggregationFor, queryFor, rowsForWidget } from './query'
import { requireDataset, rowsFor } from './datasets'
import { SAMPLES } from '../widgets/samples'
import type { WidgetSpec } from '../widgets/Widget'

const specFor = (typeId: string): WidgetSpec => ({ id: 'test', typeId, ...SAMPLES[typeId] })

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0)
const column = (datasetId: string, key: string) =>
  rowsFor(datasetId).map((row) => Number(row[key] ?? 0))

describe('the roll-up comes from the publisher, not the widget', () => {
  test('a quantity totals', () => {
    expect(aggregationFor(requireDataset('revenue-monthly'), 'revenue')).toBe('sum')
  })

  test('a rate averages', () => {
    /*
     * The rule the view used to apply by sniffing `format`. It now comes from
     * the Measure's declared aggregations, which is where FR-DP-04 puts it.
     * Adding uptime across services gives 890%, which is not a number that
     * exists.
     */
    expect(aggregationFor(requireDataset('service-health'), 'uptime')).toBe('average')
  })

  test('an Author may choose another aggregation the publisher declared', () => {
    expect(aggregationFor(requireDataset('revenue-monthly'), 'revenue', 'average')).toBe('average')
  })

  test('an Author may not invent one the publisher did not declare', () => {
    // Honouring this would let a board total a percentage. The declaration is a
    // constraint on the Author, not a suggestion.
    expect(aggregationFor(requireDataset('service-health'), 'uptime', 'sum')).toBe('average')
  })

  test('a Dimension asked to roll up does not pretend it can', () => {
    expect(aggregationFor(requireDataset('sales-by-region'), 'region')).toBe('sum')
  })
})

describe('a stat card receives one row, already aggregated', () => {
  const spec = specFor('stat-card')
  const dataset = requireDataset(spec.datasetId)

  test('the query asks for the aggregate rather than the records', () => {
    expect(queryFor(spec, dataset)).toEqual({
      measures: [{ field: 'revenue', aggregation: 'sum' }],
    })
  })

  test('exactly one row comes back', () => {
    // 24 months in, one figure out. Before this stage all 24 were shipped to the
    // browser and reduced there, which FR-DA-12 cannot allow once a Viewer's
    // entitlement is in play.
    expect(rowsForWidget(spec, dataset)).toHaveLength(1)
    expect(rowsFor(dataset.id).length).toBeGreaterThan(1)
  })

  test('and it is the same figure the view used to compute', () => {
    const before = sum(column('revenue-monthly', 'revenue'))
    const after = Number(rowsForWidget(spec, dataset)[0].revenue)

    expect(after).toBe(before)
  })
})

describe('a series is ordered by its Time Dimension, not by luck', () => {
  test('a sparkline card asks for the order it depends on', () => {
    const spec = specFor('sparkline-card')
    expect(queryFor(spec, requireDataset(spec.datasetId))).toEqual({
      sort: [{ field: 'date', direction: 'ascending' }],
    })
  })

  test('a delta card compares the last two records of that order', () => {
    /*
     * A delta is latest-versus-previous, which is only meaningful if "latest"
     * means something. Taking the tail of an unordered response shows an
     * arbitrary month as current and is wrong without looking wrong.
     */
    const spec = specFor('delta-card')
    const rows = rowsForWidget(spec, requireDataset(spec.datasetId))
    const months = rows.map((row) => String(row.month))

    expect(months).toEqual([...months].sort())
  })

  test('a gauge reads the most recent record', () => {
    const spec = specFor('gauge')
    const dataset = requireDataset(spec.datasetId)
    const rows = rowsForWidget(spec, dataset)
    const raw = rowsFor(dataset.id)

    expect(rows[rows.length - 1]).toEqual(raw[raw.length - 1])
  })
})

describe('a query never quietly changes what a chart draws', () => {
  test('a categorical chart keeps one mark per record', () => {
    /*
     * The failure this catches: asking for a roll-up where none was wanted.
     * `sales-by-region` is already one row per region, so a bar chart wants all
     * six rows — an aggregate would collapse them into a single bar.
     */
    const spec = specFor('bar-chart-vertical')
    const dataset = requireDataset(spec.datasetId)

    expect(queryFor(spec, dataset)).toEqual({})
    expect(rowsForWidget(spec, dataset)).toHaveLength(rowsFor(dataset.id).length)
  })

  test('every built type returns rows or an honest empty, never a throw', () => {
    for (const typeId of Object.keys(SAMPLES)) {
      const spec = specFor(typeId)
      const dataset = requireDataset(spec.datasetId)
      expect(Array.isArray(rowsForWidget(spec, dataset))).toBe(true)
    }
  })

  test('no type loses all its rows to its own query', () => {
    // A query that returns nothing renders as `empty`, which would read as "no
    // data" for a Dataset that has plenty.
    const starved = Object.keys(SAMPLES).filter((typeId) => {
      const spec = specFor(typeId)
      return rowsForWidget(spec, requireDataset(spec.datasetId)).length === 0
    })

    expect(starved).toEqual([])
  })
})

describe('the Status threshold route asks for one aggregate', () => {
  const health = requireDataset('service-health')
  const spec = (typeId: string, value: string): WidgetSpec => ({
    id: typeId,
    typeId,
    datasetId: 'service-health',
    mapping: { value },
  })

  test('it groups by nothing, so one row comes back', () => {
    /*
     * The bug this pins. With no case in `queryFor` the query was `{}`, every
     * raw record came back, and the widget's `rows[0]` took whichever service
     * happened to be first — reporting Payments API at 99.98% while FX rates sat
     * at 94.12%. A Status widget's whole job is to be trusted when it says
     * healthy, so an arbitrary row is the worst possible answer here.
     */
    const rows = rowsForWidget(spec('threshold-indicator', 'uptime'), health)

    expect(rows).toHaveLength(1)
    expect(rowsFor('service-health').length).toBeGreaterThan(1)
  })

  test('and it averages rather than sums', () => {
    // Nine services summed gives 898% uptime, which is not a number that
    // exists. The Measure declares which aggregations are meaningful; this is
    // that declaration being honoured rather than a rule repeated here.
    const query = queryFor(spec('threshold-indicator', 'uptime'), health)
    expect(query.measures).toEqual([{ field: 'uptime', aggregation: 'average' }])
  })

  test('the figure is the mean of the column', () => {
    const raw = rowsFor('service-health').map((row) => Number(row.uptime))
    const mean = raw.reduce((total, value) => total + value, 0) / raw.length
    const rows = rowsForWidget(spec('threshold-indicator', 'uptime'), health)

    expect(Number(rows[0].uptime)).toBeCloseTo(mean, 10)
  })

  test('a banner asks the same way', () => {
    // Same Data Shape, different presentation. If only one of the two had a
    // query case, the pair would disagree about the same dataset.
    expect(queryFor(spec('alert-banner', 'errorRate'), health).measures).toEqual([
      { field: 'errorRate', aggregation: 'average' },
    ])
  })

  test('an unmapped Measure asks for nothing rather than everything', () => {
    // A half-configured widget must not fall back to fetching the whole table.
    expect(queryFor(spec('threshold-indicator', ''), health).measures).toBeUndefined()
  })
})
