/**
 * Stand-in for the IAM context.
 *
 * Everything here is a lookup, never a computation: the fake mirrors what IAM
 * would answer rather than modelling why. That keeps the shape of the port
 * honest — if this file ever needed real logic, it would mean Analytics had
 * started reasoning about authorization, which is exactly the coupling the port
 * exists to prevent.
 */

import type { AuthorizationPort, OrgScopeRef } from './port'
import type { DashboardScope, ShareGrant } from '../domain/dashboard'
import type { ViewerIdentity } from '../retrieval/port'

export interface FakeAuthorizationOptions {
  identities: ViewerIdentity[]
  scopes: OrgScopeRef[]
  /** Dataset ids each identity may consume. An identity absent from this map may consume everything. */
  consumableDatasets?: Record<string, string[]>
  /** Identity ids holding the Analytics Administrator user class. */
  administrators?: string[]
}

export class FakeAuthorization implements AuthorizationPort {
  private readonly options: FakeAuthorizationOptions

  constructor(options: FakeAuthorizationOptions) {
    this.options = options
  }

  async mayConsumeDataset(datasetId: string, viewer: ViewerIdentity): Promise<boolean> {
    const allowed = this.options.consumableDatasets?.[viewer.id]
    return allowed === undefined || allowed.includes(datasetId)
  }

  async satisfiesScope(scope: DashboardScope, viewer: ViewerIdentity): Promise<boolean> {
    switch (scope.kind) {
      case 'personal':
        // Handled by the Author check upstream; nobody else satisfies it.
        return false
      case 'organization-wide':
        // FR-DA-04 — all authenticated users. Authentication is a precondition
        // of holding a ViewerIdentity at all (FR-DA-05).
        return true
      case 'organizational-scope':
        return (viewer.organizationalScopeIds ?? []).includes(scope.scopeId)
    }
  }

  async mayAdministerCatalogue(viewer: ViewerIdentity): Promise<boolean> {
    return (this.options.administrators ?? []).includes(viewer.id)
  }

  async resolveRecipient(grant: ShareGrant): Promise<ViewerIdentity[]> {
    if (grant.recipientKind === 'individual') {
      const match = this.options.identities.find((i) => i.id === grant.recipientId)
      return match ? [match] : []
    }

    // §8, unresolved: "named group" may mean an organizational scope node or a
    // flat departments row, and the two are different features with overlapping
    // names. Treated as an organizational scope here because that is what
    // authorization actually evaluates — but this is the line that changes when
    // the ambiguity is settled.
    return this.options.identities.filter((identity) =>
      (identity.organizationalScopeIds ?? []).includes(grant.recipientId),
    )
  }

  async directory() {
    return { individuals: this.options.identities, groups: this.options.scopes }
  }
}
