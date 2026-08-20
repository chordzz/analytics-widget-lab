/**
 * Grid units.
 *
 * The board is twelve columns wide and its rows are a fixed pitch, so a
 * widget's placement is four integers: `x`, `y`, `w`, `h`. This module is the
 * only place that knows how those integers become pixels, and it is pure so the
 * conversions can be tested — a browser cannot tell you that a widget came out
 * one row too tall, and the arithmetic is where the bugs are.
 *
 * The one non-obvious rule: **a row costs `ROW_HEIGHT + MARGIN_Y`, not
 * `ROW_HEIGHT`.** The margin sits between every row unit, not only between
 * widgets, so a naive `px / ROW_HEIGHT` inflates every widget about threefold —
 * a widget asking for 33 rows got 776px instead of 264. `rowsForPx` and
 * `pxForRows` are exact inverses of each other; nothing else should do this
 * conversion by hand.
 */

/** A board is twelve columns, as it has been since the first version. */
export const COLUMNS = 12

/**
 * One row unit, in pixels, and the gap between units.
 *
 * `MARGIN_Y` is also the visible gap between two stacked widgets, which is why
 * it matches `--a-space-4` — the gap the board has always used. That coupling
 * puts a floor under vertical granularity: the smallest height difference
 * between two widgets is one row *pitch*, 40px, not `ROW_HEIGHT`. Coarser than
 * the 8px steps the pixel-based grip used, and no worse for it — the reason
 * heights were stepped at all was that free-dragging produces boards where two
 * widgets differ by three pixels.
 */
export const ROW_HEIGHT = 24
/** Matches `--a-space-4`, the board's grid gap. */
export const MARGIN_X = 16
export const MARGIN_Y = 16

/** A widget narrower than two columns has no room for its own title. */
export const MIN_W = 2
export const MAX_W = COLUMNS

/**
 * Height bounds, in rows.
 *
 * Four rows is 144px — just above the 120px floor the pixel-based resize used,
 * and the height a stat card asks for anyway. Three rows is 104px, which clips
 * a stat card's own content, so the floor is 4 rather than "as small as the
 * grid allows". Eighteen rows is 704px, the old 720px ceiling to the nearest
 * row.
 */
export const MIN_H = 4
export const MAX_H = 18

/** Where a widget sits on the board, and how much of it it takes. */
export interface Placement {
  x: number
  y: number
  w: number
  h: number
}

export const clampW = (w: number): number => Math.max(MIN_W, Math.min(MAX_W, Math.round(w)))

export const clampH = (h: number): number => Math.max(MIN_H, Math.min(MAX_H, Math.round(h)))

/** Rows → the pixel height RGL will give the item. `n` rows and `n − 1` gaps. */
export const pxForRows = (rows: number): number => rows * ROW_HEIGHT + (rows - 1) * MARGIN_Y

/**
 * Pixels → rows, clamped to what a card can usefully be.
 *
 * Adding one margin before dividing is what makes this the exact inverse of
 * `pxForRows`: that function returns `pitch × rows − MARGIN_Y`, so the margin
 * has to come back before the division or every height rounds down a row.
 */
export const rowsForPx = (px: number): number => clampH((px + MARGIN_Y) / (ROW_HEIGHT + MARGIN_Y))

/**
 * A placement brought inside the board.
 *
 * `x` is clamped against `COLUMNS − w` rather than `COLUMNS`, so a widget
 * widened at the right edge slides left instead of hanging off the board. There
 * is no ceiling on `y`: the board grows downwards and always has.
 */
export function clampPlacement(placement: Placement): Placement {
  const w = clampW(placement.w)
  const h = clampH(placement.h)

  return {
    w,
    h,
    x: Math.max(0, Math.min(COLUMNS - w, Math.round(placement.x))),
    y: Math.max(0, Math.round(placement.y)),
  }
}

/** Two placements overlap. Touching edges do not count. */
export const collides = (a: Placement, b: Placement): boolean =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y

/** The lowest row any of these placements reaches. */
export const bottomOf = (placements: readonly Placement[]): number =>
  placements.reduce((lowest, item) => Math.max(lowest, item.y + item.h), 0)

/**
 * The first place a `w × h` widget fits, scanning left to right, top to bottom.
 *
 * Used when a widget is added: dropping it below everything else is simpler and
 * always leaves it stranded under a half-empty row, which reads as the builder
 * having missed the obvious gap. Scanning finds that gap.
 *
 * The scan is bounded rather than open-ended. Everything below the lowest
 * occupied row is free by definition, so a fit is guaranteed by `bottom` — but
 * an unbounded `for (;;)` here would turn any future mistake in `collides` into
 * a hung tab rather than a misplaced widget.
 */
export function firstFit(taken: readonly Placement[], w: number, h: number): { x: number; y: number } {
  const width = clampW(w)
  const height = clampH(h)
  const bottom = bottomOf(taken)

  for (let y = 0; y <= bottom; y++) {
    for (let x = 0; x + width <= COLUMNS; x++) {
      const candidate = { x, y, w: width, h: height }
      if (!taken.some((item) => collides(item, candidate))) return { x, y }
    }
  }

  return { x: 0, y: bottom }
}

/**
 * Lay a list of widths out left to right, wrapping when the row is full.
 *
 * This is the old board in one function. Before free placement a widget stored
 * only its width and its index, and CSS grid flowed it like words in a
 * paragraph; that is exactly what this reproduces, which is what makes it the
 * right answer for two separate jobs — migrating a saved board, and reflowing
 * after a drag-to-reorder while the old canvas is still in place.
 *
 * Each shelf is as tall as its tallest widget, matching what the CSS grid did
 * with `grid-auto-rows`. The result is deliberately **not** compacted upward:
 * RGL's `verticalCompactor` owns that, and a second implementation here would
 * only be a chance for the two to disagree.
 */
export function flowLayout<T extends { w: number; h: number }>(
  items: readonly T[],
): (T & Placement)[] {
  let x = 0
  let y = 0
  let shelf = 0

  return items.map((item) => {
    const w = clampW(item.w)
    const h = clampH(item.h)

    if (x + w > COLUMNS) {
      y += shelf
      x = 0
      shelf = 0
    }

    const placed = { ...item, x, y, w, h }
    x += w
    shelf = Math.max(shelf, h)
    return placed
  })
}
