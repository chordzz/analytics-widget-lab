/**
 * Board ↔ Dashboard, both ways.
 *
 * D23 is paid off here: the API embeds Widgets by value and we reference them by
 * id, so every test that matters is about the join surviving a round trip. The
 * mapping gets its own group because it is the field with nowhere official to
 * go, and losing it does not degrade a Widget — it unmakes one.
 */

import { describe, expect, test } from 'bun:test'
import { boardFrom, dashboardInputFrom, isLive, scopeInputFrom, type ApiDashboard } from './api-dashboard'
import { dateRangeControl, section } from '../domain/composition'
import type { Board } from '../analytics/builder/boards'

const board: Board = {
  id: 'b1',
  name: 'Finance daily',
  description: 'Settlements and refunds',
  authorId: 'actor-1',
  status: 'draft',
  scope: { kind: 'personal' },
  shareGrants: [],
  updated: '2026-09-01',
  widgets: {
    w1: {
      id: 'w1',
      typeId: 'line-chart',
      datasetId: 'peniremit.settlements',
      title: 'Settlements',
      subtitle: 'by day',
      mapping: { x: 'day', series: ['total_amount'] },
      exposedFilters: ['currency'],
      exposedSorts: ['day'],
      options: { stacked: true },
    },
  },
  placements: [{ widgetId: 'w1', x: 0, y: 0, w: 6, h: 4 }],
  controls: [dateRangeControl('c1', 'Period')],
  sections: [section('s1', 'Headline', 0)],
}

describe('a Widget is joined on the way out and split on the way in', () => {
  test('the layout travels with the Widget, as the API expects', () => {
    const [widget] = dashboardInputFrom(board).widgets
    expect(widget.layout).toEqual({ x: 0, y: 0, w: 6, h: 4 })
    expect(widget.dataset_id).toBe('peniremit.settlements')
  })

  test('and comes back as a reference plus a placement', () => {
    // D23, in both directions. The model keeps them apart because a Widget in
    // the Library outlives any one board (FR-VZ-09, Finding 4).
    const round = boardFrom(asDashboard(dashboardInputFrom(board)), 'actor-1')
    expect(Object.keys(round.widgets)).toEqual(['w1'])
    expect(round.placements).toEqual([{ widgetId: 'w1', x: 0, y: 0, w: 6, h: 4 }])
  })

  test('a placement pointing at nothing cannot be produced', () => {
    // `placedWidgets` drops the orphan, so a board whose placement outlived its
    // widget sends fewer widgets rather than a widget with no spec.
    const orphaned: Board = {
      ...board,
      placements: [...board.placements, { widgetId: 'gone', x: 6, y: 0, w: 6, h: 4 }],
    }
    expect(dashboardInputFrom(orphaned).widgets).toHaveLength(1)
  })
})

describe('the mapping survives, because a Widget without one is not a Widget', () => {
  test('it round trips through presentation_options', () => {
    /*
     * Finding 23. The API's Widget schema has no field for which Field feeds
     * which axis — a line chart over a Dataset with three Measures is three
     * different charts and nothing distinguishes them. `presentation_options`
     * is the only home, and its documented promise ("every option has a
     * default, so an absent value is never an error") does not hold for this
     * one.
     */
    const round = boardFrom(asDashboard(dashboardInputFrom(board)), 'actor-1')
    expect(round.widgets.w1.mapping).toEqual({ x: 'day', series: ['total_amount'] })
  })

  test('so do the other settings the API has no field for', () => {
    const round = boardFrom(asDashboard(dashboardInputFrom(board)), 'actor-1')
    expect(round.widgets.w1.subtitle).toBe('by day')
    expect(round.widgets.w1.exposedSorts).toEqual(['day'])
    expect(round.widgets.w1.options).toEqual({ stacked: true })
  })

  test('our keys are namespaced, so a publisher option cannot collide', () => {
    const [widget] = dashboardInputFrom(board).widgets
    expect(Object.keys(widget.presentation_options ?? {}).every((key) => key.startsWith('smc.'))).toBe(
      true,
    )
  })

  test('a Widget arriving without one renders as unmappable, not as a crash', () => {
    // One bad Widget must not take the board down with it. Partial failure is
    // the pattern the six render states exist to support.
    const round = boardFrom(
      {
        id: 'b1',
        name: 'x',
        widgets: [{ id: 'w1', dataset_id: 'd', visualization_type: 'line' }],
      },
      'actor-1',
    )
    expect(round.widgets.w1.mapping).toEqual({})
  })
})

