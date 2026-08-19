/**
 * Turning a drag into a size.
 *
 * Kept apart from the component so the arithmetic can be tested without staging
 * a pixel-perfect board in a browser — the interesting cases are the boundaries,
 * and a grid cell's width is not something you can set from a test.
 *
 * The rule that makes a drag feel right: everything is measured **from where the
 * grab started**, never from the pointer's absolute position. A widget grabbed
 * mid-cell would otherwise jump to snap under the cursor before it had moved.
 * At `dx = 0` the size is exactly what it was.
 */

import { clampSpan } from './boards'

/** Rows are free-form pixels, so they need their own bounds. */
export const MIN_HEIGHT = 120
export const MAX_HEIGHT = 720

/**
 * Height moves in steps rather than raw pixels.
 *
 * Free-dragging to the pixel produces boards where two widgets differ by 3px,
 * which reads as a mistake rather than a choice. Stepping also gives the drag a
 * detent, so it feels like it is landing somewhere.
 */
export const HEIGHT_STEP = 8

export const clampHeight = (height: number): number =>
  Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(height)))

/**
 * Horizontal distance from one column to the next, gaps included.
 *
 * A twelve-column board of width `W` with gap `g` has columns of
 * `(W − 11g) / 12`, so the pitch is that plus one gap — which simplifies to
 * `(W + g) / 12`. Dragging by one pitch is dragging by one column.
 */
export function columnPitch(boardWidth: number, columns: number, gap: number): number {
  /*
   * An unmeasured board is zero pitch, not a tiny one.
   *
   * Returning `(0 + gap) / 12` looks harmless and is the worst possible answer:
   * a pitch of 1.3px means the first few pixels of any drag read as ten columns
   * and the widget snaps to full width. A caller checking `pitch > 0` would be
   * satisfied by it, so the check has to happen here.
   */
  if (columns <= 0 || boardWidth <= 0) return 0
  return (boardWidth + gap) / columns
}

export interface Size {
  span: number
  height: number
}

/**
 * The size a widget should take, given where its grip started and where the
 * pointer is now.
 *
 * A zero or negative pitch means the board has not been measured yet; the span
 * is left alone rather than being sent to a nonsense value.
 */
export function resizeFromDrag(origin: Size, dx: number, dy: number, pitch: number): Size {
  const columns = pitch > 0 ? Math.round(dx / pitch) : 0
  const rows = Math.round(dy / HEIGHT_STEP)

  return {
    span: clampSpan(origin.span + columns),
    height: clampHeight(origin.height + rows * HEIGHT_STEP),
  }
}

/** One press of an arrow key, in the same units the drag uses. */
export function resizeByStep(origin: Size, columns: number, rows: number): Size {
  return {
    span: clampSpan(origin.span + columns),
    height: clampHeight(origin.height + rows * HEIGHT_STEP),
  }
}
