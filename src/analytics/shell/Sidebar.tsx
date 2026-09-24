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

            {NAV_ITEMS.filter((item) => item.group === group.key).map((item) => (
              <button
                key={item.id}
                type="button"
                className="a-nav-item"
                aria-current={item.id === current}
                aria-label={collapsed ? item.label : undefined}
                title={collapsed ? item.label : undefined}
                onClick={() => onNavigate(item.id)}
              >
                <Icon name={item.icon} />
                {!collapsed && <span>{item.label}</span>}
              </button>
            ))}
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
