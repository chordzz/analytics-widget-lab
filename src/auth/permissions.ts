/**
 * What the UI may offer — from `/v1/me`, not from a guess.
 *
 * **This is not access control.** The API enforces; every route checks the
 * caller's permission and answers `403` regardless of what we render. This
 * decides which buttons are worth showing, and that difference sets the whole
 * design:
 *
 *   - offering an action the caller lacks costs them one `403` they can read
 *   - hiding an action the caller *has* makes the product look broken, with
 *     nothing on screen to explain it and no way for them to find out
 *
 * The second is much worse, so every ambiguity below resolves toward showing.
 *
 * **The key format, settled by a live response on 16 September.** IAM answers
 * with the fully qualified form the routes document:
 *
 * ```
 * "holdings.analytics::dashboard.create": true
 * "holdings.analytics::dataset.read": true
 * ```
 *
 * The change log's `/v1/me` example showed bare `dataset.read` and a
 * `dashboard.write` that matches no route; neither appears in the real map, so
 * the example was wrong. Our own gate names stay short and readable, and the
 * incoming key is compared on the part after `::` — which is what makes them
 * meet. That normalisation is load-bearing rather than defensive: without it
 * nothing matches and the whole product greys out.
 */

import type { Actor } from './port'

/**
 * Each gate and the key that opens it.
 *
 * One key each, now that the real map is known. An earlier version accepted
 * `dashboard.write` as a coarse key covering create, update, delete and publish
 * — tolerance for a name that appeared only in the change log's example and
 * exists nowhere in IAM. Speculative aliases are not free: a key nobody issues
 * cannot help, and if one were ever issued meaning something narrower than the
 * four it stood for, this would over-grant silently.
 *
 * `analytics.administer` is deliberately *not* a superuser key here either. The
 * spec scopes it to Source System registration — *"it decides where Analytics
 * may forward queries"* — which is a different surface from composing
 * dashboards, and the live map grants it alongside the dashboard keys rather
 * than in place of them.
 */
export const PERMISSION_KEYS = {
  'dashboard.read': ['dashboard.read'],
  'dashboard.create': ['dashboard.create'],
  'dashboard.update': ['dashboard.update'],
  'dashboard.delete': ['dashboard.delete'],
  'dashboard.publish': ['dashboard.publish'],
  'dashboard.share': ['dashboard.share'],
  'dataset.read': ['dataset.read'],
} as const

export type Permission = keyof typeof PERMISSION_KEYS

/**
 * Three answers, not two.
 *
 * `unknown` is the one that matters and the API asks for it by name: *"absent
 * means unknown, not denied."* IAM being unreachable must not read as a caller
 * who may do nothing.
 */
export type PermissionDecision = 'granted' | 'denied' | 'unknown'

/** `holdings.analytics::dashboard.create` and `dashboard.create` are the same key. */
const bare = (key: string): string => {
  const marker = key.lastIndexOf('::')
  return marker === -1 ? key : key.slice(marker + 2)
}

export function decide(
  permissions: Record<string, boolean> | undefined,
  permission: Permission,
): PermissionDecision {
  /*
   * Absent *or* empty is unknown.
   *
   * The contract only names the absent case, but an empty map is the same
   * situation wearing different clothes: a caller who genuinely held nothing
   * could not have reached this screen, since listing dashboards needs
   * `dashboard.read`. Reading `{}` as a wall of denials would blank the product
   * for someone whose only problem is a degraded lookup — and a real `/v1/me`
   * answered exactly `{}` as recently as 15 September.
   */
  if (!permissions || Object.keys(permissions).length === 0) return 'unknown'

  const held = new Map<string, boolean>()
  for (const [key, value] of Object.entries(permissions)) held.set(bare(key), value === true)

  for (const candidate of PERMISSION_KEYS[permission]) {
    if (held.get(bare(candidate)) === true) return 'granted'
  }

  // Their rule, and the only case where a populated map means no: every key we
  // know of for this gate is either absent or explicitly false.
  return 'denied'
}

/**
 * Whether to offer the action. `unknown` offers it.
 *
 * The asymmetry is deliberate and is the whole point of the module: a wrongly
 * offered action ends in a `403` the caller can act on, and a wrongly hidden one
 * ends in a support conversation.
 */
export const may = (actor: Actor | null, permission: Permission): boolean =>
  decide(actor?.permissions, permission) !== 'denied'

/** For copy that should only appear when we are certain. */
export const isDenied = (actor: Actor | null, permission: Permission): boolean =>
  decide(actor?.permissions, permission) === 'denied'
