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

  test('a bound parameter travels as `default_filters`', () => {
    const transaction = payloadFor(1)
    const bound = transaction.widgets.filter((widget) => widget.default_filters)
    expect(bound).toHaveLength(2)
    for (const widget of bound) expect(widget.default_filters).toEqual({ status: 'failed' })
  })

  test('and no other Widget claims a filter it was not given', () => {
    // `{}` would read as "the Author fixed nothing", asserted rather than known.
    for (let index = 0; index < PENIREMIT_BOARDS.length; index += 1) {
      for (const widget of payloadFor(index).widgets) {
        expect(widget.default_filters === undefined || Object.keys(widget.default_filters).length > 0).toBe(true)
      }
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
