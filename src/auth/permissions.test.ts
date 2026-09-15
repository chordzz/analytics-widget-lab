/**
 * Which buttons to show.
 *
 * The tests that matter are the ones about *not knowing*. A permission system
 * that hides things when it is unsure looks identical to a broken product, and
 * the person it happens to has no way to tell the difference — so `unknown`
 * behaving like `granted` is the property under test, not an implementation
 * detail of it.
 */

import { describe, expect, test } from 'bun:test'
import { decide, isDenied, may } from './permissions'
import type { Actor } from './port'

const actor = (permissions?: Record<string, boolean>): Actor => ({
  id: 'u1',
  email: 'ada@penilabs.com',
  fullName: 'Ada Lovelace',
  ...(permissions === undefined ? {} : { permissions }),
})

describe('not knowing is not denying', () => {
  test('an absent map offers everything', () => {
    // The API's own words: "absent means unknown, not denied." It answers this
    // way when IAM's permission lookup fails, which is a degradation of a
    // service the caller does not use and should not cost them the product.
    expect(may(actor(), 'dashboard.create')).toBe(true)
    expect(decide(undefined, 'dashboard.create')).toBe('unknown')
  })

  test('an empty map does too', () => {
    /*
     * Not in the contract, and defensible anyway: a caller genuinely holding
     * nothing could not have reached a screen at all, because listing
     * dashboards needs `dashboard.read`. A real `/v1/me` answered exactly `{}`
     * on 15 September, and reading that as a wall of denials would have blanked
     * the product for someone whose only problem was a stale lookup.
     */
    expect(decide({}, 'dashboard.create')).toBe('unknown')
    expect(may(actor({}), 'dashboard.create')).toBe(true)
  })

  test('in local-auth mode nothing is hidden', () => {
    // `IAM_AUTH_DISABLED=true` skips IAM entirely and returns a bare actor. The
    // fallback exists to unblock the frontend when IAM is down; hiding the UI
    // in it would defeat the point of having it.
    expect(may(actor(), 'dashboard.share')).toBe(true)
  })

  test('but "denied" copy waits until we are certain', () => {
    // A sentence explaining a restriction that may not exist is worse than
    // silence, so the two questions are asked separately.
    expect(isDenied(actor(), 'dashboard.create')).toBe(false)
    expect(isDenied(actor({ 'dashboard.read': true }), 'dashboard.create')).toBe(true)
  })
})

describe('the key format is not guessed at', () => {
  /*
   * Routes are documented as `holdings.analytics::dashboard.create`; the change
   * log's `/v1/me` example answers with bare `dataset.read`; one spec line says
   * `holdings.penilabs.analytics::dataset.read`. Three spellings, and matching
   * the wrong one exactly would hide the whole product.
   */
  const spellings = [
    'dashboard.create',
    'holdings.analytics::dashboard.create',
    'holdings.penilabs.analytics::dashboard.create',
  ]

  for (const key of spellings) {
    test(`\`${key}\` grants it`, () => {
      expect(decide({ [key]: true }, 'dashboard.create')).toBe('granted')
    })
  }

  test('and a false decision is honoured under any of them', () => {
    expect(decide({ 'holdings.analytics::dashboard.create': false }, 'dashboard.create')).toBe(
      'denied',
    )
  })
})

describe('a coarse key opens the fine gates it covers', () => {
  test('`dashboard.write` covers create, update, delete and publish', () => {
    /*
     * It appears in the change log's own example and matches no documented
     * route — the routes are create, update, delete, publish and share. Rather
     * than pick one reading, a key that plainly includes an action grants it.
     */
    const writer = { 'dashboard.write': true }
    for (const gate of ['dashboard.create', 'dashboard.update', 'dashboard.delete', 'dashboard.publish'] as const) {
      expect(decide(writer, gate)).toBe('granted')
    }
  })

  test('but not share, which is its own route and its own key', () => {
    // Sharing changes who can see something. It is not a write in the same
    // sense, and the API gives it a separate permission for that reason.
    expect(decide({ 'dashboard.write': true }, 'dashboard.share')).toBe('denied')
  })

  test('the administrator key opens everything', () => {
    const admin = { 'holdings.analytics::analytics.administer': true }
    expect(decide(admin, 'dashboard.share')).toBe('granted')
    expect(decide(admin, 'dataset.read')).toBe('granted')
  })
})

describe('a populated map is taken at its word', () => {
  test('a key that is present and true grants', () => {
    expect(may(actor({ 'dashboard.publish': true }), 'dashboard.publish')).toBe(true)
  })

  test('a key that is present and false denies', () => {
    expect(may(actor({ 'dashboard.publish': false }), 'dashboard.publish')).toBe(false)
  })

  test('a key that is missing from a populated map denies', () => {
    // Their rule: "a key absent from the map is denied." It applies to a map
    // that has something in it — an empty one is the unknown case above.
    expect(may(actor({ 'dashboard.read': true }), 'dashboard.publish')).toBe(false)
  })
})
