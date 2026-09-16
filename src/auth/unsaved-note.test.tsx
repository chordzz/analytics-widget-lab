/**
 * A note about a board that did not save, said as what is actually true.
 *
 * It read "did not save — retrying" for every failure, which was wrong twice
 * over. Nothing is retrying: the store tries again on the *next save*, and a
 * save only happens when the board changes, so stop touching it and nothing
 * ever runs again. And a `400` will never succeed — the payload is what the API
 * refused — so an Author waiting for that retry waits for ever.
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { UnsavedNote } from './SessionGate'

const words = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

const note = (entries: { name: string; retries: boolean; why: string }[]) =>
  words(renderToStaticMarkup(<UnsavedNote entries={entries} onDismiss={() => {}} />))

describe('a failure that will be tried again', () => {
  test('says so, without claiming something is in flight', () => {
    const said = note([{ name: 'Finance daily', retries: true, why: 'unavailable' }])
    expect(said).toContain('will retry')
    // "retrying" describes a request in progress. There is none — the retry
    // happens on the Author's next edit.
    expect(said).not.toContain('retrying')
  })
})

describe('a failure that will not', () => {
  test('does not promise a retry', () => {
    const said = note([{ name: 'Finance daily', retries: false, why: 'Dashboard rejected' }])
    expect(said).not.toContain('will retry')
  })

  test('and says what would actually change the outcome', () => {
    // Editing is the only thing that alters the payload, which is what the API
    // refused. Waiting changes nothing.
    expect(note([{ name: 'Finance daily', retries: false, why: 'x' }])).toContain('editing it')
  })

  test('the two read differently', () => {
    const transient = note([{ name: 'A', retries: true, why: 'x' }])
    const rejected = note([{ name: 'A', retries: false, why: 'x' }])
    expect(transient).not.toEqual(rejected)
  })
})

describe('more than one', () => {
  test('counts them rather than listing them', () => {
    const said = note([
      { name: 'A', retries: true, why: 'x' },
      { name: 'B', retries: true, why: 'x' },
    ])
    expect(said).toContain('2 boards')
  })

  test('one is named, because a name is what an Author can act on', () => {
    expect(note([{ name: 'Finance daily', retries: true, why: 'x' }])).toContain('"Finance daily"')
  })
})
