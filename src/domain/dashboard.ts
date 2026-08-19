/**
 * Dashboard — "a named, arranged collection of Widgets and Composition
 * Elements."
 *
 * Widgets are **referenced, not embedded** (Finding 4). FR-VZ-09 wants a Widget
 * saved to the Widget Library and reused across more than one Dashboard, which
 * is impossible if a Dashboard owns its Widgets by value. Storing ids costs
 * nothing now and avoids a migration later.
 */

import type { Widget } from './widget'
import type { Control, Placement, Section } from './composition'

/**
 * FR-DA-01 — every Dashboard has a Scope.
 *
 * Single-level only: nested organizational scope is out of scope (§10), because
 * the IAM implementation enforces a fixed shape regardless of what its schema
 * permits. Role-based Scope is also out of scope, blocked on the §8 naming
 * hazard.
 */
export type DashboardScope =
  /** FR-DA-02 — visible only to the Author. */
  | { kind: 'personal' }
  /** FR-DA-03 — visible to members of one organizational scope. */
  | { kind: 'organizational-scope'; scopeId: string; label: string }
  /** FR-DA-04 — visible to all authenticated users. */
  | { kind: 'organization-wide' }

/**
 * FR-DA-06 — extends visibility to a named individual or group.
 * FR-DA-07 — refines *within* the Scope; never reaches beyond it.
 */
export interface ShareGrant {
  id: string
  recipientKind: 'individual' | 'group'
  recipientId: string
  recipientLabel: string
}

export type { Placement } from './composition'

/**
 * FR-CO-04 — an Author retains a Dashboard privately before making it visible.
 *
 * Distinct from Scope, though they interact: `draft` means not yet visible to
 * anyone but the Author whatever the Scope says, so an Author can set an
 * organization-wide Scope and still review before anyone sees it.
 */
export type DashboardStatus = 'draft' | 'published'

export interface Dashboard {
  id: string
  name: string
  authorId: string
  scope: DashboardScope
  status: DashboardStatus
  shareGrants: ShareGrant[]
  placements: Placement[]
  /** Widget records this Dashboard references, by id. */
  widgets: Record<string, Widget>
  /** FR-CO-05 — Composition Elements that control how Widgets present data. */
  controls: Control[]
  /** FR-CO-07 — Composition Elements that organize Widgets spatially. */
  sections: Section[]
}

export function describeScope(scope: DashboardScope): string {
  switch (scope.kind) {
    case 'personal':
      return 'Personal — visible only to you'
    case 'organizational-scope':
      return `${scope.label} — visible to that organizational scope`
    case 'organization-wide':
      return 'Organization-wide — visible to all authenticated users'
  }
}

export function emptyDashboard(id: string, name: string, authorId: string): Dashboard {
  return {
    id,
    name,
    authorId,
    scope: { kind: 'personal' },
    status: 'draft',
    shareGrants: [],
    placements: [],
    widgets: {},
    controls: [],
    sections: [],
  }
}
