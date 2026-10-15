/**
 * The module sidebar.
 *
 * Collapses to an icon rail. When collapsed the labels are removed from the
 * accessibility tree rather than merely hidden, and each button keeps an
 * `aria-label` and a native tooltip — a rail of unlabelled glyphs is unusable
 * otherwise.
 */

import { Icon } from './Icon'
import { NAV_ITEMS, type NavItem, type ScreenId } from './nav'
import { useBoards } from '../builder/useBoards'
import { useMay } from '../data/AnalyticsData'

const GROUPS: { key: NavItem['group']; label: string }[] = [
  { key: 'work', label: 'Workspace' },
  { key: 'library', label: 'Library' },
]

export function Sidebar({
  current,
  collapsed,
  onClose,
  onNavigate,
  onToggleCollapsed,
  theme,
  onToggleTheme,
}: {
  current: ScreenId
  collapsed: boolean
  /**
   * Present when the sidebar is an overlay, so the rail toggle becomes a
   * close. Collapsing to a rail is meaningless in a drawer — it is already all
   * or nothing — and dismissing is what a reader wants there.
   */
  onClose?: () => void
  onNavigate: (id: ScreenId) => void
  onToggleCollapsed: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
}) {
  const boards = useBoards()
  const mayCreate = useMay('dashboard.create')

  return (
    <aside className="a-side" data-collapsed={collapsed} aria-label="Analytics navigation">
      <div className="a-side__head">
        <span className="a-side__mark" aria-hidden="true">
          <Icon name="widgets" size={16} />
        </span>
        {!collapsed && <span className="a-side__wordmark">Analytics</span>}
      </div>

      <nav className="a-side__nav">
        {GROUPS.map((group) => (
          <div key={group.key} className="a-side__group">
            <p className="a-side__group-label">{group.label}</p>

            {NAV_ITEMS.filter((item) => item.group === group.key).map((item) => {
              /*
               * "Create dashboard" reads as an action, not a bookmark — and a
               * plain `onNavigate` is a bookmark: it reopens whatever
               * `editingId` already points to, which is an existing board the
               * moment one has ever been open. `NewDashboardButton` elsewhere
               * in this shell gets this right; this item promised the same
               * thing and did not do it.
               */
              const isCreate = item.id === 'create'
              const disabled = isCreate && !mayCreate

              return (
                <button
                  key={item.id}
                  type="button"
                  className="a-nav-item"
                  aria-current={item.id === current}
                  aria-label={collapsed ? item.label : undefined}
                  title={
                    disabled
                      ? 'You do not have permission to create dashboards.'
                      : collapsed
                        ? item.label
                        : undefined
                  }
                  disabled={disabled}
                  onClick={() => {
                    if (isCreate) boards.createBoard()
                    onNavigate(item.id)
                  }}
                >
                  <Icon name={item.icon} />
                  {!collapsed && <span>{item.label}</span>}
                </button>
              )
            })}
          </div>
        ))}
      </nav>

      <div className="a-side__foot">
        <button
          type="button"
          className={`a-icon-button ${collapsed || onClose ? '' : 'a-icon-button--rotated'}`}
          onClick={onClose ?? onToggleCollapsed}
          aria-label={onClose ? 'Close navigation' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={onClose ? 'Close navigation' : collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <Icon name="chevron" />
        </button>

        <button
          type="button"
          className="a-icon-button"
          onClick={onToggleTheme}
          aria-label={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
          title={theme === 'light' ? 'Switch to dark' : 'Switch to light'}
        >
          <Icon name={theme === 'light' ? 'moon' : 'sun'} />
        </button>
      </div>
    </aside>
  )
}
