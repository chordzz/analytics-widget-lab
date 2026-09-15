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
 * Two of those ambiguities are real and unresolved in the published contract.
 *
 * **The key format.** Routes are documented as
 * `holdings.analytics::dashboard.create`, while the change log's own `/v1/me`
 * example answers with bare `dataset.read`. One spec even says
 * `holdings.penilabs.analytics::dataset.read`, a third prefix. Matching on the
 * exact string would mean that a wrong guess hides the entire product — so keys
 * are compared on the part after `::`, which is identical under all three.
 *
 * **The write family.** The same example carries `dashboard.write`, which
 * matches no documented route: the routes are `create`, `update`, `delete`,
 * `publish` and `share`. Rather than pick, a coarse key grants the fine ones it
 * plainly covers.
 */

import type { Actor } from './port'

/**
 * A caller holding this may do anything. Named separately because it is
 * governance rather than a capability — it decides where Analytics may forward
 * queries — and a holder should not be blocked by a missing finer key.
 */
const ADMINISTER = 'analytics.administer'

/**
 * Each gate, and every key that opens it.
 *
 * The first entry is the documented route permission; the rest are the coarser
 * keys that plainly include it. A caller holding `dashboard.write` can write
 * dashboards, whatever the finer name for this particular write turns out to be.
 */
export const PERMISSION_KEYS = {
  'dashboard.read': ['dashboard.read'],
  'dashboard.create': ['dashboard.create', 'dashboard.write'],
  'dashboard.update': ['dashboard.update', 'dashboard.write'],
  'dashboard.delete': ['dashboard.delete', 'dashboard.write'],
  'dashboard.publish': ['dashboard.publish', 'dashboard.write'],
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

  if (held.get(bare(ADMINISTER)) === true) return 'granted'

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
