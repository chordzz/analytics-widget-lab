/**
 * The token contract, in TypeScript.
 *
 * `tokens.css` holds the values; this holds the names. Components reference
 * tokens through these helpers rather than typing `var(--a-series-3)` inline,
 * so a rename is one edit and a typo is a compile error rather than a colour
 * that silently resolves to nothing.
 */

/** Every colour role a consumer may override. */
export interface AnalyticsTheme {
  bg: string
  surface: string
  surfaceRaised: string
  surfaceHover: string
  surfaceSunken: string
  border: string
  borderStrong: string

  text: string
  textSecondary: string
  textMuted: string
  textInverse: string

  accent: string
  accentHover: string
  accentSubtle: string
  focusRing: string

  statusGood: string
  statusWarning: string
  statusSerious: string
  statusCritical: string
  statusNeutral: string

  /** Categorical slots, in fixed order. */
  series: string[]
  /** Sequential ramp, light to dark. */
  sequential: string[]

  grid: string
  axis: string
  tooltipBg: string
  tooltipText: string
}

/** CSS custom property name for each role. */
export const TOKEN_NAMES: Record<keyof Omit<AnalyticsTheme, 'series' | 'sequential'>, string> = {
  bg: '--a-bg',
  surface: '--a-surface',
  surfaceRaised: '--a-surface-raised',
  surfaceHover: '--a-surface-hover',
  surfaceSunken: '--a-surface-sunken',
  border: '--a-border',
  borderStrong: '--a-border-strong',

  text: '--a-text',
  textSecondary: '--a-text-secondary',
  textMuted: '--a-text-muted',
  textInverse: '--a-text-inverse',

  accent: '--a-accent',
  accentHover: '--a-accent-hover',
  accentSubtle: '--a-accent-subtle',
  focusRing: '--a-focus-ring',

  statusGood: '--a-status-good',
  statusWarning: '--a-status-warning',
  statusSerious: '--a-status-serious',
  statusCritical: '--a-status-critical',
  statusNeutral: '--a-status-neutral',

  grid: '--a-grid',
  axis: '--a-axis',
  tooltipBg: '--a-tooltip-bg',
  tooltipText: '--a-tooltip-text',
}

/** `token('accent')` → `var(--a-accent)`. */
export function token(role: keyof typeof TOKEN_NAMES): string {
  return `var(${TOKEN_NAMES[role]})`
}

export const SERIES_SLOTS = 8

/**
 * Categorical colour for slot `index`, in fixed order.
 *
 * Deliberately **not** modulo. Colour follows the entity, not its position, and
 * cycling would give series 9 the same hue as series 1 — two different things
 * reading as the same thing. Past the eighth slot the caller gets the neutral
 * and should be folding the tail into "Other" or faceting instead.
 */
export function seriesColor(index: number): string {
  if (index < 0 || index >= SERIES_SLOTS) return token('statusNeutral')
  return `var(--a-series-${index + 1})`
}

/** Sequential ramp step, 0 (lightest) to 5 (darkest). */
export function sequentialColor(step: number): string {
  const clamped = Math.max(0, Math.min(step, 5))
  return `var(--a-seq-${clamped + 1})`
}

/** Position within a sequential ramp, from a 0–1 fraction. */
export function sequentialFor(fraction: number): string {
  return sequentialColor(Math.round(Math.max(0, Math.min(fraction, 1)) * 5))
}

export type StatusTone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral'

/**
 * Status colours are reserved. They are never reused as a categorical slot —
 * if green means "healthy" in one widget it cannot mean "EMEA" in the next.
 */
export function statusColor(tone: StatusTone): string {
  switch (tone) {
    case 'good':
      return token('statusGood')
    case 'warning':
      return token('statusWarning')
    case 'serious':
      return token('statusSerious')
    case 'critical':
      return token('statusCritical')
    case 'neutral':
      return token('statusNeutral')
  }
}

/**
 * Turns a partial theme into inline custom properties.
 *
 * A consumer overrides only what they care about; everything unspecified keeps
 * the SMCDAO default from `tokens.css`.
 */
export function themeToCssVars(theme: Partial<AnalyticsTheme>): Record<string, string> {
  const vars: Record<string, string> = {}

  for (const [role, name] of Object.entries(TOKEN_NAMES)) {
    const value = theme[role as keyof typeof TOKEN_NAMES]
    if (typeof value === 'string') vars[name] = value
  }

  theme.series?.forEach((colour, index) => {
    if (index < SERIES_SLOTS) vars[`--a-series-${index + 1}`] = colour
  })
  theme.sequential?.forEach((colour, index) => {
    if (index < 6) vars[`--a-seq-${index + 1}`] = colour
  })

  return vars
}
