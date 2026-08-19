/**
 * Category axis geometry.
 *
 * The bug this exists for: six region names in a quarter-width card left a 42px
 * band for labels measuring up to 76px, and they were drawn straight through
 * each other. Unreadable, and invisible to every test we had — the chart
 * rendered, the values were right, the labels were all present.
 *
 * The decision is pure arithmetic, so it is tested as arithmetic. Staging a
 * specific pixel width in a browser to check the *other* branch turned out to be
 * the hard part: the gallery grid controls card width, so "wide enough to lay
 * labels flat" is not something you can reach by setting a style.
 */

import { describe, expect, test } from 'bun:test'
import { categoryAxisLayout } from './BarChart'

/** Roughly what the six sales regions measure at 11px. */
const REGIONS = [60, 56, 37, 76, 61, 60]

describe('when labels fit', () => {
  test('they are left flat', () => {
    // 900px across six categories is a 150px band for a 76px label.
    expect(categoryAxisLayout(REGIONS, 900, 220).tilted).toBe(false)
  })

  test('the axis stays shallow', () => {
    expect(categoryAxisLayout(REGIONS, 900, 220).height).toBe(24)
  })

  test('a single category never tilts, however long its name', () => {
    expect(categoryAxisLayout([300], 400, 220).tilted).toBe(false)
  })

  test('fitting exactly is not fitting', () => {
    // Neighbours would touch. The gap is the difference between "dense" and
    // "one word run into the next".
    const band = 80
    expect(categoryAxisLayout([band], band, 220).tilted).toBe(true)
    expect(categoryAxisLayout([band - 8], band, 220).tilted).toBe(false)
  })
})

describe('when labels do not fit', () => {
  const narrow = categoryAxisLayout(REGIONS, 251, 220)

  test('they tilt rather than truncate', () => {
    expect(narrow.tilted).toBe(true)
    // The widest region is 76px and the budget is far above it, so nothing is
    // cut — which is the whole point of tilting instead of shortening.
    expect(narrow.budget).toBeGreaterThan(76)
  })

  test('the axis grows only as far as the labels need', () => {
    // 76px at 30° drops the baseline 38px, plus the glyph and tick offset.
    expect(narrow.height).toBe(58)
  })

  test('a taller plot does not mean a taller axis', () => {
    // The axis is sized by the labels, not by the room available.
    expect(categoryAxisLayout(REGIONS, 251, 600).height).toBe(narrow.height)
  })
})

describe('when even tilting is not enough', () => {
  const long = [400, 380, 420]

  test('the axis is capped at a share of the plot', () => {
    const layout = categoryAxisLayout(long, 251, 200)
    // 200 × 0.32 = 64 of rise, plus the glyph allowance.
    expect(layout.height).toBe(84)
    expect(layout.height).toBeLessThan(200 * 0.5)
  })

  test('labels are truncated to the capped height, not beyond it', () => {
    const layout = categoryAxisLayout(long, 251, 200)
    expect(layout.budget).toBe(128)
    expect(layout.budget).toBeLessThan(400)
  })

  test('a very short plot still leaves a usable axis', () => {
    // Without the floor, a squat chart would compute an axis a few pixels tall
    // and clip every label to nothing.
    const layout = categoryAxisLayout(long, 251, 40)
    expect(layout.height).toBeGreaterThanOrEqual(34)
    expect(layout.budget).toBeGreaterThanOrEqual(56)
  })
})

describe('degenerate input', () => {
  test('no categories does not divide by zero', () => {
    const layout = categoryAxisLayout([], 251, 220)
    expect(Number.isFinite(layout.height)).toBe(true)
    expect(layout.tilted).toBe(false)
  })

  test('a zero-width plot does not produce a negative axis', () => {
    const layout = categoryAxisLayout(REGIONS, 0, 220)
    expect(layout.height).toBeGreaterThan(0)
    expect(Number.isFinite(layout.budget)).toBe(true)
  })
})
