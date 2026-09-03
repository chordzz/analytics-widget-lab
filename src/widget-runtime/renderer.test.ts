import { describe, expect, test } from 'bun:test'
import { getRenderer, registeredRendererIds, registerRenderer } from './renderer'

/*
 * Merge §2 deleted `src/renderers/` and the four tests that lived here about its
 * registrations — how many Families they covered, that each named a real Type,
 * that registering twice was idempotent. All four described the built-in set,
 * and there is no built-in set any more: the product module draws from its own
 * switch in `analytics/widgets/Widget.tsx`, and "which Types can be drawn" is
 * answered by its catalogue.
 *
 * What is left is the registry's *contract*, which is the part that traces to a
 * requirement rather than to a phase of work.
 */

describe('renderer registry', () => {
  test('an unregistered Type resolves to undefined rather than throwing', () => {
    // The runtime has to report a missing renderer plainly. Nothing is
    // registered by default now, so any id demonstrates it.
    expect(getRenderer('violin-plot')).toBeUndefined()
  })

  test('a registered renderer comes back', () => {
    // The counterpart, so the test above cannot pass because the registry is
    // simply broken.
    registerRenderer({ visualizationTypeId: 'fixture-type', render: () => null })
    expect(getRenderer('fixture-type')).toBeDefined()
    expect(registeredRendererIds()).toContain('fixture-type')
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
