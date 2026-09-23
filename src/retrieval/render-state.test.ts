/**
 * The six render states, and the one that has to explain itself.
 */

import { describe, expect, test } from 'bun:test'
import { resolveFailure } from './render-state'
import { ApiError } from '../api/errors'

/*
 * What a failed widget says.
 *
 * The four Peniremit Dashboards were created without `from`/`to`, which both
 * Datasets require, and every widget on them rendered "Query rejected" — the
 * envelope's message, which carries no information — while the response beside
 * it named the two missing parameters in `data.violations`.
 */
describe('a rejected query says what was rejected', () => {
  const rejected = (violations: { field: string; message: string }[]) =>
    new ApiError({
      kind: 'invalid',
      path: '/v1/datasets/x/query',
      status: 400,
      message: 'Query rejected',
      violations,
    })

  const messageOf = (error: unknown) => {
    const state = resolveFailure(error)
    if (state.status !== 'failed') throw new Error('expected a failure')
    return state.message
  }

  test('the violated field and the reason both reach the card', () => {
    expect(messageOf(rejected([{ field: 'from', message: 'is required by this Dataset' }]))).toBe(
      'Query rejected: `from` is required by this Dataset',
    )
  })

  test('every violation, not the first', () => {
    /*
     * The verifier reports them all at once so one round trip fixes the whole
     * declaration. Showing one at a time turns that into four.
     */
    const message = messageOf(
      rejected([
        { field: 'from', message: 'is required by this Dataset' },
        { field: 'to', message: 'is required by this Dataset' },
      ]),
    )
    expect(message).toContain('`from`')
    expect(message).toContain('`to`')
  })

  test('an error with no violations keeps its own message', () => {
    // A 503 has nothing to enumerate and "Temporarily unavailable" is already
    // the whole story.
    expect(messageOf(new Error('Temporarily unavailable.'))).toBe('Temporarily unavailable.')
  })

  test('something that is not an Error still says something', () => {
    expect(messageOf('nope')).toBe('Retrieval failed.')
  })
})
