/**
 * How much room a widget needs.
 *
 * Shared between the board and the builder so a widget does not change height
 * the moment you stop editing it. Height is derived from the type rather than
 * stored on the spec: a person placing a stat card should not have to know that
 * 132px is the right answer, and getting it wrong is the fastest way to make a
 * board look untidy.
 *
 * Widgets that read as text need less vertical room than plots; plots with a
 * time axis need more than plots without.
 */

import { widgetType } from './catalog'

export function heightForType(typeId: string): number {
  const type = widgetType(typeId)

  if (type?.family === 'single-value') return typeId === 'progress-tracker' ? 188 : 132
  if (typeId === 'status-indicator') return 132
  if (typeId === 'gauge') return 188
  if (typeId === 'activity-feed') return 300
  if (type?.family === 'tabular') return 320

  /*
   * A calendar heatmap is 53 columns by 7 rows, so its cells are almost always
   * limited by width. Giving it the same height as the other temporal widgets
   * leaves a third of the card empty under the grid.
   */
  if (typeId === 'calendar-heatmap') return 190

  if (type?.family === 'temporal-pattern') return 300
  if (type?.family === 'geospatial') return 320

  return 268
}
