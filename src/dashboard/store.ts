/**
 * Dashboard persistence.
 *
 * `publish` and `save` are separate operations rather than one save with a
 * status field, because FR-CO-04 makes publication a decision an Author takes
 * deliberately after reviewing. Folding it into a generic save invites a UI
 * where a Dashboard becomes visible as a side effect of editing it.
 */

import { canViewDashboard, visibleDashboards } from '../access/dashboard-access'
import type { AuthorizationPort } from '../access/port'
import type { Dashboard } from '../domain/dashboard'
import type { ViewerIdentity } from '../retrieval/port'

export interface DashboardStorePort {
  list(viewer: ViewerIdentity): Promise<Dashboard[]>
  load(dashboardId: string, viewer: ViewerIdentity): Promise<Dashboard | null>
  save(dashboard: Dashboard, viewer: ViewerIdentity): Promise<void>
  /** FR-CO-04 — the explicit act of making a Dashboard visible. */
  publish(dashboardId: string, viewer: ViewerIdentity): Promise<void>
}

const STORAGE_KEY = 'analytics-widgets-lab:dashboards'

/**
 * localStorage stand-in. Which of per-user, per-board or per-dashboard scoping
 * the real store uses is a backend decision; nothing here depends on the
 * answer.
 */
export class LocalDashboardStore implements DashboardStorePort {
  /**
   * Visibility is not the store's decision. It persists Dashboards and asks
   * the authorization boundary who may see them — the same boundary the
   * Catalogue and retrieval ask, so the three cannot drift into disagreeing.
   */
  private readonly authorization: AuthorizationPort

  constructor(authorization: AuthorizationPort) {
    this.authorization = authorization
  }

  private read(): Record<string, Dashboard> {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as Record<string, Dashboard>) : {}
    } catch {
      return {}
    }
  }

  private write(all: Record<string, Dashboard>): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  }

  async list(viewer: ViewerIdentity): Promise<Dashboard[]> {
    return visibleDashboards(Object.values(this.read()), viewer, this.authorization)
  }

  async load(dashboardId: string, viewer: ViewerIdentity): Promise<Dashboard | null> {
    const dashboard = this.read()[dashboardId]
    if (!dashboard) return null
    return (await canViewDashboard(dashboard, viewer, this.authorization)) ? dashboard : null
  }

  async save(dashboard: Dashboard, _viewer: ViewerIdentity): Promise<void> {
    const all = this.read()
    all[dashboard.id] = dashboard
    this.write(all)
  }

  async publish(dashboardId: string, viewer: ViewerIdentity): Promise<void> {
    const all = this.read()
    const dashboard = all[dashboardId]
    if (!dashboard) throw new Error(`No Dashboard '${dashboardId}'.`)
    if (dashboard.authorId !== viewer.id) {
      throw new Error('Only the Dashboard Author may publish it.')
    }
    all[dashboardId] = { ...dashboard, status: 'published' }
    this.write(all)
  }
}

/** Non-persistent variant, for tests. */
export class InMemoryDashboardStore implements DashboardStorePort {
  private readonly dashboards = new Map<string, Dashboard>()
  private readonly authorization: AuthorizationPort

  constructor(authorization: AuthorizationPort) {
    this.authorization = authorization
  }

  async list(viewer: ViewerIdentity): Promise<Dashboard[]> {
    return visibleDashboards(Array.from(this.dashboards.values()), viewer, this.authorization)
  }

  async load(dashboardId: string, viewer: ViewerIdentity): Promise<Dashboard | null> {
    const dashboard = this.dashboards.get(dashboardId)
    if (!dashboard) return null
    return (await canViewDashboard(dashboard, viewer, this.authorization)) ? dashboard : null
  }

  async save(dashboard: Dashboard, _viewer: ViewerIdentity): Promise<void> {
    this.dashboards.set(dashboard.id, dashboard)
  }

  async publish(dashboardId: string, viewer: ViewerIdentity): Promise<void> {
    const dashboard = this.dashboards.get(dashboardId)
    if (!dashboard) throw new Error(`No Dashboard '${dashboardId}'.`)
    if (dashboard.authorId !== viewer.id) {
      throw new Error('Only the Dashboard Author may publish it.')
    }
    this.dashboards.set(dashboardId, { ...dashboard, status: 'published' })
  }
}
