/**
 * The partial-result note — D27's second half.
 *
 * The first half found the marker; this is the half a Viewer can see, and
 * without it the two halves are worth nothing. An unread `meta.partial` and an
 * absent one draw the same chart, which the integration guide names outright:
 * *"a chart missing half its data and not saying so is the worst outcome
 * available."*
 *
 * The load-bearing assertions are that it is **not a seventh state**, that it is
 * **visible without hover**, and that it reaches a **bare card** — a stat tile
 * has no header, and a single wrong number is the easiest thing on a dashboard
 * to screenshot into a deck.
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { WidgetCard } from './WidgetCard'
import { resolveRenderState } from '../../retrieval/render-state'
import { WIDGET_RENDER_STATUSES } from '../../retrieval/render-state'
import type { WidgetState } from './WidgetCard'
import type { RetrievalOutcome } from '../../retrieval/port'

const draw = (props: Record<string, unknown> = {}) =>
  renderToStaticMarkup(
    <WidgetCard title="Settlements" state="ready" {...props}>
      <p>THE-CHART</p>
    </WidgetCard>,
  )

const words = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

const partial = { reason: 'date range exceeds retention; returned 2026-05-01 onward' }

describe('it qualifies an answer rather than replacing one', () => {
  test('the picture is still drawn', () => {
    /*
     * The distinction from every other non-ready state. The rows are real and
     * the Viewer is authorized; there is simply less here than they asked for,
     * so withholding the chart would overstate the problem as badly as hiding
     * the note understates it.
     */
    expect(draw({ partial })).toContain('THE-CHART')
  })

  test('and it did not become a seventh state', () => {
    // The register's whole reason for six. A status list that grew here would
    // mean every switch over it in the codebase now has a hole.
    expect(WIDGET_RENDER_STATUSES).toHaveLength(6)
    expect(WIDGET_RENDER_STATUSES).not.toContain('partial')
  })

  test('an unqualified answer says nothing at all', () => {
    const said = words(draw())
    expect(said).not.toContain('Part of the data')
    expect(said).not.toContain('could be served')
  })
})

describe('it is visible, not hidden behind a hover', () => {
  test('the reason is in the document text', () => {
    /*
     * A tooltip is invisible to anyone on a touchscreen, anyone glancing at a
     * wall display, and anyone screenshotting a figure into a deck — three of
     * the ways a wrong number travels furthest.
     */
    expect(words(draw({ partial }))).toContain('date range exceeds retention')
  })

  test('and it is announced', () => {
    // A sighted reader gets it from the rule down the side; everyone else needs
    // this. `status` rather than `alert`: nothing is broken, so nothing should
    // interrupt.
    expect(draw({ partial })).toContain('role="status"')
  })

  test('a publisher who gave no reason still produces a note', () => {
    // `meta.partial` without a reason is still the important half. Rendering
    // nothing because the explanation is missing would hide the fact.
    const said = words(draw({ partial: { reason: null } }))
    expect(said).toContain('Part of the data')
    expect(said).toContain('gave no reason')
  })
})

describe('a bare card shows it too', () => {
  test('a stat tile has no header and still carries the note', () => {
    /*
     * Where it matters most. A chart missing points at least looks sparse; a
     * single figure missing half its input looks exactly like a correct figure,
     * and it is the thing people copy into a slide.
     */
    const said = words(
      renderToStaticMarkup(
        <WidgetCard title="Revenue" state="ready" bare partial={partial}>
          <p>US$35.7m</p>
        </WidgetCard>,
      ),
    )
    expect(said).toContain('US$35.7m')
    expect(said).toContain('Part of the data')
  })
})

describe('an empty answer that was truncated says something different', () => {
  test('it says so once, in the slot an empty card already has', () => {
    /*
     * An empty card has one message slot and the state panel fills it. Rendering
     * the note as well put "No data for this selection" directly above "None of
     * this range could be served" — two different accounts of one card, and the
     * first of them wrong.
     */
    const said = words(draw({ state: 'empty', partial }))
    expect(said).not.toContain('No data for this selection')
    expect(said.match(/could be served/g)).toHaveLength(1)
  })

  test('and it is warned rather than muted', () => {
    // Muted is right for "there is genuinely nothing here" and wrong for "the
    // source refused the range" — the second is something to act on.
    expect(draw({ state: 'empty', partial })).toContain('a-placeholder--warning')
    expect(draw({ state: 'empty' })).toContain('a-placeholder--muted')
  })

  test('it does not claim there is nothing here', () => {
    /*
     * "Nothing here" is a claim about the data. A partial empty means the source
     * served *none* of what was asked for, which is a claim about the request —
     * and telling someone their range is empty when it was actually refused
     * sends them looking in the wrong place.
     */
    const said = words(draw({ state: 'empty', partial }))
    expect(said).toContain('None of this range could be served')
  })

  test('while a plain empty still reads as empty', () => {
    const said = words(draw({ state: 'empty' }))
    expect(said).not.toContain('could be served')
  })
})

describe('it never appears on a state that is withholding figures', () => {
  const withholding: WidgetState[] = ['denied', 'withdrawn', 'failed', 'loading']

  for (const state of withholding) {
    test(`${state} shows no partial note`, () => {
      /*
       * `denied` and `withdrawn` are deliberately withholding, and a note about
       * incomplete data alongside them implies figures exist that are being
       * shown. The card enforces this rather than trusting every call site.
       */
      expect(words(draw({ state, partial }))).not.toContain('Part of the data')
    })
  }
})

describe('the marker survives the resolver', () => {
  test('rows carry it into ready', () => {
    const outcome: RetrievalOutcome = {
      kind: 'rows',
      rows: [{ region: 'EMEA', revenue: 1 }],
      totalCount: 1,
      partial: { reason: 'shard down' },
    }
    expect(resolveRenderState(outcome)).toMatchObject({
      status: 'ready',
      partial: { reason: 'shard down' },
    })
  })

  test('and empty carries it too', () => {
    expect(resolveRenderState({ kind: 'empty', partial: { reason: 'retention' } })).toMatchObject({
      status: 'empty',
      partial: { reason: 'retention' },
    })
  })

  test('a complete answer carries nothing', () => {
    expect(
      resolveRenderState({ kind: 'rows', rows: [{ a: 1 }], totalCount: 1 }).status,
    ).toBe('ready')
    expect(
      (resolveRenderState({ kind: 'rows', rows: [{ a: 1 }], totalCount: 1 }) as { partial?: unknown })
        .partial,
    ).toBeUndefined()
  })

  test('denial cannot be partial, because there is nothing to be part of', () => {
    // Structural: `partial` is not on those variants, so this is a type-level
    // guarantee the test merely records.
    expect(resolveRenderState({ kind: 'denied' })).toEqual({ status: 'denied' })
    expect(resolveRenderState({ kind: 'withdrawn' })).toEqual({ status: 'withdrawn' })
  })
})
