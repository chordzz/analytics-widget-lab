/**
 * Reading a figure in a different currency, without asking for it again.
 *
 * Peniremit publishes `usd` and `ngn` on the same row, so switching between
 * them changes which Measure is drawn and nothing about what was fetched. That
 * is why a unit is neither a Filter nor a `presentation-toggle`: a filter
 * narrows rows, a presentation toggle changes how a figure is rendered, and
 * this substitutes one column for another in what is already on screen.
 */

import { describe, expect, test } from 'bun:test'
import { inUnit } from './query'
import type { WidgetMapping, WidgetSpec } from '../widgets/Widget'

const spec = (unitOptions?: string[]) =>
  ({ id: 'w', typeId: 'stat-card', datasetId: 'd', mapping: {}, unitOptions }) as WidgetSpec

const swap = (mapping: WidgetMapping, units: string[] | undefined, unit?: string) =>
  inUnit(mapping, spec(units), unit ? { unit } : undefined)

describe('what gets substituted', () => {
  test('the mapped unit, wherever it sits', () => {
    // `value` on a tile, `series` on a trend, both on a donut — a rule per slot
    // would miss whichever slot the next Widget type uses.
    expect(swap({ value: 'usd' }, ['usd', 'ngn'], 'ngn')).toMatchObject({ value: 'ngn' })
    expect(swap({ series: ['usd'] }, ['usd', 'ngn'], 'ngn')).toMatchObject({ series: ['ngn'] })
    expect(swap({ value: 'usd', series: ['usd'] }, ['usd', 'ngn'], 'ngn')).toMatchObject({
      value: 'ngn',
      series: ['ngn'],
    })
  })

  test('the delta travels with the figure it qualifies', () => {
    /*
     * This asserted the opposite, and the comment defending it had the argument
     * backwards: it said rewriting `usdDelta` would put a dollar movement under
     * a naira figure, when *leaving* it is what does that. The old model held
     * `unitOptions` as a list of interchangeable Field keys, which cannot swap
     * two mapped Measures to two different targets — so a limitation got
     * written up as a decision.
     *
     * Codes rather than keys, and the delta moves with its figure.
     */
    expect(swap({ value: 'usd', delta: 'usdDelta' }, ['usd', 'ngn'], 'ngn')).toMatchObject({
      value: 'ngn',
      delta: 'ngnDelta',
    })
  })

  test('but a delta that is not a currency is left alone', () => {
    // `changePercent` is a fraction in any currency.
    expect(swap({ value: 'usd', delta: 'changePercent' }, ['usd', 'ngn'], 'ngn')).toMatchObject({
      value: 'ngn',
      delta: 'changePercent',
    })
  })
})

describe('what is left alone', () => {
  test('a Widget already drawing both units', () => {
    /*
     * The bug this was found by. `series: ['usd', 'ngn']` is a chart of both,
     * and substituting collapsed it to `['ngn', 'ngn']` — the same line twice,
     * one exactly beneath the other, the legend naming it twice, and nothing
     * saying a currency had gone.
     */
    const both: WidgetMapping = { x: 'date', series: ['usd', 'ngn'] }
    expect(swap(both, ['usd', 'ngn'], 'ngn')).toEqual(both)
  })

  test('a Widget that declares no units', () => {
    expect(swap({ value: 'usd' }, undefined, 'ngn')).toMatchObject({ value: 'usd' })
  })

  test('a unit this Widget does not offer', () => {
    // The Viewer's choice is session state and the Widget may have changed
    // under it — an unknown unit is ignored rather than mapped to nothing.
    expect(swap({ value: 'usd' }, ['usd', 'ngn'], 'eur')).toMatchObject({ value: 'usd' })
  })

  test('and a Viewer who has chosen nothing', () => {
    expect(swap({ value: 'usd' }, ['usd', 'ngn'])).toMatchObject({ value: 'usd' })
  })
})
