/**
 * The authorization boundary.
 *
 * Distribution & access is classified *Integrated*: behaviour is jointly
 * determined with the IAM context, and Analytics conforms rather than
 * negotiating. Every authorization question therefore leaves through this
 * port. Nothing in Analytics reasons about roles, org structure, or group
 * membership on its own — it asks, and honours the answer.
 *
 * Two consequences worth stating, because both are easy to get wrong:
 *
 *  - **No role strings.** A `role === 'admin'` check anywhere in Analytics
 *    would be Analytics deciding, and would break the moment IAM's model
 *    changed. The port returns decisions, not attributes to reason over.
 *
 *  - **The §8 hazard stays behind this adapter.** "Department" is ambiguous in
 *    the SMC landscape between the organizational scope hierarchy that
 *    authorization actually evaluates, and a flat departments table that it
 *    does not. FR-DA-06's "named group" is unresolved on exactly this point and
 *    is recorded as a *hard, unresolved* dependency. Keeping group resolution
 *    behind `resolveRecipient` means settling it later changes one adapter
 *    rather than every caller.
 */

import type { DashboardScope, ShareGrant } from '../domain/dashboard'
import type { ViewerIdentity } from '../retrieval/port'

/** A node in IAM's organizational scope model. Single-level only (§10). */
export interface OrgScopeRef {
  scopeId: string
  label: string
}

export interface AuthorizationPort {
  /**
   * FR-DP-12 (what the Catalogue may advertise) and FR-DA-09 (what retrieval
   * may serve) are the same question asked at two moments. Both ask it here,
   * rather than sharing a cached answer, because a Viewer's authorization can
   * change between browsing and retrieving.
   */
  mayConsumeDataset(datasetId: string, viewer: ViewerIdentity): Promise<boolean>

  /** FR-DA-02 — FR-DA-04. Whether an identity falls inside a Dashboard Scope. */
  satisfiesScope(scope: DashboardScope, viewer: ViewerIdentity): Promise<boolean>

  /**
   * The identities a Share Grant names (FR-DA-06).
   *
   * Returns a list because a Grant may name a group. An empty list means the
   * recipient could not be resolved at all, which is a different failure from
   * a recipient who resolves but falls outside the Scope — and the Author needs
   * to be told which (FR-DA-08).
   */
  resolveRecipient(grant: ShareGrant): Promise<ViewerIdentity[]>

  /**
   * Whether this identity holds the Analytics Administrator user class
   * (FR-GV-01 — FR-GV-03).
   *
   * Returned as a decision rather than a role attribute for the same reason as
   * everything else on this port: Analytics must not hold `role === 'admin'`
   * anywhere, or IAM's model has leaked into ours.
   *
   * Recorded dependency: this user class does not yet exist in the IAM Role
   * Catalog. Until it is added, no real identity can answer true — which makes
   * the whole of Workstream G unreachable in production however complete the
   * frontend is.
   */
  mayAdministerCatalogue(viewer: ViewerIdentity): Promise<boolean>

  /** Candidate recipients, for the Grant authoring surface. */
  directory(): Promise<{ individuals: ViewerIdentity[]; groups: OrgScopeRef[] }>
}

/**
 * FR-DA-14 — access to Datasets carrying a personal-data classification must be
 * recorded, such that who accessed such data and when can later be established.
 *
 * A separate port from retrieval on purpose: recording is an obligation of the
 * platform, not of any Source System, and the Source System has no business
 * knowing who asked.
 */
export interface AccessRecord {
  at: string
  viewerId: string
  viewerName: string
  datasetId: string
  datasetName: string
}

export interface AccessRecorderPort {
  record(entry: AccessRecord): Promise<void>
  list(): Promise<AccessRecord[]>
}