describe('composition elements travel whole', () => {
  test('controls and sections round trip', () => {
    const round = boardFrom(asDashboard(dashboardInputFrom(board)), 'actor-1')
    expect(round.controls).toEqual(board.controls)
    expect(round.sections).toEqual(board.sections)
  })

  test("a Section's row survives, because membership is derived from it", () => {
    // D19 — a Widget's Section is computed from `y`, not stored. A lossy round
    // trip here files Widgets under the wrong headings.
    const moved: Board = { ...board, sections: [section('s1', 'Detail', 8)] }
    const round = boardFrom(asDashboard(dashboardInputFrom(moved)), 'actor-1')
    expect(round.sections[0].y).toBe(8)
  })

  test('a Dashboard with no composition elements is not a crash', () => {
    const round = boardFrom({ id: 'b', name: 'x', composition_elements: null }, 'actor-1')
    expect(round.controls).toEqual([])
    expect(round.sections).toEqual([])
  })
})

describe('scope, across four levels and three kinds', () => {
  test('personal and organization map straight across', () => {
    expect(scopeInputFrom({ kind: 'personal' })).toEqual({ scope_level: 'personal' })
    expect(scopeInputFrom({ kind: 'organization-wide' })).toEqual({ scope_level: 'organization' })
  })

  test('an organizational scope is their department, and carries the reference', () => {
    expect(scopeInputFrom({ kind: 'organizational-scope', scopeId: 'dept-finance', label: 'Finance' })).toEqual(
      { scope_level: 'department', scope_organizational_ref: 'dept-finance' },
    )
  })

  test('their role level folds into the same kind rather than being dropped', () => {
    /*
     * D25. We model no role Scope, and their own note says a `role` scope
     * "currently admits only the creator and Administrators" — so showing it as
     * personal would understate it and inventing a kind would overstate it.
     * Naming it a scope reference we hold and do not interpret is the honest
     * middle.
     */
    const scope = boardFrom(
      { id: 'b', name: 'x', scope_level: 'role', scope_organizational_ref: 'role-analyst' },
      'a',
    ).scope
    expect(scope).toEqual({
      kind: 'organizational-scope',
      scopeId: 'role-analyst',
      label: 'role-analyst',
    })
  })

  test('an unknown level is personal, which is the safe direction to be wrong in', () => {
    expect(boardFrom({ id: 'b', name: 'x', scope_level: 'novel' }, 'a').scope).toEqual({
      kind: 'personal',
    })
  })
})

describe('a Widget with no layout is stacked, not piled', () => {
  test('each lands on its own row', () => {
    // Every Widget at {0,0} renders as one card with the rest hidden beneath
    // it, which reads as data loss. A column down the left reads as unarranged.
    const round = boardFrom(
      {
        id: 'b',
        name: 'x',
        widgets: [
          { id: 'w1', dataset_id: 'd', visualization_type: 'line' },
          { id: 'w2', dataset_id: 'd', visualization_type: 'line' },
        ],
      },
      'a',
    )
    expect(round.placements.map((p) => p.y)).toEqual([0, 4])
  })

  test('a width beyond the grid is clamped rather than overflowing it', () => {
    const round = boardFrom(
      { id: 'b', name: 'x', widgets: [{ id: 'w1', dataset_id: 'd', visualization_type: 'line', layout: { x: 10, y: 0, w: 99, h: 4 } }] },
      'a',
    )
    expect(round.placements[0].w).toBe(12)
    expect(round.placements[0].x).toBe(0)
  })
})

