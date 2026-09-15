/**
 * The note shown when a Share Grant could not be revoked.
 *
 * Small, and worth its own test for one reason: it says something about who can
 * see a board, and the wording is the whole of its value. A message that reads
 * as a transient error invites the Author to wait for a retry that will never
 * come — the API has no route to revoke a Grant, so nothing is pending.
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { UnrevokedNote } from './SessionGate'

const words = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    // React renders the entities as the characters themselves; normalise both
    // so the assertions are about wording rather than about typography.
    .replace(/&ldquo;|&rdquo;|[\u201c\u201d]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()

const render = (entries: { board: string; who: string }[]) =>
  renderToStaticMarkup(<UnrevokedNote entries={entries} onDismiss={() => {}} />)

describe('it states what is true, not what failed', () => {
  test('it names the person and the board', () => {
    expect(words(render([{ board: 'Finance daily', who: 'Ada' }]))).toBe(
      'Ada still sees "Finance daily"',
    )
  })

  test('it does not read as a retry', () => {
    /*
     * "Could not revoke" and "retrying" both suggest something is in flight.
     * Nothing is: there is no DELETE route, so the Author has to act elsewhere
     * rather than wait.
     */
    const said = words(render([{ board: 'Finance daily', who: 'Ada' }])).toLowerCase()
    for (const misleading of ['retrying', 'failed', 'could not', 'try again']) {
      expect(said).not.toContain(misleading)
    }
  })

  test('several are summarised rather than listed', () => {
    const said = words(
      render([
        { board: 'Finance daily', who: 'Ada' },
        { board: 'Finance daily', who: 'Bo' },
        { board: 'Payroll', who: 'Cy' },
      ]),
    )
    expect(said).toBe('Ada still sees "Finance daily" and 2 more')
  })
})
