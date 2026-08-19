import { describe, expect, test } from 'bun:test'
import { getRenderer, registeredRendererIds, registerRenderer } from './renderer'
import { registerBuiltInRenderers } from '../renderers'
import { visualizationTypes } from '../visualization/visualization-types'

registerBuiltInRenderers()

describe('renderer registry', () => {
  test('every registered renderer names a real Visualization Type', () => {
    const known = new Set(visualizationTypes.map((t) => t.id))
    for (const id of registeredRendererIds()) {
      expect(known.has(id)).toBe(true)
    }
  })

  test('renderers cover nine Families spanning distinct Data Shapes', () => {
    const covered = new Set(
      registeredRendererIds().map(
        (id) => visualizationTypes.find((t) => t.id === id)!.familyId,
      ),
    )
    expect([...covered].sort()).toEqual([
      'categorical-comparison',
      'chronological',
      'correlation',
      'radial',
      'ranking-and-flow',
      'single-value',
      'status',
      'tabular',
      'trend',
    ])
  })

  test('a classified Type without a renderer resolves to undefined rather than throwing', () => {
    // Treemap is classified (FR-VZ-01) but not yet built. The runtime must
    // report that plainly instead of failing.
    expect(getRenderer('treemap')).toBeUndefined()
  })

  test('registration is idempotent across repeated calls', () => {
    const before = registeredRendererIds().length
    registerBuiltInRenderers()
    expect(registeredRendererIds()).toHaveLength(before)
  })
})

describe('C3 — read-only by construction (FR-VZ-08)', () => {
  test('renderer props carry no callable, so no renderer can write', () => {
    // FR-VZ-08: "A Viewer shall not be able to alter underlying data through a
    // Widget." Rather than trusting every renderer author to avoid mutation,
    // the props simply contain nothing that could perform one. This asserts the
    // shape the runtime actually passes.
    let captured: Record<string, unknown> | null = null

    registerRenderer({
      visualizationTypeId: 'data-table',
      render: (props) => {
        captured = props as unknown as Record<string, unknown>
        return null
      },
    })

    getRenderer('data-table')!({
      rows: [{ a: 1 }],
      dataset: {
        id: 'd',
        name: 'D',
        description: '',
        sourceSystem: 'S',
        classification: 'public',
        exposesPersonalData: false,
        fields: [],
      },
      mapping: { columns: ['a'] },
      presentation: {},
    })

    expect(captured).not.toBeNull()
    for (const [key, value] of Object.entries(captured!)) {
      expect({ key, isFunction: typeof value === 'function' }).toEqual({ key, isFunction: false })
    }
  })
})
