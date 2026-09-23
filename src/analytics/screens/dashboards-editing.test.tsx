/**
 * Who is offered the edit affordances on a Dashboard they are looking at.
 *
 * Two gates that fail differently. The permission is unknown-offers, because
 * the API enforces regardless and a hidden button explains nothing. Authorship
 * is not: a board reaches someone else's screen through a Share Grant or a
 * Scope, and offering every reader an Edit widgets button that always ends in a
 * refusal is a button that does not work.
 */

import { describe, expect, test } from 'bun:test'
import { decide } from '../../auth/permissions'

/** The gate as `DashboardsScreen` computes it. */
const mayEdit = (
  permissions: Record<string, boolean> | undefined,
  authorId: string,
  viewerId: string,
): boolean => decide(permissions, 'dashboard.update') !== 'denied' && authorId === viewerId

const held = { 'holdings.analytics::dashboard.update': true }
const refused = { 'holdings.analytics::dashboard.update': false }

describe('the author', () => {
  test('is offered editing when the permission is held', () => {
    expect(mayEdit(held, 'me', 'me')).toBe(true)
  })

  test('and when the permission map is unknown', () => {
    // IAM degraded must not read as a caller who may do nothing.
    expect(mayEdit(undefined, 'me', 'me')).toBe(true)
    expect(mayEdit({}, 'me', 'me')).toBe(true)
  })

  test('but not when it is explicitly refused', () => {
    expect(mayEdit(refused, 'me', 'me')).toBe(false)
  })
})

describe('everyone else', () => {
  test('is not offered editing, however the permission reads', () => {
    /*
     * The case this gate exists for. A reader with `dashboard.update` on their
     * own boards would otherwise see Edit widgets on a board shared with them, and
     * every save would be refused.
     */
    expect(mayEdit(held, 'someone-else', 'me')).toBe(false)
    expect(mayEdit(undefined, 'someone-else', 'me')).toBe(false)
  })

  test('including an Administrator, which is a known cost', () => {
    /*
     * The API allows "creator or Administrator" and nothing in the model says
     * who an Administrator is — `ViewerIdentity` carries no flag, `/v1/me`
     * publishes no role, and `analytics.administer` was ruled out as a
     * superuser key. Pinned so restoring it is a deliberate change made when
     * that signal exists, rather than a rule quietly loosened.
     */
    const administrator = {
      'holdings.analytics::dashboard.update': true,
      'holdings.analytics::analytics.administer': true,
    }
    expect(mayEdit(administrator, 'someone-else', 'me')).toBe(false)
  })
})
