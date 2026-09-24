/**
 * Query execution over rows that have already been fetched.
 *
 * This stands in for a Source System in the fixtures, and re-applies filters in
 * the live path. What it must never do is narrow on something the rows do not
 * carry — a name that is not a column drops every row, and an emptied Widget
 * looks exactly like a Dataset with nothing in it.
 */

import { describe, expect, test } from 'bun:test'
import { executeQuery } from './aggregate'

/*
 * The local range pass, and the column it needs to do anything.
 *
 * Found on a live board: four stat cards read "No data for this selection"
 * while the trends beside them, over the same period and the same window, drew
 * fine. A Control's `timeRange.field` names the Field it reached through, and
 * for a Dataset with no time Dimension that is a Filter Parameter name rather
 * than a column — an aggregate answers *for* a window, so its row is
 * `{ value, delta, changePercent }` and nothing else.
 *
 * The same mistake as filtering on a Filter Parameter name, which `asEndpoint`
 * already warns about: a parameter name is not a column name, and neither is
 * the name a Control reached through.
 */
describe('a range narrows only what it can see', () => {
  const aggregate = [{ value: 1420, delta: 28, changePercent: 2.01 }]
  const trend = [
    { date: '2026-03-15', value: 10 },
    { date: '2026-11-01', value: 99 },
  ]
  const range = (field: string) => ({ timeRange: { field, from: '2026-03-01', to: '2026-10-01' } })

  test('an aggregate row survives a range it has no column for', () => {
    // The endpoint has already applied the window through the parameters it
    // published. There is nothing left for this pass to do.
    expect(executeQuery(aggregate, range('from/to'))).toHaveLength(1)
  })

  test('including where the publisher declared a Field the response omits', () => {
    // BE-8's `time_range.field` names a Field on the *source*, which an
    // aggregate endpoint need not return as a column.
    expect(executeQuery(aggregate, range('day'))).toHaveLength(1)
  })

  test('and a Dataset that does carry the column is still narrowed', () => {
    // The guard must not turn the filter off for everyone.
    expect(executeQuery(trend, range('date'))).toHaveLength(1)
  })

  test('one row missing the column does not disable the filter', () => {
    /*
     * The guard asks whether *any* row carries it, not whether every row does.
     * A single ragged row would otherwise switch off narrowing for the whole
     * response, which is the quiet direction to fail in.
     */
    const ragged = [...trend, { value: 5 }]
    expect(executeQuery(ragged as never, range('date'))).toHaveLength(1)
  })
})
