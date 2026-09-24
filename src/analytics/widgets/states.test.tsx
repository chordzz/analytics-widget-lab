/**
 * The six render states, as the Viewer actually sees them.
 *
 * Merge Plan Stage 3. `retrieval/render-state.ts` already proves the *resolver*
 * keeps six outcomes apart; this proves the *chrome* does. They are different
 * claims, and only the second one is what a Viewer experiences — a resolver that
 * returns `denied` into a card that draws every non-ready state as "No data" has
 * satisfied its tests and broken FR-DA-11.
 *
 * The requirements are unusually specific about this, and each is specific for a
 * reason that is easy to state and easy to lose:
 *
 *   - a denial drawn as empty teaches the Viewer the figure is zero
 *   - a denial drawn as an error teaches them the system is broken
 *   - a withdrawal drawn with last-known figures presents stale data as current
 *
 * So the assertions below are mostly about states being *distinguishable*, not
 * about any particular wording.
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { WidgetCard, type WidgetState } from './WidgetCard'
import { WIDGET_RENDER_STATUSES } from '../../retrieval/render-state'

const STATES: WidgetState[] = ['ready', 'loading', 'empty', 'denied', 'withdrawn', 'failed']

const draw = (state: WidgetState, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <WidgetCard title="Revenue" state={state} {...extra}>
      <p>THE-CHART</p>
    </WidgetCard>,
  )

/** Visible words only — class names and icon paths are not what a Viewer reads. */
const words = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()

describe('the card speaks the same six states as the model', () => {
  test('every status the resolver can produce has a card treatment', () => {
    // Both lists sorted: this is about the *set* agreeing, not the order.
    expect([...STATES].sort()).toEqual([...WIDGET_RENDER_STATUSES].sort())
  })
})

describe('states are distinguishable', () => {
  test('no two non-ready states read the same', () => {
    /*
     * The assertion the whole stage exists for. Four states that all render
     * "No data for this selection." would pass a test that each state renders
     * *something*, which is why that is not the test.
     */
    const rendered = STATES.filter((state) => state !== 'ready' && state !== 'loading').map(
      (state) => words(draw(state)),
    )

    expect(new Set(rendered).size).toBe(rendered.length)
  })

  test('only ready draws the widget itself', () => {
    for (const state of STATES) {
      const shown = draw(state).includes('THE-CHART')
      expect({ state, shown }).toEqual({ state, shown: state === 'ready' })
    }
  })
})

describe('denied is not empty and not broken', () => {
  const denied = words(draw('denied'))

  test('it says access was denied', () => {
    expect(denied).toContain('access denied')
  })

  test('it does not read as an absence of data', () => {
    // FR-DA-11. "No data" here is the sentence that teaches a Viewer the figure
    // is zero when in fact it exists and is being withheld.
    expect(denied).not.toContain('no data')
  })

  test('it says the figures exist', () => {
    // Saying only "denied" leaves it ambiguous whether there was anything to see.
    expect(denied).toContain('withheld')
  })

  test('it does not read as a failure', () => {
    expect(denied).not.toContain('could not load')
  })
})

describe('withdrawn withholds rather than shows', () => {
  const withdrawn = words(draw('withdrawn'))

  test('it names the withdrawal', () => {
    expect(withdrawn).toContain('withdrawn')
  })

  test('it says why nothing is shown', () => {
    // FR-DP-14. The failure this prevents is a card that keeps drawing the last
    // figures it had, which a Viewer has no way to know are no longer current.
    expect(withdrawn).toContain('withheld')
    expect(withdrawn).toContain('current')
  })

  test('it is not the failure treatment', () => {
    expect(withdrawn).not.toContain('could not load')
  })
})

describe('the two that were always here still behave', () => {
  test('empty is quiet and is not an error', () => {
    const empty = words(draw('empty'))
    expect(empty).toContain('no data')
    expect(empty).not.toContain('denied')
    expect(empty).not.toContain('could not load')
  })

  test('failed carries the reason it was given', () => {
    expect(words(draw('failed', { errorMessage: 'Upstream timed out.' }))).toContain(
      'upstream timed out',
    )
  })

  test('a caller can still override the empty wording', () => {
    expect(words(draw('empty', { emptyMessage: 'Nothing in this period.' }))).toContain(
      'nothing in this period',
    )
  })
})

describe('accessibility', () => {
  test('every non-ready state is announced', () => {
    // A card that changes to "access denied" without a live region changes
    // silently for anyone not looking at it.
    for (const state of STATES.filter((entry) => entry !== 'ready')) {
      expect(draw(state)).toMatch(/role="status"|aria-live|aria-busy/)
    }
  })
})

/*
 * A tile you cannot identify is a tile you cannot act on.
 *
 * `bare` drops the header because a stat tile carries its own label inside
 * `StatTile` and a header would repeat it. Every state other than `ready`
 * renders a placeholder instead, and the label goes with it — so four empty
 * tiles in a column said "No data for this selection" and nothing else, with no
 * way to tell which Widget was which or which Dataset to go and look at.
 */
describe('a bare card keeps its title when it has no number', () => {
  const card = (state: WidgetState) =>
    renderToStaticMarkup(
      <WidgetCard title="Total registered users" state={state} bare>
        <div>1,420</div>
      </WidgetCard>,
    )

  test('the header is dropped only while the tile shows its own value', () => {
    expect(card('ready')).not.toContain('Total registered users')
  })

  test.each(['empty', 'failed', 'denied', 'withdrawn', 'loading'] as const)(
    'and is present for %s',
    (state) => {
      expect(card(state)).toContain('Total registered users')
    },
  )
})
