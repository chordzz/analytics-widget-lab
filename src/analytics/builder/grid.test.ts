/**
 * Grid arithmetic.
 *
 * Every case here is a boundary or a conversion, which is the whole reason this
 * module is pure. Two of them exist because the spike got them wrong first: a
 * row costing more than `ROW_HEIGHT`, and a widget added to a board with a gap
 * in it landing below the board instead of in the gap.
 */

import { describe, expect, test } from 'bun:test'
import {
  COLUMNS,
  MARGIN_Y,
  MAX_H,
  MAX_W,
  MIN_H,
  MIN_W,
  ROW_HEIGHT,
  bottomOf,
  clampH,
  clampPlacement,
  clampW,
  collides,
  firstFit,
  flowLayout,
  pxForRows,
  rowsForPx,
} from './grid'

const at = (x: number, y: number, w: number, h: number) => ({ x, y, w, h })

describe('rows and pixels', () => {
  test('a row costs the row height plus the margin', () => {
    /*
     * The bug this names: `px / ROW_HEIGHT` ignores the margin between row
     * units and inflates every widget about threefold. A 264px widget is seven
     * rows, not eleven.
     */
    expect(rowsForPx(264)).toBe(7)
    expect(rowsForPx(264)).not.toBe(Math.round(264 / ROW_HEIGHT))
    expect(pxForRows(7)).toBe(264)
  })

  test('n rows are n row heights and n-1 margins', () => {
    expect(pxForRows(1)).toBe(ROW_HEIGHT)
    expect(pxForRows(4)).toBe(4 * ROW_HEIGHT + 3 * MARGIN_Y)
    expect(pxForRows(18)).toBe(704)
  })

  test('the two conversions are exact inverses across the usable range', () => {
    for (let rows = MIN_H; rows <= MAX_H; rows++) {
      expect(rowsForPx(pxForRows(rows))).toBe(rows)
    }
  })

  test('the heights the widget types ask for land on sensible rows', () => {
    // `heightForType` still speaks pixels, so these are the conversions the
    // migration and every newly added widget actually go through.
    expect(rowsForPx(132)).toBe(4) // a stat card
    expect(rowsForPx(188)).toBe(5) // a gauge
    expect(rowsForPx(268)).toBe(7) // the default plot
    expect(rowsForPx(300)).toBe(8) // a temporal plot
    expect(rowsForPx(320)).toBe(8) // a table
  })

  test('a height outside the bounds comes back inside them', () => {
    expect(rowsForPx(10)).toBe(MIN_H)
    expect(rowsForPx(5000)).toBe(MAX_H)
  })
})

describe('clamps', () => {
  test('a width rounds to whole columns', () => {
    expect(clampW(4.4)).toBe(4)
    expect(clampW(4.6)).toBe(5)
  })

  test('the grid is the limit', () => {
    expect(clampW(0)).toBe(MIN_W)
    expect(clampW(-3)).toBe(MIN_W)
    expect(clampW(40)).toBe(MAX_W)
    expect(clampH(0)).toBe(MIN_H)
    expect(clampH(999)).toBe(MAX_H)
  })
})

describe('clampPlacement', () => {
  test('a widget at the right edge slides left rather than hanging off', () => {
    // Clamping x against COLUMNS instead of COLUMNS - w is the version that
    // leaves half a widget outside the board.
    expect(clampPlacement(at(10, 0, 6, 7))).toMatchObject({ x: 6, w: 6 })
  })

  test('a full-width widget can only sit at zero', () => {
    expect(clampPlacement(at(5, 0, 12, 7)).x).toBe(0)
  })

  test('negatives come back to the origin', () => {
    expect(clampPlacement(at(-4, -9, 4, 7))).toMatchObject({ x: 0, y: 0 })
  })

  test('there is no floor to the board', () => {
    // Boards grow downwards; a y ceiling would silently pull widgets up.
    expect(clampPlacement(at(0, 400, 4, 7)).y).toBe(400)
  })

  test('a placement already inside the board is left alone', () => {
    expect(clampPlacement(at(4, 9, 5, 7))).toEqual(at(4, 9, 5, 7))
  })
})

describe('collision', () => {
  test('overlapping rectangles collide', () => {
    expect(collides(at(0, 0, 4, 4), at(2, 2, 4, 4))).toBe(true)
    expect(collides(at(0, 0, 12, 4), at(6, 3, 2, 2))).toBe(true)
  })

  test('touching edges do not', () => {
    // Off by one here and every widget refuses to sit beside its neighbour.
    expect(collides(at(0, 0, 4, 4), at(4, 0, 4, 4))).toBe(false)
    expect(collides(at(0, 0, 4, 4), at(0, 4, 4, 4))).toBe(false)
  })

  test('an empty board has no bottom', () => {
    expect(bottomOf([])).toBe(0)
    expect(bottomOf([at(0, 0, 4, 4), at(4, 2, 4, 9)])).toBe(11)
  })
})

