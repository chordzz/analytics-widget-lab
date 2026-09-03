/**
 * Containment — FR-DA-10, read one step further.
 *
 * Merge §2. The requirement is that a *denied* widget leaves its neighbours
 * working; the same obligation plainly covers a widget whose drawing throws, and
 * before this the module had no boundary at all — one bad primitive blanked the
 * board.
 *
 * `renderToStaticMarkup` deliberately does *not* run error boundaries — a throw
 * during server render propagates rather than being caught — so the fallback is
 * asserted through the component's own state transition and its pass-through
 * through a real render. Both halves matter: the second is what stops the first
 * passing on a boundary that catches everything, including success.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { WidgetBoundary } from './WidgetBoundary'

const Fine = () => <p>drawn</p>

let logged: unknown[][] = []
const real = console.error

beforeEach(() => {
  logged = []
  console.error = (...args: unknown[]) => {
    logged.push(args)
  }
})

afterEach(() => {
  console.error = real
})

/*
 * `renderToStaticMarkup` does not run error boundaries — a throw during server
 * render propagates. So the boundary's *fallback* is asserted through the
 * component's own state transition, and its pass-through through a real render.
 */
describe('a widget that draws fine is untouched', () => {
  test('the boundary renders its child verbatim', () => {
    const markup = renderToStaticMarkup(
      <WidgetBoundary widgetId="w1">
        <Fine />
      </WidgetBoundary>,
    )
    expect(markup).toContain('drawn')
    expect(markup).not.toContain('could not be drawn')
  })
})

describe('a widget that throws is contained', () => {
  test('getDerivedStateFromError turns the throw into a message', () => {
    // The static hook is the whole mechanism: whatever it returns is what the
    // fallback renders, so asserting it is asserting the containment.
    expect(WidgetBoundary.getDerivedStateFromError(new Error('bad axis'))).toEqual({
      message: 'bad axis',
    })
  })

  test('a non-Error throw still yields a message rather than blanking', () => {
    // A primitive that throws a string would otherwise render an empty card,
    // which reads as "no data" — the one thing it must not say.
    expect(WidgetBoundary.getDerivedStateFromError('just a string')).toEqual({
      message: 'Unknown error.',
    })
  })

  test('the fallback names the failure and says the board is still usable', () => {
    const boundary = new WidgetBoundary({ widgetId: 'w1', title: 'Revenue', children: null })
    boundary.state = { message: 'bad axis' }

    const markup = renderToStaticMarkup(boundary.render() as React.ReactElement)

    expect(markup).toContain('could not be drawn')
    expect(markup).toContain('bad axis')
    expect(markup).toContain('unaffected')
  })

  test('the fallback uses the same placeholder treatment as every other state', () => {
    // A bespoke crash card would be the one state on the board that looked
    // imported from somewhere else.
    const boundary = new WidgetBoundary({ widgetId: 'w1', children: null })
    boundary.state = { message: 'x' }

    const markup = renderToStaticMarkup(boundary.render() as React.ReactElement)
    expect(markup).toContain('a-placeholder--critical')
    expect(markup).toContain('data-widget-state="crashed"')
  })

  test('it is distinguishable from a retrieval failure', () => {
    /*
     * `failed` means the data did not arrive; this means the data arrived and
     * the drawing broke. Reporting them identically sends someone to look at the
     * wrong thing — the network tab instead of the primitive.
     */
    const boundary = new WidgetBoundary({ widgetId: 'w1', children: null })
    boundary.state = { message: 'x' }

    const markup = renderToStaticMarkup(boundary.render() as React.ReactElement)
    expect(markup).not.toContain('could not load')
  })

  test('the error reaches the console rather than being swallowed', () => {
    // The card tells a Viewer the board is usable. If that were also the only
    // trace, a primitive that throws on one dataset in twenty is invisible.
    const boundary = new WidgetBoundary({ widgetId: 'w1', title: 'Revenue', children: null })
    boundary.componentDidCatch(new Error('bad axis'), { componentStack: '\n  at Thing' })

    expect(logged).toHaveLength(1)
    expect(String(logged[0][0])).toContain('Revenue')
  })
})
