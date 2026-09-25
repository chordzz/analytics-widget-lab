/**
 * What gets written when an Author merely *looks* at a board's controls.
 *
 * Opening Board settings used to pin the board's period. Three reasonable
 * decisions met: an unset date Control is shown the rolling default so its
 * fields are not blank; the date field announced its value from an effect,
 * which React runs on the first render as well as on a change; and the builder
 * treats every announcement as the Author composing.
 *
 * So appearing looked like being set. The board was saved with whatever window
 * happened to be current that day, and `updated` moved for a visit.
 */

import { describe, expect, test } from 'bun:test'
import { defaultPeriod } from '../../domain/default-period'
import { dateRangeControl, type Control, type ControlValues } from '../../domain/composition'

/**
 * The decision `setValues` makes, per Control.
 *
 * Extracted because the hook needs React to run and the rule does not: what is
 * worth pinning is which values reach `persist`, and that is arithmetic over a
 * Control and an incoming value.
 */
const persisted = (controls: Control[], next: ControlValues): string[] => {
  const wrote: string[] = []
  for (const control of controls) {
    const value = next[control.id] ?? null
    const stored = control.defaultValue ?? null
    if (JSON.stringify(value) === JSON.stringify(stored)) continue
    if (
      stored === null &&
      control.controlType === 'date-range' &&
      JSON.stringify(value) === JSON.stringify(defaultPeriod())
    ) {
      continue
    }
    wrote.push(control.id)
  }
  return wrote
}

const period = dateRangeControl('c-period', 'Period')
const withStored = (value: { from: string; to: string }): Control => ({
  ...period,
  defaultValue: value,
})

describe('opening a board', () => {
  test('writes nothing when the Control is showing the window we filled in', () => {
    /*
     * The bug, in one line. The fill is a display decision — it is not the
     * Author saying the board opens on the last thirty days — so it coming
     * back here is our own value returning.
     */
    expect(persisted([period], { 'c-period': defaultPeriod() })).toEqual([])
  })

  test('and nothing when the Control already stores that window', () => {
    const stored = { from: '2026-07-01', to: '2026-09-30' }
    expect(persisted([withStored(stored)], { 'c-period': stored })).toEqual([])
  })
})

describe('changing it', () => {
  test('writes the window the Author chose', () => {
    expect(persisted([period], { 'c-period': { from: '2026-01-01', to: '2026-03-31' } })).toEqual([
      'c-period',
    ])
  })

  test('including one that differs from a stored window', () => {
    const control = withStored({ from: '2026-07-01', to: '2026-09-30' })
    expect(persisted([control], { 'c-period': { from: '2026-01-01', to: '2026-03-31' } })).toEqual([
      'c-period',
    ])
  })

  test('and clearing it, which is a decision too', () => {
    // `null` drops the stored window so the rolling default applies again —
    // distinct from never having set one, and worth writing.
    expect(persisted([withStored({ from: '2026-07-01', to: '2026-09-30' })], {})).toEqual([
      'c-period',
    ])
  })

  test('but the guard does not swallow a deliberate last-thirty-days', () => {
    /*
     * Where a window *is* stored, choosing the rolling one is a real change —
     * the Author moving off their quarter and back to the default. Only the
     * unstored case is ours to ignore.
     */
    const control = withStored({ from: '2026-07-01', to: '2026-09-30' })
    expect(persisted([control], { 'c-period': defaultPeriod() })).toEqual(['c-period'])
  })
})
