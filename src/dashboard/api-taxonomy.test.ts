/**
 * The wire taxonomy — D28.
 *
 * Nineteen of the thirty-seven built Visualization Types were rejected on save:
 * sixteen because their id is spelled differently upstream, three because the
 * API has no identifier for them at all. The sixteen are translated here; the
 * three cannot be, and the composer says so.
 *
 * The last test in this file is the interesting one. It asserts the translation
 * is still *needed*, so when the backend adopts §4.2's identifiers this file
 * fails and gets deleted rather than quietly outliving its reason.
 */

import { describe, expect, test } from 'bun:test'
import {
  UNMAPPED_TYPE_IDS,
  acceptedByApi,
  visualizationTypeFromApi,
  visualizationTypeToApi,
} from './api-taxonomy'
import { WIDGET_TYPES } from '../analytics/widgets/catalog'
import { visualizationTypes } from '../visualization/visualization-types'

/** Exactly as the backend team listed them on 14 September. */
const ACCEPTED = new Set([
  'data-table', 'pivot-table', 'comparison-table',
  'line', 'area', 'spline', 'step',
  'bar', 'horizontal-bar', 'grouped-bar', 'stacked-bar',
  'pie', 'donut', 'stacked-100-bar', 'treemap',
  'histogram', 'box-plot', 'violin-plot',
  'scatter', 'bubble', 'heatmap-matrix',
  'bar-race', 'funnel', 'sankey',
  'choropleth-map', 'point-map',
  'radar', 'gauge',
  'stat-card', 'progress-tracker',
  'sparkline-card', 'delta-card',
  'top-n-list', 'leaderboard',
  'calendar-heatmap', 'cohort-grid', 'gantt',
  'status-badge', 'alert-banner', 'threshold-indicator',
])

describe('every Type we can send, we send under a name they accept', () => {
  test('each built Type either translates or already agrees', () => {
    /*
     * The property that matters. Before this, `line-chart` went out verbatim and
     * came back a 400 — and the Author had built the whole widget by then.
     */
    for (const type of WIDGET_TYPES.filter((t) => t.built && acceptedByApi(t.id))) {
      expect(ACCEPTED.has(visualizationTypeToApi(type.id)), `${type.id} is not accepted`).toBe(true)
    }
  })

  test('an id that already agrees is not touched', () => {
    expect(visualizationTypeToApi('stat-card')).toBe('stat-card')
    expect(visualizationTypeToApi('treemap')).toBe('treemap')
  })

  test('the renames are the ones the answer listed', () => {
    expect(visualizationTypeToApi('line-chart')).toBe('line')
    expect(visualizationTypeToApi('bar-chart-vertical')).toBe('bar')
    expect(visualizationTypeToApi('ranked-list')).toBe('top-n-list')
    expect(visualizationTypeToApi('timeline-chart')).toBe('gantt')
  })
})

describe('what goes out comes back as itself', () => {
  test('every built Type round-trips', () => {
    // A board saved and reloaded must render the same widgets. A one-way
    // translation would turn every line chart into an unknown-type error card
    // on the next load.
    for (const type of WIDGET_TYPES.filter((t) => t.built)) {
      expect(visualizationTypeFromApi(visualizationTypeToApi(type.id))).toBe(type.id)
    }
  })

  test('an id from neither vocabulary is left alone', () => {
    /*
     * A Type a newer frontend authored. Passing it through unchanged lets the
     * Widget render as a card that cannot draw, which is recoverable; guessing a
     * substitute would put a different chart on someone's board.
     */
    expect(visualizationTypeFromApi('sunburst')).toBe('sunburst')
    expect(visualizationTypeToApi('sunburst')).toBe('sunburst')
  })
})

describe('the three with no identifier at all', () => {
  test('they are named, not inferred', () => {
    expect([...UNMAPPED_TYPE_IDS].sort()).toEqual([
      'activity-feed',
      'event-log-view',
      'status-list',
    ])
  })

  test('each is a Type we actually build', () => {
    // A stale entry here would hide a Type that works, which is the opposite of
    // the intent. Checked against the built catalogue rather than the §4.2
    // registry because `status-list` is in one and not the other — it is our
    // proposed 43rd Type (D7), which is part of why the API has no name for it.
    for (const id of UNMAPPED_TYPE_IDS) {
      expect(
        WIDGET_TYPES.some((type) => type.id === id && type.built),
        `${id} is not a built Type`,
      ).toBe(true)
    }
  })

  test('two of the three are the Chronological Family, which their taxonomy lacks', () => {
    // Not a spelling difference — a missing concept. §4.2 gives Chronological
    // its own Data Shape (a time-ordered event stream, no Measure required) and
    // the API's fourteen families have no counterpart.
    const chronological = visualizationTypes.filter((type) => type.familyId === 'chronological')
    expect(chronological.map((type) => type.id).sort()).toEqual(['activity-feed', 'event-log-view'])
  })

  test('none of them has an accepted name upstream', () => {
    for (const id of UNMAPPED_TYPE_IDS) {
      expect(ACCEPTED.has(visualizationTypeToApi(id))).toBe(false)
    }
  })

  test('an unmapped id is still sent unchanged rather than suppressed', () => {
    /*
     * The save fails with a 400 naming the field, which is truthful. Substituting
     * some other Type would put a chart on the board that is not the one the
     * Author built, and nothing would say so.
     */
    expect(visualizationTypeToApi('activity-feed')).toBe('activity-feed')
  })
})

describe('the translation knows when it is no longer needed', () => {
  test('at least one id still differs', () => {
    /*
     * The deletion trigger. When the backend adopts §4.2's identifiers this
     * fails, and the right response is to delete `api-taxonomy.ts` and this
     * file — not to relax the assertion. A translation table nobody needs is
     * exactly the kind of thing that survives for years because removing it felt
     * like a risk.
     */
    const differing = WIDGET_TYPES.filter(
      (type) => type.built && visualizationTypeToApi(type.id) !== type.id,
    )
    expect(differing.length).toBeGreaterThan(0)
  })
})
