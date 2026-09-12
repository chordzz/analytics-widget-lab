/**
 * The analytics module — public surface.
 *
 * A host portal mounts `<AnalyticsModule />` and is done. Everything the module
 * needs travels with it; nothing leaks out. Three things are exported beyond
 * the module itself, because a host will reasonably want them:
 *
 *   - `AnalyticsProvider` — to re-theme, or to use primitives outside the module
 *   - the primitives — a chart on a detail page has nothing to do with a dashboard
 *   - the token types — so a host's theme object is type-checked
 */

import { useEffect, useState, type ReactNode } from 'react'
import { AnalyticsProvider } from './theme/AnalyticsProvider'
import { ModuleShell } from './shell/ModuleShell'
import { DEFAULT_SCREEN, pathForScreen, screenForPath, type ScreenId } from './shell/nav'
import type { AnalyticsTheme } from './theme/tokens'
import type { AnalyticsDataProviderProps } from './data/AnalyticsData'
import './theme/module.css'

export interface AnalyticsModuleProps {
  /** Partial override of the SMCDAO defaults. */
  theme?: Partial<AnalyticsTheme>
  /**
   * Where the module is mounted, e.g. `#/analytics`. Used by the built-in
   * router only — pass `screen`/`onNavigate` to drive it from the host's own.
   */
  basePath?: string
  /** Host-controlled screen. Omit to let the module route itself. */
  screen?: ScreenId
  onNavigate?: (screen: ScreenId) => void
  /** Host-controlled colour scheme. Omit to let the module manage it. */
  colorScheme?: 'light' | 'dark'
  onToggleColorScheme?: () => void
  /**
   * Real adapters. Omitted, the module runs on its fixtures — which is what
   * keeps every screen reachable without a backend.
   */
  data?: Omit<AnalyticsDataProviderProps, 'children'>
  /** Rendered in the top bar. Where a host puts its own account control. */
  headerActions?: ReactNode
}

export function AnalyticsModule({
  theme,
  basePath = '#/analytics',
  screen,
  onNavigate,
  colorScheme,
  onToggleColorScheme,
  data,
  headerActions,
}: AnalyticsModuleProps = {}) {
  const routed = useHashScreen(basePath, screen === undefined)
  const [ownScheme, setOwnScheme] = useState<'light' | 'dark'>('light')

  const activeScreen = screen ?? routed.screen
  const activeScheme = colorScheme ?? ownScheme

  // The scheme is stamped on the document root because that is where the token
  // stylesheet's `data-theme` scope looks, and a host toggling its own theme
  // must be able to win.
  useEffect(() => {
    if (colorScheme === undefined) {
      document.documentElement.setAttribute('data-theme', ownScheme)
    }
  }, [colorScheme, ownScheme])

  return (
    <AnalyticsProvider theme={theme}>
      <ModuleShell
        screen={activeScreen}
        onNavigate={onNavigate ?? routed.navigate}
        theme={activeScheme}
        onToggleTheme={
          onToggleColorScheme ?? (() => setOwnScheme((value) => (value === 'light' ? 'dark' : 'light')))
        }
        data={data}
        headerActions={headerActions}
      />
    </AnalyticsProvider>
  )
}

/**
 * A twenty-line hash router.
 *
 * Deliberately not `react-router` — the host portal brings its own, and this
 * exists only so the module is navigable standalone. Pass `screen` and
 * `onNavigate` and none of it runs.
 */
function useHashScreen(basePath: string, enabled: boolean) {
  const read = (): ScreenId => {
    if (!enabled) return DEFAULT_SCREEN
    const hash = window.location.hash
    if (!hash.startsWith(basePath)) return DEFAULT_SCREEN
    return screenForPath(hash.slice(basePath.length) || '/dashboards')
  }

  const [screen, setScreen] = useState<ScreenId>(read)

  useEffect(() => {
    if (!enabled) return
    const onChange = () => setScreen(read())
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, basePath])

  const navigate = (next: ScreenId) => {
    if (enabled) window.location.hash = `${basePath}${pathForScreen(next)}`
    setScreen(next)
  }

  return { screen, navigate }
}

export { AnalyticsProvider } from './theme/AnalyticsProvider'
export * from './widgets/primitives'
export { WidgetCard } from './widgets/WidgetCard'
export type { WidgetCardProps, WidgetState } from './widgets/WidgetCard'
export { Widget } from './widgets/Widget'
export type { WidgetSpec, WidgetMapping } from './widgets/Widget'
export { FAMILIES, WIDGET_TYPES, widgetType, typesInFamily, coverage } from './widgets/catalog'
export type { AnalyticsTheme } from './theme/tokens'
export { seriesColor, statusColor, token } from './theme/tokens'
/*
 * The data surface a host gets.
 *
 * This used to export the fixture library itself — `datasets` and
 * `datasetById` — which was honest while the module owned its own mock data and
 * is wrong now that it owns a boundary instead. A host with a real Catalogue
 * passes its adapters to `AnalyticsDataProvider`; a host without one gets the
 * fixtures by default and never has to know.
 */
export { AnalyticsDataProvider, useCatalogue, useDataset, useDatasets } from './data/AnalyticsData'
export type { AnalyticsDataProviderProps } from './data/AnalyticsData'
export { FixtureCatalogue, FixtureRetrieval } from './data/adapters'
export type { Dataset, Field, Row, ValueFormat } from './data/types'
export type { ScreenId } from './shell/nav'
