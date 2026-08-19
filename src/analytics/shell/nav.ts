/**
 * The module's navigation model.
 *
 * Data rather than JSX so the host portal can reorder, hide or relabel items
 * without editing the sidebar, and so the route shim has one place to look up
 * what a path means.
 */

export type ScreenId = 'dashboards' | 'create' | 'drafts' | 'widgets' | 'data'

export interface NavItem {
  id: ScreenId
  label: string
  /** Path within the module, appended to its mount point. */
  path: string
  icon: IconName
  /** Separates primary work from reference material in the rail. */
  group: 'work' | 'library'
}

export type IconName = 'grid' | 'plus' | 'draft' | 'widgets' | 'database'

export const NAV_ITEMS: NavItem[] = [
  { id: 'dashboards', label: 'Dashboards', path: '/dashboards', icon: 'grid', group: 'work' },
  { id: 'create', label: 'Create dashboard', path: '/create', icon: 'plus', group: 'work' },
  { id: 'drafts', label: 'Drafts', path: '/drafts', icon: 'draft', group: 'work' },
  { id: 'widgets', label: 'Widgets', path: '/widgets', icon: 'widgets', group: 'library' },
  { id: 'data', label: 'Data sources', path: '/data', icon: 'database', group: 'library' },
]

export const DEFAULT_SCREEN: ScreenId = 'dashboards'

export const screenForPath = (path: string): ScreenId =>
  NAV_ITEMS.find((item) => item.path === path)?.id ?? DEFAULT_SCREEN

export const pathForScreen = (id: ScreenId): string =>
  NAV_ITEMS.find((item) => item.id === id)?.path ?? '/dashboards'
