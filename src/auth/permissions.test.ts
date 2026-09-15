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

/**
 * The map IAM actually returns, captured from `/v1/me` on 16 September.
 *
 * Verbatim, including the two publisher keys we never ask about — a fixture
 * trimmed to what the tests need would stop being evidence of anything.
 */
const LIVE_PERMISSIONS: Record<string, boolean> = {
  'holdings.analytics::analytics.administer': true,
  'holdings.analytics::dashboard.create': true,
  'holdings.analytics::dashboard.delete': true,
  'holdings.analytics::dashboard.publish': true,
  'holdings.analytics::dashboard.read': true,
  'holdings.analytics::dashboard.share': true,
  'holdings.analytics::dashboard.update': true,
  'holdings.analytics::dataset.publish': true,
  'holdings.analytics::dataset.read': true,
  'holdings.analytics::dataset.withdraw': true,
}

describe('the keys IAM actually sends', () => {
  test('every gate opens against the real map', () => {
    /*
     * The one test that would have caught a wrong guess at the key format. Ours
     * are short and readable; IAM's are fully qualified, and the normalisation
     * on `::` is the only thing that makes them meet. Without it nothing matches
     * and every control on the product greys out at once.
     */
    for (const gate of [
      'dashboard.read',
      'dashboard.create',
      'dashboard.update',
      'dashboard.delete',
      'dashboard.publish',
      'dashboard.share',
      'dataset.read',
    ] as const) {
      expect(decide(LIVE_PERMISSIONS, gate)).toBe('granted')
    }
  })

  test('a bare key works too, in case the qualifier ever drops', () => {
    expect(decide({ 'dashboard.create': true }, 'dashboard.create')).toBe('granted')
  })

  test('and an explicit false is honoured through the qualifier', () => {
    expect(decide({ 'holdings.analytics::dashboard.create': false }, 'dashboard.create')).toBe(
      'denied',
    )
  })
})

describe('keys that do not exist grant nothing', () => {
  test('`dashboard.write` is not a key IAM issues', () => {
    /*
     * It appeared in the change log's `/v1/me` example and matches no route; the
     * live map confirms IAM never sends it. It was accepted here as a coarse
     * alias for create, update, delete and publish — tolerance for a phantom,
     * and if one were ever issued meaning something narrower, the alias would
     * have over-granted silently.
     */
    expect(decide({ 'dashboard.write': true }, 'dashboard.create')).toBe('denied')
  })

  test('administering Analytics is not a superuser key', () => {
    /*
     * The spec scopes it to Source System registration — "it decides where
     * Analytics may forward queries" — a different surface from composing
     * dashboards. The live map grants it *alongside* the dashboard keys rather
     * than in place of them, so nothing needs it to imply them.
     */
    const admin = { 'holdings.analytics::analytics.administer': true }
    expect(decide(admin, 'dashboard.create')).toBe('denied')
    expect(decide(admin, 'dashboard.share')).toBe('denied')
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
