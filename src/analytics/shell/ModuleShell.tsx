
/** Below this the sidebar stops being a column and becomes an overlay. */
const DRAWER_BELOW = 720

/**
 * Whether the viewport is under `width`, watched rather than read once.
 *
 * A reader rotating a tablet or splitting a window should get the other layout
 * without reloading, and `matchMedia` reports the change where a one-off
 * measurement cannot.
 */
function useNarrow(width: number): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(`(max-width: ${String(width)}px)`).matches,
  )

  useEffect(() => {
    if (typeof window === 'undefined') return
    const query = window.matchMedia(`(max-width: ${String(width)}px)`)
    const onChange = (event: MediaQueryListEvent) => { setNarrow(event.matches) }
    setNarrow(query.matches)
    query.addEventListener('change', onChange)
    return () => { query.removeEventListener('change', onChange) }
  }, [width])

  return narrow
}

const MenuIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
)

/**
 * The module's frame.
 *
 * Owns the sidebar, the top bar and which screen is showing. Routing is
 * injected rather than assumed: the host portal already has a router, and this
 * module should not bring a second one. It takes the current screen and a
 * navigate callback, which a host wires to whatever it uses.
 */

import { useEffect, useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { NAV_ITEMS, type ScreenId } from './nav'
import { DashboardsScreen } from '../screens/DashboardsScreen'
import { GalleryScreen } from '../screens/GalleryScreen'
import { DataScreen } from '../screens/DataScreen'
import { CreateScreen } from '../screens/CreateScreen'
import { DraftsScreen } from '../screens/DraftsScreen'
import { AnalyticsDataProvider, useMay, type AnalyticsDataProviderProps } from '../data/AnalyticsData'
import { BoardsProvider, useBoards } from '../builder/useBoards'
import type { BoardStorePort } from '../builder/store'
import { ComposeIntentProvider } from '../builder/useComposeIntent'
import './shell.css'
import '../builder/builder.css'

const CAPTIONS: Record<ScreenId, string> = {
  dashboards: 'Published and draft boards',
  create: 'Choose data, pick a widget, place it',
  drafts: 'Boards not yet published',
  widgets: 'Every widget type, rendered live',
  data: 'Mock datasets available to widgets',
}

export function ModuleShell({
  screen,
  onNavigate,
  theme,
  onToggleTheme,
  headerActions,
  data,
  boardStore,
}: {
  screen: ScreenId
  onNavigate: (id: ScreenId) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  headerActions?: ReactNode
  /** Real adapters from a host. Omitted, the module runs on its fixtures. */
  data?: Omit<AnalyticsDataProviderProps, 'children'>
  /** Where boards are kept. Omitted, they are kept in `localStorage`. */
  boardStore?: BoardStorePort
}) {
  const [collapsed, setCollapsed] = useState(false)
  /*
   * Narrow is a different layout, not a narrower one.
   *
   * The sidebar is a column of the shell grid, and at 375px it took 233 of
   * them — leaving 126px of content, which fits a chart the way a envelope
   * fits a door. Collapsing it to the icon rail is not enough either: a rail
   * still costs 56px of a phone and navigation is not what someone opened a
   * dashboard to look at.
   *
   * So below `DRAWER_BELOW` it leaves the grid entirely and becomes an
   * overlay, opened from the topbar. State rather than CSS alone because the
   * scrim, the open button and `aria-expanded` all have to agree with it.
   */
  const drawer = useNarrow(DRAWER_BELOW)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const current = NAV_ITEMS.find((item) => item.id === screen)

  // Navigating is the end of a drawer's job; leaving it open over the thing it
  // just navigated to is the standard way this goes wrong.
  const navigate = (id: ScreenId) => {
    setDrawerOpen(false)
    onNavigate(id)
  }

  return (
    <AnalyticsDataProvider {...data}>
    <BoardsProvider store={boardStore}>
    <ComposeIntentProvider>
    <div className="a-shell" data-drawer={drawer ? (drawerOpen ? 'open' : 'shut') : undefined}>
      <Sidebar
        current={screen}
        collapsed={drawer ? false : collapsed}
        onNavigate={navigate}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        theme={theme}
        onToggleTheme={onToggleTheme}
        // The rail toggle is meaningless in a drawer — it is already all or
        // nothing — and a close is what a reader wants there instead.
        onClose={drawer ? () => { setDrawerOpen(false) } : undefined}
      />

      {drawer && drawerOpen && (
        <div className="a-shell__scrim" onClick={() => { setDrawerOpen(false) }} />
      )}

      <div className="a-main">
        <header className="a-topbar">
          {drawer && (
            <button
              type="button"
              className="a-icon-button a-topbar__menu"
              aria-label="Open navigation"
              aria-expanded={drawerOpen}
              onClick={() => { setDrawerOpen(true) }}
            >
              <MenuIcon />
            </button>
          )}
          <div>
            <h1 className="a-topbar__title">{current?.label ?? 'Analytics'}</h1>
            <p className="a-topbar__caption">{CAPTIONS[screen]}</p>
          </div>
          <div className="a-topbar__actions">
            {headerActions}
            {screen !== 'create' && <NewDashboardButton onNavigate={onNavigate} />}
          </div>
        </header>

        <main className="a-content">
          <Screen id={screen} onNavigate={onNavigate} />
        </main>
      </div>
    </div>
    </ComposeIntentProvider>
    </BoardsProvider>
    </AnalyticsDataProvider>
  )
}

/**
 * Starts a board *and* navigates, so "New dashboard" from anywhere lands you on
 * a fresh canvas rather than back on whatever was last open.
 */
function NewDashboardButton({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const boards = useBoards()
  const mayCreate = useMay('dashboard.create')

  /*
   * Disabled and explained rather than removed.
   *
   * A button that vanishes leaves someone wondering whether they misremembered
   * where it was, or whether the page is broken. A disabled one that says why is
   * the same information with the question already answered — and it is the
   * treatment the unavailable widget types already use, for the same reason.
   */
  return (
    <button
      type="button"
      className="a-button a-button--primary"
      disabled={!mayCreate}
      title={mayCreate ? undefined : 'You do not have permission to create dashboards.'}
      onClick={() => {
        boards.createBoard()
        onNavigate('create')
      }}
    >
      New dashboard
    </button>
  )
}

function Screen({ id, onNavigate }: { id: ScreenId; onNavigate: (id: ScreenId) => void }) {
  switch (id) {
    case 'dashboards':
      return <DashboardsScreen onNavigate={onNavigate} />
    case 'widgets':
      return <GalleryScreen />
    case 'data':
      return <DataScreen onNavigate={onNavigate} />
    case 'create':
      return <CreateScreen onNavigate={onNavigate} />
    case 'drafts':
      return <DraftsScreen onNavigate={onNavigate} />
  }
}
