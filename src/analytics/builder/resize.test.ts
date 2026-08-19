/**
 * Drag-to-resize arithmetic.
 *
 * All of it is boundary behaviour — the grab that has not moved yet, the drag
 * past the edge of the grid, the board that has not been measured — and none of
 * it is reachable by clicking around, because you cannot hold a pointer at an
 * exact offset by hand.
 */

import { describe, expect, test } from 'bun:test'
import {
  HEIGHT_STEP,
  MAX_HEIGHT,
  MIN_HEIGHT,
  clampHeight,
  columnPitch,
  resizeByStep,
  resizeFromDrag,
} from './resize'
import { MAX_SPAN, MIN_SPAN } from './boards'

/** A 12-column board 1000px wide with a 16px gap. */
const PITCH = columnPitch(1000, 12, 16)
const START = { span: 4, height: 268 }

describe('column pitch', () => {
  test('twelve columns and eleven gaps fill the board', () => {
    const gap = 16
    const column = PITCH - gap
    expect(column * 12 + gap * 11).toBeCloseTo(1000, 6)
  })

  test('an unmeasured board has no pitch rather than a tiny one', () => {
    /*
     * The bug this caught: a zero-width board returned `gap / columns` — about
     * 1.3px — which is positive, so every guard downstream accepted it, and the
     * first few pixels of a drag snapped the widget to full width.
     */
    expect(columnPitch(0, 12, 16)).toBe(0)
    expect(columnPitch(-50, 12, 16)).toBe(0)
    expect(columnPitch(1000, 0, 16)).toBe(0)
  })

  test('an unmeasured board leaves the width alone through a whole drag', () => {
    const pitch = columnPitch(0, 12, 16)
    expect(resizeFromDrag(START, 400, 0, pitch).span).toBe(START.span)
  })
})

describe('a drag that has not moved', () => {
  test('changes nothing', () => {
    expect(resizeFromDrag(START, 0, 0, PITCH)).toEqual(START)
  })

  test('changes nothing when it moves less than half a step', () => {
    // Grabbing a grip mid-cell must not snap the widget out from under the
    // cursor before the gesture has begun.
    const nudged = resizeFromDrag(START, PITCH * 0.4, HEIGHT_STEP * 0.4, PITCH)
    expect(nudged).toEqual(START)
  })
})

describe('dragging sideways', () => {
  test('one pitch is one column', () => {
    expect(resizeFromDrag(START, PITCH, 0, PITCH).span).toBe(5)
    expect(resizeFromDrag(START, -PITCH, 0, PITCH).span).toBe(3)
  })

  test('it rounds to the nearest column, not the one behind', () => {
    expect(resizeFromDrag(START, PITCH * 1.6, 0, PITCH).span).toBe(6)
    expect(resizeFromDrag(START, PITCH * 1.4, 0, PITCH).span).toBe(5)
  })

  test('the grid is the limit, however far the pointer goes', () => {
    expect(resizeFromDrag(START, PITCH * 40, 0, PITCH).span).toBe(MAX_SPAN)
    expect(resizeFromDrag(START, -PITCH * 40, 0, PITCH).span).toBe(MIN_SPAN)
  })

  test('an unmeasured board leaves the width alone', () => {
    // Better a resize that only changes height than one that jumps to a
    // nonsense span because the pitch was zero.
    expect(resizeFromDrag(START, 500, 0, 0).span).toBe(START.span)
  })
})

describe('dragging down', () => {
  test('height moves in whole steps', () => {
    expect(resizeFromDrag(START, 0, HEIGHT_STEP, PITCH).height).toBe(268 + HEIGHT_STEP)
    expect(resizeFromDrag(START, 0, HEIGHT_STEP * 3, PITCH).height).toBe(268 + HEIGHT_STEP * 3)
  })

  test('steps are measured from the starting height, not from a round number', () => {
    // An odd starting height stays odd — the drag offsets it rather than
    // snapping it to a multiple and jumping on the first pixel of movement.
    const odd = { span: 4, height: 269 }
    expect(resizeFromDrag(odd, 0, HEIGHT_STEP, PITCH).height).toBe(269 + HEIGHT_STEP)
  })

  test('it stays within the bounds a card can usefully take', () => {
    expect(resizeFromDrag(START, 0, 5000, PITCH).height).toBe(MAX_HEIGHT)
    expect(resizeFromDrag(START, 0, -5000, PITCH).height).toBe(MIN_HEIGHT)
  })
})

describe('dragging diagonally', () => {
  test('both dimensions move together', () => {
    expect(resizeFromDrag(START, PITCH * 2, HEIGHT_STEP * 4, PITCH)).toEqual({
      span: 6,
      height: 268 + HEIGHT_STEP * 4,
    })
  })

  test('one axis hitting its limit does not stop the other', () => {
    const size = resizeFromDrag(START, PITCH * 40, HEIGHT_STEP * 2, PITCH)
    expect(size.span).toBe(MAX_SPAN)
    expect(size.height).toBe(268 + HEIGHT_STEP * 2)
  })
})

describe('the keyboard', () => {
  test('an arrow is one column or one step', () => {
    expect(resizeByStep(START, 1, 0)).toEqual({ span: 5, height: 268 })
    expect(resizeByStep(START, 0, 1)).toEqual({ span: 4, height: 268 + HEIGHT_STEP })
  })

  test('it stops at the same limits the pointer does', () => {
    expect(resizeByStep({ span: MAX_SPAN, height: 268 }, 1, 0).span).toBe(MAX_SPAN)
    expect(resizeByStep({ span: MIN_SPAN, height: 268 }, -1, 0).span).toBe(MIN_SPAN)
    expect(resizeByStep({ span: 4, height: MAX_HEIGHT }, 0, 1).height).toBe(MAX_HEIGHT)
  })
})

describe('clampHeight', () => {
  test('rounds to whole pixels', () => {
    expect(clampHeight(268.6)).toBe(269)
  })

  test('holds the bounds', () => {
    expect(clampHeight(-10)).toBe(MIN_HEIGHT)
    expect(clampHeight(9999)).toBe(MAX_HEIGHT)
  })
})