describe('placing a new widget', () => {
  test('the first widget goes to the top left', () => {
    expect(firstFit([], 4, 7)).toEqual({ x: 0, y: 0 })
  })

  test('it lands in the gap beside a half-empty row, not below the board', () => {
    // A stranded widget under a row with four free columns reads as the builder
    // having missed the obvious place to put it.
    expect(firstFit([at(0, 0, 8, 7)], 4, 7)).toEqual({ x: 8, y: 0 })
  })

  test('it will not squeeze into a gap it does not fit', () => {
    expect(firstFit([at(0, 0, 10, 7)], 4, 7)).toEqual({ x: 0, y: 7 })
  })

  test('it finds a hole under a tall neighbour', () => {
    // A 12-row widget on the left leaves a usable hole below a short one.
    const taken = [at(0, 0, 4, 12), at(4, 0, 8, 5)]
    expect(firstFit(taken, 8, 4)).toEqual({ x: 4, y: 5 })
  })

  test('a full board sends it to the bottom', () => {
    expect(firstFit([at(0, 0, 12, 7)], 12, 7)).toEqual({ x: 0, y: 7 })
  })

  test('whatever it returns does not overlap anything', () => {
    const taken = [at(0, 0, 5, 7), at(5, 0, 3, 4), at(8, 0, 4, 9)]
    const spot = firstFit(taken, 3, 6)
    expect(taken.some((item) => collides(item, { ...spot, w: 3, h: 6 }))).toBe(false)
  })
})

describe('flowing a list left to right', () => {
  test('a row fills before the next one starts', () => {
    const flowed = flowLayout([
      { w: 3, h: 4 },
      { w: 3, h: 4 },
      { w: 3, h: 4 },
      { w: 3, h: 4 },
    ])
    expect(flowed.map((item) => [item.x, item.y])).toEqual([
      [0, 0],
      [3, 0],
      [6, 0],
      [9, 0],
    ])
  })

  test('a widget that does not fit wraps to the next shelf', () => {
    const flowed = flowLayout([
      { w: 8, h: 7 },
      { w: 8, h: 7 },
    ])
    expect(flowed[1]).toMatchObject({ x: 0, y: 7 })
  })

  test('a shelf is as tall as its tallest widget, not its last', () => {
    /*
     * The old CSS grid sized each row to its tallest item; anything else here
     * overlaps the shelf below on the first migrated board.
     *
     * The tall widget comes first deliberately. With it last, tracking only the
     * previous height gives the same answer and the test proves nothing.
     */
    const flowed = flowLayout([
      { w: 6, h: 9 },
      { w: 6, h: 4 },
      { w: 12, h: 5 },
    ])
    expect(flowed[2]).toMatchObject({ x: 0, y: 9 })
  })

  test('a full-width widget on an empty shelf stays put', () => {
    // `x + w > COLUMNS` must not be true for the exact-fit case, or every
    // twelve-column widget wastes a shelf above itself.
    expect(flowLayout([{ w: 12, h: 5 }])[0]).toMatchObject({ x: 0, y: 0 })
  })

  test('nothing flows off the right edge', () => {
    const flowed = flowLayout(
      [5, 5, 5, 5, 5, 5].map((w) => ({ w, h: 4 })),
    )
    for (const item of flowed) expect(item.x + item.w).toBeLessThanOrEqual(COLUMNS)
  })

  test('nothing in a flowed layout overlaps anything else', () => {
    const flowed = flowLayout(
      [3, 8, 4, 12, 5, 3, 6, 2].map((w, index) => ({ w, h: 4 + (index % 5) })),
    )
    for (const [i, item] of flowed.entries()) {
      for (const other of flowed.slice(i + 1)) expect(collides(item, other)).toBe(false)
    }
  })

  test('out-of-range sizes are clamped on the way through', () => {
    const flowed = flowLayout([{ w: 99, h: 1 }])
    expect(flowed[0]).toMatchObject({ w: MAX_W, h: MIN_H })
  })

  test('the fields already on the item survive', () => {
    const flowed = flowLayout([{ id: 'a', w: 4, h: 7 }])
    expect(flowed[0].id).toBe('a')
  })

  test('an empty board flows to an empty layout', () => {
    expect(flowLayout([])).toEqual([])
  })
})
