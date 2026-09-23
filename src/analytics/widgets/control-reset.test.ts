/**
 * The board re-asserting over a card somebody nudged.
 *
 * A Viewer's override of a parameter wins over the Control — it is the most
 * specific thing anyone has said. That is right while they are looking at one
 * card and wrong the moment they reach for the board's range again: the control
 * they just used would be the one thing on screen that did nothing.
 *
 * So an override is a deviation from the board rather than a replacement for
 * it. These cover which keys that clears and which it must not, and the
 * identity trap underneath it.
 */

import { describe, expect, test } from 'bun:test'
import { governedParameters, rangeSignature, withoutGoverned } from '../data/query'
import { datasetFrom } from '../../catalogue/api-dataset'
import type { QueryContribution } from '../../composition/correspondence'

/** An aggregate: no date column, `from`/`to` and `status` as parameters. */
const summary = datasetFrom({
  id: 'peniremit.transaction-count-summary',
  name: 'Total Transactions',
  source_system_id: 'peniremit',
  fields: [
    { key: 'value', label: 'Value', type: 'number', role: 'measure', aggregations: ['sum'], filterable: false, orderable: true },
  ],
  filter_parameters: [
    { name: 'from', type: 'date', required: true },
    { name: 'to', type: 'date', required: true },
    { name: 'status', type: 'category', allowed_values: ['success', 'failed', 'all'] },
  ],
} as Parameters<typeof datasetFrom>[0])

const ranged = (from: string, to: string): QueryContribution => ({
  timeRange: { field: 'from/to', from, to },
})

describe('which parameters a range governs', () => {
  test('the ones the publisher declared for it', () => {
    expect(governedParameters(summary, ranged('2026-09-01', '2026-09-30')).sort()).toEqual(['from', 'to'])
  })

  test('and nothing else the Widget may have been filtered to', () => {
    /*
     * The important half. `status: failed` is what that Widget *is*; a date
     * range has nothing to say about it, and clearing it would throw away a
     * choice nobody overruled.
     */
    expect(governedParameters(summary, ranged('2026-09-01', '2026-09-30'))).not.toContain('status')
  })

  test('a contribution with no range governs nothing', () => {
    expect(governedParameters(summary, {})).toEqual([])
    expect(governedParameters(summary, undefined)).toEqual([])
  })

  test('a Dataset that declares no range parameters is governed in name only', () => {
    // Nothing to send, so nothing to clear — the Control reaches it and the
    // endpoint answers with its full default.
    const noParameters = datasetFrom({
      ...({ id: 'x', name: 'X', source_system_id: 's', fields: summary.fields.map((f) => ({
        key: f.key, label: f.label, type: 'number', role: 'measure', aggregations: ['sum'],
        filterable: false, orderable: true })), filter_parameters: [] } as never),
    })
    expect(governedParameters(noParameters, ranged('2026-09-01', '2026-09-30'))).toEqual([])
  })
})

describe('telling a moved range from a re-render', () => {
  test('the same range is the same signature, whatever the object', () => {
    /*
     * The trap this exists for. `contribution` is rebuilt every render, so
     * comparing identity would clear the Viewer's override continuously — the
     * same bug as never clearing it, and considerably harder to see.
     */
    expect(rangeSignature(ranged('2026-09-01', '2026-09-30'))).toBe(
      rangeSignature(ranged('2026-09-01', '2026-09-30')),
    )
  })

  test('a moved range is a different one', () => {
    expect(rangeSignature(ranged('2026-09-01', '2026-09-30'))).not.toBe(
      rangeSignature(ranged('2026-08-01', '2026-08-31')),
    )
  })

  test('moving one end is enough', () => {
    expect(rangeSignature(ranged('2026-09-01', '2026-09-30'))).not.toBe(
      rangeSignature(ranged('2026-09-01', '2026-10-31')),
    )
  })

  test('no range at all is null, and stays null', () => {
    // So a board without a Control never clears anything.
    expect(rangeSignature({})).toBeNull()
    expect(rangeSignature(undefined)).toBeNull()
  })
})

describe('what a clear actually drops', () => {
  const choices = { filters: { from: '2026-07-01', status: 'failed' }, sort: undefined }

  test('the governed keys go', () => {
    expect(withoutGoverned(choices, ['from', 'to']).filters).toEqual({ status: 'failed' })
  })

  test('everything else stays', () => {
    // `status` survives a date range moving, because no date range overruled it.
    expect(withoutGoverned(choices, ['from', 'to']).filters?.status).toBe('failed')
  })

  test('clearing the last one removes the key rather than leaving `{}`', () => {
    // An empty filter object and no filters are the same thing said two ways,
    // and only one of them stays the same shape as a Widget nobody touched.
    const only = { filters: { from: '2026-07-01' } }
    expect(withoutGoverned(only, ['from', 'to']).filters).toBeUndefined()
  })

  test('nothing to drop returns the same object, not a copy', () => {
    /*
     * Identity, deliberately. This runs from an effect on every range change,
     * and a fresh object each time would re-render every card on a board for a
     * clear that cleared nothing.
     */
    const untouched = { filters: { status: 'failed' } }
    expect(withoutGoverned(untouched, ['from', 'to'])).toBe(untouched)
    expect(withoutGoverned(choices, [])).toBe(choices)
    expect(withoutGoverned({}, ['from'])).toEqual({})
  })
})
