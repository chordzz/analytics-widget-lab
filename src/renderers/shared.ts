/**
 * Shared renderer helpers.
 *
 * No renderer names a colour. Series colours come from the token layer so the
 * whole set can be re-skinned against the real design system by replacing CSS
 * custom properties — see the restyle boundary in the plan.
 */

import type { Dataset } from '../domain/dataset'

export const SERIES_TOKENS = [
  'var(--analytics-series-1)',
  'var(--analytics-series-2)',
  'var(--analytics-series-3)',
  'var(--analytics-series-4)',
  'var(--analytics-series-5)',
  'var(--analytics-series-6)',
]

export const seriesColour = (index: number) => SERIES_TOKENS[index % SERIES_TOKENS.length]

export const AXIS_STYLE = { fontSize: 11, fill: 'var(--analytics-axis)' } as const

export const TOOLTIP_STYLE = {
  background: 'var(--analytics-tooltip-bg)',
  color: 'var(--analytics-tooltip-text)',
  border: 'none',
  borderRadius: 6,
  fontSize: 12,
} as const

export function fieldLabel(dataset: Dataset, key: string): string {
  return dataset.fields.find((f) => f.key === key)?.label ?? key
}

const compact = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 })
const full = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

export const formatCompact = (value: unknown) =>
  typeof value === 'number' ? compact.format(value) : String(value ?? '')

export const formatFull = (value: unknown) =>
  typeof value === 'number' ? full.format(value) : String(value ?? '')
