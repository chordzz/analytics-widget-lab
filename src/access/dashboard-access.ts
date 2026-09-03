/**
 * Who may see a Dashboard.
 *
 * ## The FR-DA-06 / FR-DA-07 tension, and how it is read here
 *
 * FR-DA-06 says a Share Grant *extends* visibility to a named individual or
 * group. FR-DA-07 says a Grant "shall refine who within the Scope sees the
 * Dashboard; it shall not extend visibility beyond the Scope." Read literally
 * together, a Grant both extends and does not extend.
 *
 * Taking "extends" as the operative word makes Grants vacuous: a recipient must
 * satisfy the Scope for the Grant to take effect (FR-DA-08), and anyone
 * satisfying the Scope can already see the Dashboard — so the Grant would never
 * change any outcome.
 *
 * Taking "refine" as the operative word gives both requirements work to do, so
 * that is the reading implemented:
 *
 *   - Scope is the outer boundary. Nothing reaches past it, ever.
 *   - With **no** Grants, everyone satisfying the Scope sees the Dashboard.
 *   - With Grants, only the named recipients within the Scope see it — the
 *     Grants narrow the audience.
 *   - The Author always sees their own Dashboard.
 *
 * This satisfies UC-05 exactly and leaves neither requirement doing nothing.
 * It is an interpretation, not a deduction, and is recorded as **Finding 11**
 * for confirmation — the alternative reading (Grants widen within an otherwise
 * narrower default) is defensible too, and the two produce different behaviour
 * the moment a Dashboard has one Grant.
 */

import type { AuthorizationPort } from './port'
import type { Dashboard, DashboardScope, ShareGrant } from '../domain/dashboard'
import type { ViewerIdentity } from '../retrieval/port'

export interface GrantVerdict {
  grantId: string
  /** FR-DA-08 — a Grant naming someone outside the Scope does not take effect. */
  effective: boolean
  /** Why not, in terms the Author can act on. */
  reason?: string
  /** How many named identities actually fall inside the Scope. */
  reach: number
}

function describeScopeShort(scope: DashboardScope): string {
  switch (scope.kind) {
    case 'personal':
      return 'Personal'
    case 'organization-wide':
      return 'Organization-wide'
    case 'organizational-scope':
      return scope.label
  }
}

/** FR-DA-07, FR-DA-08 — evaluate one Grant against the Dashboard's Scope. */
export async function evaluateGrant(
  grant: ShareGrant,
  scope: DashboardScope,
  authorization: AuthorizationPort,
): Promise<GrantVerdict> {
  const recipients = await authorization.resolveRecipient(grant)

  if (recipients.length === 0) {
    return {
      grantId: grant.id,
      effective: false,
      reach: 0,
      reason: `${grant.recipientLabel} could not be resolved to any identity.`,
    }
  }

  const inScope = await Promise.all(
    recipients.map((recipient) => authorization.satisfiesScope(scope, recipient)),
  )
  const reach = inScope.filter(Boolean).length

  if (reach === 0) {
    return {
      grantId: grant.id,
      effective: false,
      reach: 0,
      reason:
        scope.kind === 'personal'
          ? `${grant.recipientLabel} cannot be granted access while the Scope is Personal — a Personal Dashboard is visible to you alone. Widen the Scope first.`
          : `${grant.recipientLabel} does not belong to ${describeScopeShort(scope)}, so this Grant does not take effect. A Grant refines who within the Scope sees the Dashboard; it cannot reach beyond it.`,
    }
  }

  return { grantId: grant.id, effective: true, reach }
}

/**
 * The parts of a Dashboard that decide who may see it.
 *
 * Narrower than `Dashboard` on purpose. Access turns on four fields, and asking
 * for the whole record would couple these rules to the Widgets and Placements
 * they have no opinion about — which is what stopped the product module reusing
 * them, since its board keys `WidgetSpec` rather than `Widget` (D17).
 */
export type AccessSubject = Pick<Dashboard, 'authorId' | 'status' | 'scope' | 'shareGrants'>

export async function evaluateGrants(
  dashboard: AccessSubject,
  authorization: AuthorizationPort,
): Promise<GrantVerdict[]> {
  return Promise.all(
    dashboard.shareGrants.map((grant) => evaluateGrant(grant, dashboard.scope, authorization)),
  )
}

/** FR-DA-05 — reaching a Dashboard at any Scope requires an authenticated identity. */
export async function canViewDashboard(
  dashboard: AccessSubject,
  viewer: ViewerIdentity,
  authorization: AuthorizationPort,
): Promise<boolean> {
  if (dashboard.authorId === viewer.id) return true

  // FR-CO-04 — a draft is the Author's alone, whatever the Scope says.
  if (dashboard.status === 'draft') return false

  if (!(await authorization.satisfiesScope(dashboard.scope, viewer))) return false

  const effective = (await evaluateGrants(dashboard, authorization)).filter((v) => v.effective)
  if (effective.length === 0) return true

  const named = await Promise.all(
    dashboard.shareGrants
      .filter((grant) => effective.some((v) => v.grantId === grant.id))
      .map(async (grant) => {
        const recipients = await authorization.resolveRecipient(grant)
        return recipients.some((recipient) => recipient.id === viewer.id)
      }),
  )
  return named.some(Boolean)
}

export async function visibleDashboards<T extends AccessSubject>(
  dashboards: T[],
  viewer: ViewerIdentity,
  authorization: AuthorizationPort,
): Promise<T[]> {
  const decisions = await Promise.all(
    dashboards.map((dashboard) => canViewDashboard(dashboard, viewer, authorization)),
  )
  return dashboards.filter((_, index) => decisions[index])
}
