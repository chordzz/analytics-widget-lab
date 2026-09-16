/**
 * Where a widget is headed, decided before the composer opens.
 *
 * The button used to navigate and leave the destination implicit — the widget
 * landed on whichever board happened to be open, or on a blank draft the visit
 * quietly created. Both are defensible defaults; neither was ever stated.
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ComposeIntentProvider, useComposeIntent } from './useComposeIntent'
import type { ComposeIntent } from './useComposeIntent'

/** Drives the hook through one render, since there is no DOM test runner. */
function capture(run: (api: ReturnType<typeof useComposeIntent>) => void): ComposeIntent | null {
  let taken: ComposeIntent | null = null
  function Probe() {
    const api = useComposeIntent()
    run(api)
    taken = api.takeIntent()
    return null
  }
  renderToStaticMarkup(
    <ComposeIntentProvider>
      <Probe />
    </ComposeIntentProvider>,
  )
  return taken
}

describe('a chosen board travels with the dataset', () => {
  test('the destination is carried', () => {
    const taken = capture((api) => api.composeWith('peniremit.profit', 'srv-7'))
    expect(taken).toEqual({ datasetId: 'peniremit.profit', boardId: 'srv-7' })
  })

  test('"New dashboard" is an explicit null, not a missing answer', () => {
    /*
     * The distinction the type exists for. `null` says an Author asked for a
     * new board; collapsing it with "nobody chose" would make that choice
     * silently adopt whichever board was last open.
     */
    expect(capture((api) => api.composeWith('peniremit.profit', null))?.boardId).toBeNull()
  })

  test('omitting it defaults to the same explicit null', () => {
    // Callers that never offered a choice — there is one — still produce an
    // intent the Create screen can read without a special case.
    expect(capture((api) => api.composeWith('peniremit.profit'))?.boardId).toBeNull()
  })
})

describe('the intent is consumed exactly once', () => {
  test('a second take finds nothing', () => {
    /*
     * React runs effects twice in development. Going through state alone, both
     * passes would see the same id and the second would re-open a composer the
     * first had already opened.
     */
    let second: ComposeIntent | null = null
    function Probe() {
      const api = useComposeIntent()
      api.composeWith('peniremit.profit', 'srv-7')
      api.takeIntent()
      second = api.takeIntent()
      return null
    }
    renderToStaticMarkup(
      <ComposeIntentProvider>
        <Probe />
      </ComposeIntentProvider>,
    )
    expect(second).toBeNull()
  })

  test('nothing pending reads as nothing', () => {
    expect(capture(() => {})).toBeNull()
  })
})
