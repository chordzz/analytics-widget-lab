/**
 * A new Widget inheriting the period the board is showing.
 *
 * Without it an Author has to type a date range by hand before the Widget can
 * be committed at all — every Peniremit Dataset requires `from` and `to` — and
 * the one they type is then a second opinion about what the board is showing.
 */

import { describe, expect, test } from 'bun:test'
import { inheritPeriod } from './WidgetComposer'
import { datasetFrom } from '../../catalogue/api-dataset'

const withParameters = (parameters: { name: string; type: string }[]) =>
  datasetFrom({
    id: 'd', name: 'D', source_system_id: 's',
    fields: [{ key: 'value', label: 'Value', type: 'number', role: 'measure', aggregations: ['sum'], filterable: false, orderable: true }],
    filter_parameters: parameters,
  } as Parameters<typeof datasetFrom>[0])

const fromTo = withParameters([{ name: 'from', type: 'date' }, { name: 'to', type: 'date' }])
const period = { from: '2026-03-01', to: '2026-10-01' }

describe('what gets inherited', () => {
  test('the board period, under the names this Dataset declares', () => {
    expect(inheritPeriod({}, fromTo, period, false)).toEqual({ from: '2026-03-01', to: '2026-10-01' })
  })

  test('a publisher spelling the range differently gets their own names', () => {
    /*
     * BE-8. Writing `from`/`to` blindly is how a parameter the endpoint never
     * advertised produces a 400 on the Widget's first load — the query endpoint
     * refuses anything a Dataset did not declare.
     */
    const declared = datasetFrom({
      id: 'd', name: 'D', source_system_id: 's',
      fields: [{ key: 'day', label: 'Day', type: 'date', role: 'dimension', filterable: true, orderable: true }],
      filter_parameters: [{ name: 'start_date', type: 'date' }, { name: 'end_date', type: 'date' }],
      time_dimension_field: 'day',
      time_range: { field: 'day', from_parameter: 'start_date', to_parameter: 'end_date' },
    } as Parameters<typeof datasetFrom>[0])
    expect(inheritPeriod({}, declared, period, false)).toEqual({
      start_date: '2026-03-01', end_date: '2026-10-01',
    })
  })

  test('a Dataset that takes no range inherits nothing', () => {
    const none = withParameters([])
    expect(inheritPeriod({}, none, period, false)).toEqual({})
  })

  test('one end is still worth having', () => {
    // Half a window is more than the Author had.
    expect(inheritPeriod({}, fromTo, { from: '2026-03-01' }, false)).toEqual({ from: '2026-03-01' })
  })
})

describe('what it must not touch', () => {
  test('a value the Author already set', () => {
    // A board's Control is a default, not an instruction.
    const typed = { from: '2026-01-01' }
    expect(inheritPeriod(typed, fromTo, period, false)).toEqual({
      from: '2026-01-01', to: '2026-10-01',
    })
  })

  test('an existing Widget being edited', () => {
    /*
     * The one that would be hardest to notice: re-seeding on edit rewrites a
     * period somebody chose on purpose, the moment they reopen the composer to
     * change a title.
     */
    const existing = { from: '2026-01-01', to: '2026-02-01' }
    expect(inheritPeriod(existing, fromTo, period, true)).toBe(existing)
  })

  test('anything, on a board with no Control', () => {
    const bindings = { status: 'failed' }
    expect(inheritPeriod(bindings, fromTo, undefined, false)).toBe(bindings)
  })

  test('bindings that are not the range', () => {
    expect(inheritPeriod({ status: 'failed' }, fromTo, period, false)).toEqual({
      status: 'failed', from: '2026-03-01', to: '2026-10-01',
    })
  })

  test('and returns the same object when it seeds nothing', () => {
    // Called from a state setter; a fresh object would re-render for no change.
    const bindings = { from: '2026-01-01', to: '2026-02-01' }
    expect(inheritPeriod(bindings, fromTo, period, false)).toBe(bindings)
  })
})
