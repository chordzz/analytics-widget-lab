/**
 * The payload, checked without a token.
 *
 * Everything here is a property of what gets sent, and every one of them has a
 * failure that is silent rather than loud: a client-minted Widget id persists
 * into their records, two Widgets in one cell renders as one on top of the
 * other, and a dropped binding shows the unfiltered figure under a title that
 * says otherwise.
 */

import { describe, expect, test } from 'bun:test'
import { boardFrom } from './create-boards'
import { PENIREMIT_BOARDS } from '../src/boards/peniremit-boards'
import { dashboardInputFrom } from '../src/dashboard/api-dashboard'
import { DASHBOARD_COLUMNS } from '../src/domain/composition'

const omitLocal = (clientId: string) => (clientId.startsWith('local:') ? undefined : clientId)
const payloadFor = (index: number) =>
  dashboardInputFrom(boardFrom(PENIREMIT_BOARDS[index]), omitLocal)

describe('the layout', () => {
  test('no two Widgets occupy the same cell', () => {
    for (const definition of PENIREMIT_BOARDS) {
      const taken = new Set<string>()
      const collisions: string[] = []
      for (const placement of boardFrom(definition).placements) {
        for (let x = placement.x; x < placement.x + placement.w; x += 1) {
          for (let y = placement.y; y < placement.y + placement.h; y += 1) {
            const cell = `${String(x)},${String(y)}`
            if (taken.has(cell)) collisions.push(`${definition.name} at ${cell}`)
            taken.add(cell)
          }
        }
      }
      expect(collisions).toEqual([])
    }
  })

  test('nothing runs past the last column', () => {
    for (const definition of PENIREMIT_BOARDS) {
      for (const placement of boardFrom(definition).placements) {
        expect({
          board: definition.name,
          right: placement.x + placement.w,
          within: placement.x + placement.w <= DASHBOARD_COLUMNS,
        }).toEqual({ board: definition.name, right: placement.x + placement.w, within: true })
      }
    }
  })

  test('the order on the board is the order in the definition', () => {
    // The definitions follow the guide's order, and a reader comparing the two
    // side by side is the point of keeping the card names.
    const board = boardFrom(PENIREMIT_BOARDS[0])
    const reading = [...board.placements].sort((a, b) => a.y - b.y || a.x - b.x)
    expect(reading.map((placement) => placement.widgetId)).toEqual(
      board.placements.map((placement) => placement.widgetId),
    )
  })
})

describe('the payload', () => {
  test('carries no Widget id, so the API names them', () => {
    /*
     * `local:w-4klw2vxzdo` reached their stored Dashboards once because we sent
     * an id we had minted. `Widget.id` is "assigned on save when absent".
     */
    for (let index = 0; index < PENIREMIT_BOARDS.length; index += 1) {
      const minted = payloadFor(index).widgets.filter((widget) => widget.id !== undefined)
      expect(minted.map((widget) => widget.id)).toEqual([])
    }
  })

  test('every Widget names its Dataset and its Type', () => {
    // Both are required by the schema, and a Widget missing either is refused
    // for the whole Dashboard rather than on its own.
    for (let index = 0; index < PENIREMIT_BOARDS.length; index += 1) {
      for (const widget of payloadFor(index).widgets) {
        expect(Boolean(widget.dataset_id && widget.visualization_type)).toBe(true)
      }
    }
  })

  test('every Widget carries the range it cannot be queried without', () => {
    /*
     * `from` and `to` are `required: true` on all 41 Datasets. A Widget binding
     * neither is not a Widget with an unset filter — it is a query that will be
     * refused, which is what happened to all 55 on the first create.
     */
    for (let index = 0; index < PENIREMIT_BOARDS.length; index += 1) {
      for (const widget of payloadFor(index).widgets) {
        expect({ title: widget.title, from: widget.default_filters?.from, to: widget.default_filters?.to })
          .toEqual({ title: widget.title, from: '2026-03-01', to: '2026-10-01' })
      }
    }
  })

  test('and no Widget offers its own picker for it', () => {
    /*
     * This asserted `['from', 'to']` on every Widget, and was right when a
     * board's date Control could not reach one that bound a range: exposing
     * them per card was the only way to move a period at all. It put twenty
     * native date inputs on the Growth board, two above every figure.
     *
     * The Control governs the range now, so a per-Widget picker is a second
     * way of saying the same thing — with the board's answer and twenty local
     * answers free to disagree. Exposure is an Author's choice per Widget
     * rather than a default.
     */
    for (let index = 0; index < PENIREMIT_BOARDS.length; index += 1) {
      for (const widget of payloadFor(index).widgets) {
        expect(widget.exposed_filters).toEqual([])
      }
    }
  })

  test('the board carries one period instead', () => {
    /*
     * What replaces them. It stores no value — a Control's value is session
     * state — so the board opens with each Widget on the range it carries as a
     * default, which is the same range for all of them.
     */
    for (const definition of PENIREMIT_BOARDS) {
      const controls = boardFrom(definition).controls
      expect(controls).toHaveLength(1)
      expect(controls[0].controlType).toBe('date-range')
    }
  })

  test("a card's own binding sits beside the range, not instead of it", () => {
    const bound = payloadFor(1).widgets.filter((widget) => widget.default_filters?.status)
    expect(bound).toHaveLength(2)
    for (const widget of bound) {
      expect(widget.default_filters).toEqual({
        from: '2026-03-01',
        to: '2026-10-01',
        status: 'failed',
      })
    }
  })

  test('the mapping survives, because a Widget without one draws nothing', () => {
    for (let index = 0; index < PENIREMIT_BOARDS.length; index += 1) {
      for (const widget of payloadFor(index).widgets) {
        const mapping = widget.presentation_options?.['smc.mapping']
        expect(Object.keys(mapping as object).length).toBeGreaterThan(0)
      }
    }
  })
})
