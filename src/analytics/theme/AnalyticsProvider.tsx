/**
 * The module's root.
 *
 * Establishes the `.analytics-root` scope that every token lives under, and
 * takes an optional partial theme so a host product can re-skin the whole
 * widget set without touching a component.
 *
 *   <AnalyticsProvider>                          SMCDAO defaults
 *   <AnalyticsProvider theme={{ accent: '#…' }}> one role changed
 *   <AnalyticsProvider theme={{ series: […] }}>  a different categorical palette
 *
 * Overrides land as inline custom properties on this element, so they beat the
 * stylesheet by specificity without `!important` and without a build step.
 */

import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react'
import { themeToCssVars, type AnalyticsTheme } from './tokens'
import './tokens.css'

interface AnalyticsContextValue {
  /** Only the roles the host overrode. Components read tokens from CSS, not from here. */
  themeOverrides: Partial<AnalyticsTheme>
  density: 'comfortable' | 'compact'
}

const AnalyticsContext = createContext<AnalyticsContextValue>({
  themeOverrides: {},
  density: 'comfortable',
})

export function AnalyticsProvider({
  theme = {},
  density = 'comfortable',
  className = '',
  style,
  children,
}: {
  theme?: Partial<AnalyticsTheme>
  density?: 'comfortable' | 'compact'
  className?: string
  style?: CSSProperties
  children: ReactNode
}) {
  const cssVars = useMemo(() => themeToCssVars(theme), [theme])
  const value = useMemo(() => ({ themeOverrides: theme, density }), [theme, density])

  return (
    <AnalyticsContext.Provider value={value}>
      <div
        className={`analytics-root ${className}`}
        data-density={density}
        style={{ ...cssVars, ...style } as CSSProperties}
      >
        {children}
      </div>
    </AnalyticsContext.Provider>
  )
}

export function useAnalyticsTheme(): AnalyticsContextValue {
  return useContext(AnalyticsContext)
}
