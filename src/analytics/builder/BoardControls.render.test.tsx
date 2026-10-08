/**
 * The board's date Control, mounted.
 *
 * Two fixes live in this component and neither was pinned by a test, because
 * neither is reachable without mounting. Both were found by hand, in a browser,
 * which is not a place regressions get caught twice.
 *
 * **Appearing is not being set.** The announcement used to be an effect on
 * `[from, to]`, which React runs on the first render too — so opening Board
 * settings looked exactly like an Author composing, and saved the rolling
 * default onto the board as a fixed window. A static render never mounts, so
 * the effect never ran, so no test could have seen it.
 *
 * **The word is kept, the date is drawn.** Picking "Today" stores `today` and
 * displays the current date. A date that happens to be today looks identical
 * and means something different tomorrow, so only the stored form can tell
 * them apart.
 */

import { describe, expect, test } from 'bun:test'
import { mount } from '../../test/mount'
import { AnalyticsDataProvider } from '../data/AnalyticsData'
import { BoardControls } from './BoardControls'
import { dateRangeControl } from '../../domain/composition'
import { TODAY, today } from '../../domain/default-period'
import type { ControlValues } from '../../domain/composition'

const CONTROL = dateRangeControl('c-1', 'Period')

/** Records every announcement, so "nothing was said" is assertable. */
const open = async (values: ControlValues = {}) => {
  const announced: (ControlValues | null)[] = []
  const tree = (current: ControlValues) => (
    <AnalyticsDataProvider>
      <BoardControls
        controls={[CONTROL]}
        widgets={[]}
        values={current}
        onChange={(next) => announced.push(next)}
        onRemove={() => {}}
      />
    </AnalyticsDataProvider>
  )
  const screen = await mount(tree(values))
  return {
    screen,
    announced,
    /** A period the board resolved after the control had already appeared. */
    arrive: (next: ControlValues) => screen.rerender(tree(next)),
  }
}

describe('opening the controls changes nothing', () => {
  test('mounting announces no value at all', async () => {
    /*
     * The regression this exists for: a board opened and not touched was
     * saved with the day it was opened on as its fixed window, and its
     * `updated` stamp bumped for a visit.
     */
    const { screen, announced } = await open()
    expect(announced).toEqual([])
    screen.unmount()
  })

  test('nor does mounting with a period already set', async () => {
    const { screen, announced } = await open({ 'c-1': { from: '2026-08-03', to: '2026-09-25' } })
    expect(announced).toEqual([])
    screen.unmount()
  })
})

describe('a window that arrives after the control does', () => {
  test('the field shows it, rather than keeping what it mounted with', async () => {
    /*
     * The two ends were read once and never again, so a board whose stored
     * period resolved a moment later left the control and the widgets below it
     * disagreeing — with the control the one lying.
     */
    const { screen, arrive } = await open()
    // An unset field is labelled by its name alone; a set one carries the date.
    expect(screen.buttons()).toContain('From')

    await arrive({ 'c-1': { from: '2026-08-03', to: '2026-09-25' } })

    expect(screen.buttons()).not.toContain('From')
    expect(screen.buttons().find((name) => name.startsWith('From:'))).toContain('2026')
    screen.unmount()
  })
})

describe('picking "today"', () => {
  const openTo = async () => {
    const { screen, announced } = await open({ 'c-1': { from: '2026-08-03', to: '2026-09-25' } })
    await screen.pressStarting('To:')
    return { screen, announced }
  }

  test('stores the word, not the date it was picked on', async () => {
    const { screen, announced } = await openTo()
    await screen.press('Today')

    expect(announced).toEqual([{ 'c-1': { from: '2026-08-03', to: TODAY } }])
    expect(announced.at(-1)?.['c-1']).not.toEqual({ from: '2026-08-03', to: today() })
    screen.unmount()
  })

  test('is offered on the end of the range and not the start', async () => {
    /*
     * A window whose *start* moves is a rolling window — a different thing,
     * needing a set of choices rather than one word. Offering it on `from`
     * would let someone build a board that always shows a single day and
     * looks deliberate.
     */
    const { screen } = await open({ 'c-1': { from: '2026-08-03', to: '2026-09-25' } })
    await screen.pressStarting('From:')

    expect(screen.buttons()).not.toContain('Today')
    screen.unmount()
  })
})

describe('the ends move independently', () => {
  test('changing one keeps the other', async () => {
    const { screen, announced } = await open({ 'c-1': { from: '2026-08-03', to: '2026-09-25' } })
    await screen.pressStarting('To:')
    await screen.press('Clear')

    expect(announced).toEqual([{ 'c-1': { from: '2026-08-03' } }])
    screen.unmount()
  })
})
