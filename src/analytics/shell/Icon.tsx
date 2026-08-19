/**
 * Icons as inline SVG.
 *
 * No icon dependency — the host portal shouldn't inherit one, and a handful of
 * 20px stroke glyphs is not worth 40KB. All strokes are `currentColor`, so
 * icons take the colour of whatever they sit in and re-theme for free.
 */

import type { IconName } from './nav'

const PATHS: Record<IconName | 'chevron' | 'sun' | 'moon', string> = {
  grid: 'M3 3h6v6H3zM11 3h6v6h-6zM3 11h6v6H3zM11 11h6v6h-6z',
  plus: 'M10 4v12M4 10h12',
  draft: 'M5 2.5h6L15 6.5v11H5zM11 2.5V7h4',
  widgets: 'M4 12v4M8 8v8M12 4v12M16 10v6',
  database: 'M10 2.5c3.6 0 6 1 6 2s-2.4 2-6 2-6-1-6-2 2.4-2 6-2zM4 4.5v10c0 1 2.4 2 6 2s6-1 6-2v-10M4 9.5c0 1 2.4 2 6 2s6-1 6-2',
  chevron: 'M7.5 4.5 12 10l-4.5 5.5',
  sun: 'M10 13.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM10 1.5v2M10 16.5v2M3.5 10h-2M18.5 10h-2M5.4 5.4 4 4M16 16l-1.4-1.4M5.4 14.6 4 16M16 4l-1.4 1.4',
  moon: 'M16 11.5A6.5 6.5 0 0 1 8.5 4a6.5 6.5 0 1 0 7.5 7.5z',
}

export function Icon({
  name,
  size = 18,
  filled = false,
}: {
  name: IconName | 'chevron' | 'sun' | 'moon'
  size?: number
  filled?: boolean
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <path
        d={PATHS[name]}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? 'currentColor' : 'none'}
      />
    </svg>
  )
}
