/**
 * The module's frame.
 *
 * Owns the sidebar, the top bar and which screen is showing. Routing is
 * injected rather than assumed: the host portal already has a router, and this
 * module should not bring a second one. It takes the current screen and a
 * navigate callback, which a host wires to whatever it uses.
 */

import { useState, type ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { NAV_ITEMS, type ScreenId } from './nav'
import { DashboardsScreen } from '../screens/DashboardsScreen'
import { GalleryScreen } from '../screens/GalleryScreen'
import { DataScreen } from '../screens/DataScreen'
import { CreateScreen } from '../screens/CreateScreen'
import { DraftsScreen } from '../screens/DraftsScreen'
import { BoardsProvider, useBoards } from '../builder/useBoards'
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
}: {
  screen: ScreenId
  onNavigate: (id: ScreenId) => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  headerActions?: ReactNode
}) {
  const [collapsed, setCollapsed] = useState(false)
  const current = NAV_ITEMS.find((item) => item.id === screen)

  return (
    <BoardsProvider>
    <ComposeIntentProvider>
    <div className="a-shell">
      <Sidebar
        current={screen}
        collapsed={collapsed}
        onNavigate={onNavigate}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        theme={theme}
        onToggleTheme={onToggleTheme}
      />

      <div className="a-main">
        <header className="a-topbar">
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
  )
}

/**
 * Starts a board *and* navigates, so "New dashboard" from anywhere lands you on
 * a fresh canvas rather than back on whatever was last open.
 */
function NewDashboardButton({ onNavigate }: { onNavigate: (id: ScreenId) => void }) {
  const boards = useBoards()

  return (
    <button
      type="button"
      className="a-button a-button--primary"
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