describe('attribution and status', () => {
  test('the creator is the author, not whoever is looking', () => {
    // A Dashboard survives its creator being removed from IAM and stays
    // attributed to them — their words, and the reason there is no foreign key.
    expect(boardFrom({ id: 'b', name: 'x', creator_actor_id: 'actor-9' }, 'me').authorId).toBe(
      'actor-9',
    )
  })

  test('anything but published is a draft', () => {
    expect(boardFrom({ id: 'b', name: 'x' }, 'a').status).toBe('draft')
    expect(boardFrom({ id: 'b', name: 'x', status: 'published' }, 'a').status).toBe('published')
  })

  test('a deleted Dashboard is a status, never a removed row', () => {
    expect(isLive({ id: 'b', name: 'x', deleted: true })).toBe(false)
    expect(isLive({ id: 'b', name: 'x' })).toBe(true)
  })

  test('grants are empty because this response does not carry them', () => {
    // Finding 24 — Share Grants are their own sub-resource and the read
    // endpoint does not embed them. Empty here says "not in this response",
    // which is different from asserting there are none.
    expect(boardFrom({ id: 'b', name: 'x' }, 'a').shareGrants).toEqual([])
  })
})

/** What the API would echo back after a save. */
function asDashboard(input: ReturnType<typeof dashboardInputFrom>): ApiDashboard {
  return {
    id: 'b1',
    name: input.name,
    description: input.description,
    widgets: input.widgets,
    composition_elements: input.composition_elements,
    creator_actor_id: 'actor-1',
    updated_at: '2026-09-01T10:00:00Z',
  }
}

/*
 * Bound Filter Parameters, and where they are stored.
 *
 * They were written only to `presentation_options` under a private key, which
 * Analytics treats as opaque — so nothing validated them and nothing but us
 * could read them. The chart was still right, because we send the parameters
 * ourselves on the query call; the *record* was not. A Dashboard whose Widget
 * is titled "Failed transactions" carried no evidence of the narrowing anywhere
 * the API could see.
 */
describe('a binding is stored where the API declares it', () => {
  const bound = (bindings?: Record<string, string | number>): Board => ({
    ...board,
    widgets: {
      w1: {
        id: 'w1',
        typeId: 'stat-card',
        datasetId: 'peniremit.transaction-count-summary',
        mapping: { value: 'value' },
        ...(bindings ? { parameterBindings: bindings } : {}),
      },
    },
    placements: [{ widgetId: 'w1', x: 0, y: 0, w: 3, h: 1 }],
  })

  test('it travels as `default_filters`', () => {
    const [widget] = dashboardInputFrom(bound({ status: 'failed' })).widgets
    expect(widget.default_filters).toEqual({ status: 'failed' })
  })

  test('a Widget with no binding sends no filters at all', () => {
    // `{}` would read as "the Author fixed nothing", which is the same thing
    // said more confidently than we know it.
    const [widget] = dashboardInputFrom(bound()).widgets
    expect(widget.default_filters).toBeUndefined()
  })

  test('it comes back from the declared field', () => {
    const board = boardFrom({ id: 'b', name: 'B', widgets: [
      { id: 'w1', dataset_id: 'd', visualization_type: 'stat-card',
        default_filters: { status: 'failed' } },
    ] })
    expect(board.widgets.w1.parameterBindings).toEqual({ status: 'failed' })
  })

  test('and from the private key, for Widgets stored before today', () => {
    const board = boardFrom({ id: 'b', name: 'B', widgets: [
      { id: 'w1', dataset_id: 'd', visualization_type: 'stat-card',
        presentation_options: { 'smc.parameterBindings': { status: 'failed' } } },
    ] })
    expect(board.widgets.w1.parameterBindings).toEqual({ status: 'failed' })
  })

  test('a value no query could carry is dropped rather than sent', () => {
    /*
     * `default_filters` is `additionalProperties: true`, so anything may arrive.
     * An object binding would stringify to `[object Object]` upstream, narrow to
     * nothing, and look like an empty Dataset rather than a broken filter.
     */
    const board = boardFrom({ id: 'b', name: 'B', widgets: [
      { id: 'w1', dataset_id: 'd', visualization_type: 'stat-card',
        default_filters: { status: 'failed', broken: { nested: true }, nan: Number.NaN } },
    ] })
    expect(board.widgets.w1.parameterBindings).toEqual({ status: 'failed' })
  })
})
