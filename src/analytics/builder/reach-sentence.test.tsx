/**
 * What the reach sentence says when a Control can move a Widget but not widen it.
 *
 * The limit is invisible until somebody hits it: a Viewer asks for August on a
 * card bound to September, and gets an empty chart. This sentence is the only
 * thing on screen that could have explained that, and it used to say "affects
 * all widgets".
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { Reach } from './BoardControls'

const words = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&mdash;|&#x2014;/g, '—')
    .replace(/\s+/g, ' ')
    .trim()

const sentence = (props: Parameters<typeof Reach>[0]) =>
  words(renderToStaticMarkup(<Reach {...props} />))

const capped = { widgetId: 'w1', reason: 'Profit has a fixed range on the widget, so this narrows within it rather than replacing it' }

describe('a limited widget still counts as moved', () => {
  test('it is not reported as unaffected', () => {
    // It does move. Counting it as a miss would understate the Control and send
    // an Author looking for a problem that is not there.
    const said = sentence({ affected: 2, limited: [capped], unaffected: [] })
    expect(said).toContain('all 3 widgets')
  })

  test('and the caveat is said rather than folded into the number', () => {
    const said = sentence({ affected: 2, limited: [capped], unaffected: [] })
    expect(said).toContain('narrows within it')
  })
})

describe('the caveat survives alongside a genuine miss', () => {
  test('both appear', () => {
    const said = sentence({
      affected: 1,
      limited: [capped],
      unaffected: [{ widgetId: 'w3', reason: 'Sales by region declares no time dimension.' }],
    })
    expect(said).toContain('Affects 2 of 3 widgets')
    expect(said).toContain('no time dimension')
    expect(said).toContain('narrows within it')
  })
})

describe('nothing limited says nothing extra', () => {
  test('the sentence is unchanged when every widget moves freely', () => {
    expect(sentence({ affected: 3, limited: [], unaffected: [] })).toBe('Affects all 3 widgets.')
  })

  test('one reason per cause, however many widgets share it', () => {
    // Two widgets over the same Dataset are capped for the same reason. Saying
    // it twice is a wall rather than an explanation.
    const said = sentence({
      affected: 0,
      limited: [capped, { widgetId: 'w2', reason: capped.reason }],
      unaffected: [],
    })
    expect(said.split('narrows within it').length - 1).toBe(1)
  })
})
