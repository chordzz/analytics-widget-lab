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

/*
 * A stat card showing the movement its publisher computed.
 *
 * All 22 were bare figures. A stat card receives one aggregated row, so it
 * cannot derive movement — and deriving it was worse than not: the old code
 * showed a whole period's total beside a delta computed from the last two
 * records, a 24-month figure labelled "vs. last month".
 *
 * Peniremit publishes the comparison as its own Measure, so there is nothing
 * to derive. This is the model working: Analytics computes nothing, the
 * publisher does, and we read it.
 */
describe('a published change', () => {
  const statCards = PENIREMIT_BOARDS.flatMap((board) =>
    board.cards.filter((card) => card.typeId === 'stat-card'),
  )

  test('every stat card maps one', () => {
    const bare = statCards.filter((card) => !card.mapping.delta)
    expect(bare.map((card) => card.title)).toEqual([])
  })

  test('and it is a Measure the Dataset declares', () => {
    // A key the Dataset does not carry reads as empty rather than erroring, so
    // a wrong guess here is a card that silently shows no movement at all.
    for (const card of statCards) {
      const keys = requirePeniremitDataset(card.datasetId).keys
      expect({ card: card.title, delta: card.mapping.delta, declared: keys.includes(String(card.mapping.delta)) })
        .toEqual({ card: card.title, delta: card.mapping.delta, declared: true })
    }
  })

  test('it is never the same Measure as the figure', () => {
    // A change equal to its own value is the mapping having gone in a circle.
    for (const card of statCards) expect(card.mapping.delta).not.toBe(card.mapping.value)
  })

  test('and `changePercent` is not used, because nobody has said what it means', () => {
    /*
     * `2.01` is either two per cent or two hundred and one, depending on a
     * convention nobody has stated. A card confidently showing the wrong one is
     * worse than one showing the absolute change, so the absolute is what is
     * mapped until the question comes back.
     */
    for (const card of statCards) expect(String(card.mapping.delta)).not.toContain('ChangePercent')
    for (const card of statCards) expect(card.mapping.delta).not.toBe('changePercent')
  })
})
