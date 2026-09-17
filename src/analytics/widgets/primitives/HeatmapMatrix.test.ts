/**
 * Pearson's r, and the cases where the honest answer is "cannot say".
 *
 * A correlation matrix invites a reader to trust a number they cannot check, so
 * what matters as much as computing it correctly is refusing to compute it when
 * the data does not support one. Every branch that returns `undefined` here is
 * a cell that draws as "—" rather than as a confident zero.
 */

import { describe, expect, test } from 'bun:test'
import { correlation } from './HeatmapMatrix'
import type { Row } from '../../data/types'

const rows = (pairs: [number, number][]): Row[] =>
  pairs.map(([a, b]) => ({ a, b }))

describe('correlation', () => {
  test('a perfect positive relationship is 1', () => {
    const r = correlation(rows([[1, 2], [2, 4], [3, 6], [4, 8]]), 'a', 'b')
    expect(r).toBeCloseTo(1, 10)
  })

  test('a perfect inverse relationship is -1', () => {
    const r = correlation(rows([[1, 8], [2, 6], [3, 4], [4, 2]]), 'a', 'b')
    expect(r).toBeCloseTo(-1, 10)
  })

  test('never escapes the scale it is drawn on', () => {
    /*
     * Floating-point error can push a perfect correlation a hair past 1, and
     * the colour mix takes |r| as a percentage — 100.0000001% is not a valid
     * colour and the cell renders unstyled. Cheap to clamp, invisible when it
     * goes wrong.
     */
    const r = correlation(rows([[0.1, 0.3], [0.2, 0.6], [0.3, 0.9]]), 'a', 'b')
    expect(r).toBeLessThanOrEqual(1)
    expect(r).toBeGreaterThanOrEqual(-1)
  })

  test('a constant column correlates with nothing', () => {
    // Not zero — undefined. Zero says "measured, and unrelated"; a constant has
    // no deviation to relate, and the formula divides by it.
    expect(correlation(rows([[5, 1], [5, 2], [5, 3], [5, 4]]), 'a', 'b')).toBeUndefined()
  })

  test('fewer than three shared points is not a correlation', () => {
    // Two points define a line exactly, so r is 1 or -1 for *any* two points.
    // Reporting that would put a confident colour on nothing at all.
    expect(correlation(rows([[1, 2], [2, 4]]), 'a', 'b')).toBeUndefined()
  })

  test('pairs are dropped, not rows', () => {
    /*
     * Listwise deletion would let one sparse Measure decide the sample for
     * every pair in the matrix — six columns, one of them half-empty, and all
     * fifteen correlations quietly computed over half the data.
     */
    const sparse: Row[] = [
      { a: 1, b: 2, c: null },
      { a: 2, b: 4, c: 9 },
      { a: 3, b: 6, c: null },
      { a: 4, b: 8, c: 7 },
    ]
    expect(correlation(sparse, 'a', 'b')).toBeCloseTo(1, 10)
    // a-to-c has only two usable pairs, so it declines rather than reporting.
    expect(correlation(sparse, 'a', 'c')).toBeUndefined()
  })

  test('non-numeric values are not coerced', () => {
    // `Number('')` is 0, and a blank cell silently becoming a zero would drag
    // every correlation towards the origin.
    const dirty: Row[] = [
      { a: 1, b: '' },
      { a: 2, b: 4 },
      { a: 3, b: 6 },
      { a: 4, b: 8 },
    ]
    expect(correlation(dirty, 'a', 'b')).toBeCloseTo(1, 10)
  })

  test('is symmetric', () => {
    const data = rows([[1, 4], [2, 1], [3, 7], [4, 3], [5, 9]])
    expect(correlation(data, 'a', 'b')).toBe(correlation(data, 'b', 'a'))
  })

  test('an empty set says nothing rather than zero', () => {
    expect(correlation([], 'a', 'b')).toBeUndefined()
  })
})
