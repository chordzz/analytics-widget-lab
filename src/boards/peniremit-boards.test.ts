/**
 * Every card, checked against the declaration before anything is created.
 *
 * A Widget whose Type its Dataset cannot carry is refused by
 * `POST /v1/dashboards` — `visualization_type` is validated on save against the
 * Families the bound Dataset satisfies. Finding that out mid-create leaves a
 * half-built Dashboard and needs a token to discover. Finding it here needs
 * neither.
 */

import { describe, expect, test } from 'bun:test'
import { PENIREMIT_BOARDS, datasetsUsedBy, requirePeniremitDataset } from './peniremit-boards'
import { toApiDataset } from './peniremit-dataset'
import { datasetFrom } from '../catalogue/api-dataset'
import { typesFor, slotsFor, unavailableTypesFor } from '../analytics/builder/requirements'
import { WIDGET_TYPES } from '../analytics/widgets/catalog'

const domainOf = (id: string) => datasetFrom(toApiDataset(requirePeniremitDataset(id)))

describe('every card names something real', () => {
  test('every bound Dataset is one Peniremit declares', () => {
    for (const board of PENIREMIT_BOARDS) {
      for (const id of datasetsUsedBy(board)) {
        expect(() => requirePeniremitDataset(id)).not.toThrow()
      }
    }
  })

  test('every Type is one we have built', () => {
    const built = new Set(WIDGET_TYPES.filter((type) => type.built).map((type) => type.id))
    for (const board of PENIREMIT_BOARDS) {
      for (const card of board.cards) {
        expect({ card: card.title, typeId: card.typeId, built: built.has(card.typeId) }).toEqual({
          card: card.title, typeId: card.typeId, built: true,
        })
      }
    }
  })

  test('every mapped Field is one the Dataset declares', () => {
    // A key that does not exist reads as empty rather than erroring, so a typo
    // here draws a chart of nothing at all.
    for (const board of PENIREMIT_BOARDS) {
      for (const card of board.cards) {
        const keys = new Set(requirePeniremitDataset(card.datasetId).keys)
        const mapped = Object.values(card.mapping).flat()
        for (const key of mapped) {
          expect({ card: card.title, key, declared: keys.has(key) }).toEqual({
            card: card.title, key, declared: true,
          })
        }
      }
    }
  })
})

describe('every card can actually be built', () => {
  test('the Dataset carries the Type the card asks for', () => {
    /*
     * The one that matters. This is the same check the API runs on save, so a
     * failure here is a `POST /v1/dashboards` that would have been refused.
     */
    const refused: string[] = []
    for (const board of PENIREMIT_BOARDS) {
      for (const card of board.cards) {
        const offered = typesFor(domainOf(card.datasetId)).map((type) => type.id)
        if (!offered.includes(card.typeId)) {
          const why = unavailableTypesFor(domainOf(card.datasetId))
            .find((entry) => entry.type.id === card.typeId)
          refused.push(`${card.title} · ${card.typeId} on ${card.datasetId} — ${why?.reason.because ?? 'not offered'}`)
        }
      }
    }
    expect(refused).toEqual([])
  })

  test('every required slot is filled', () => {
    // An unfilled required slot renders an empty card rather than failing.
    const unfilled: string[] = []
    for (const board of PENIREMIT_BOARDS) {
      for (const card of board.cards) {
        for (const slot of slotsFor(card.typeId)) {
          if (slot.min === 0) continue
          const assigned = card.mapping[slot.id]
          const count = Array.isArray(assigned) ? assigned.length : assigned ? 1 : 0
          if (count < slot.min) {
            unfilled.push(`${card.title} · ${card.typeId} needs ${String(slot.min)} × ${slot.id}, has ${String(count)}`)
          }
        }
      }
    }
    expect(unfilled).toEqual([])
  })
})

describe('bound parameters are ones the Dataset advertises', () => {
  test('every bound parameter is declared, with a permitted value', () => {
    /*
     * The query endpoint refuses any parameter a Dataset did not advertise, and
     * any value outside `allowed_values`, before anything leaves Analytics. So
     * a wrong name here is a 400 on every load of that Widget — and it is the
     * mistake this file was written with: `status` was assumed undeclared and
     * a working card was routed around.
     */
    const wrong: string[] = []
    for (const board of PENIREMIT_BOARDS) {
      for (const card of board.cards) {
        for (const [name, value] of Object.entries(card.parameters ?? {})) {
          const declared = domainOf(card.datasetId).filterParameters ?? []
          const parameter = declared.find((entry) => entry.name === name)
          if (!parameter) {
            wrong.push(`${card.title} binds \`${name}\`, which ${card.datasetId} does not declare`)
            continue
          }
          if (parameter.allowedValues && !parameter.allowedValues.includes(value)) {
            wrong.push(
              `${card.title} binds ${name}=${value}, outside ${parameter.allowedValues.join('|')}`,
            )
          }
        }
      }
    }
    expect(wrong).toEqual([])
  })
})

describe('the layout is sane', () => {
  test('no card is wider than the board', () => {
    for (const board of PENIREMIT_BOARDS) {
      for (const card of board.cards) {
        expect({ card: card.title, fits: card.w >= 1 && card.w <= 12 }).toEqual({
          card: card.title, fits: true,
        })
      }
    }
  })
})
