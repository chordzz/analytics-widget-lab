/**
 * `built: true` means there is a path from spec to pixels.
 *
 * Merge §2, prerequisite 2. The generated contract docs used to read build
 * status from the workbench's renderer *registry*, whose whole virtue was that
 * registration is explicit: the documentation could not claim something was
 * built that wasn't. Deleting `src/renderers/` removes that, and
 * `WidgetType.built` is a hand-set boolean — so this is the guarantee, recovered.
 *
 * Read as **source text**, deliberately. `render.test.tsx` already renders every
 * built type and asserts the markup is non-empty, and that assertion cannot
 * catch this: `renderBody` ends in `default: return null`, and a card with a
 * title and an empty body is perfectly non-empty markup. A type flagged built
 * with no branch in the switch would render as a titled blank in the UI and pass
 * every other test in the suite.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { WIDGET_TYPES } from './catalog'

const source = readFileSync(join(import.meta.dir, 'Widget.tsx'), 'utf8')

/** Every `case 'x':` in the file, whatever its indentation. */
const cases = new Set(
  Array.from(source.matchAll(/case\s+'([a-z0-9-]+)'\s*:/g), (match) => match[1]),
)

const built = WIDGET_TYPES.filter((type) => type.built)
const unbuilt = WIDGET_TYPES.filter((type) => !type.built)

describe('build status is not a claim', () => {
  test('the scan found the switch at all', () => {
    // Without this the two assertions below are vacuous: a regex that matched
    // nothing would report every type as built-and-branchless, or none.
    expect(cases.size).toBeGreaterThan(20)
  })

  test('every built type has a branch in renderBody', () => {
    const branchless = built.filter((type) => !cases.has(type.id))
    expect(branchless.map((type) => type.id)).toEqual([])
  })

  test('every unbuilt type has none', () => {
    /*
     * The other direction, and the one that keeps the flag honest rather than
     * merely satisfied: a type that draws fine but is still flagged unbuilt is
     * hidden from the picker for no reason, and the gallery tells a reader it
     * cannot be drawn.
     */
    const drawable = unbuilt.filter((type) => cases.has(type.id))
    expect(drawable.map((type) => type.id)).toEqual([])
  })

  test('the counts are the ones the docs report', () => {
    // `rendererCoverage()` in contract-docs reads these, so a change here shows
    // up as a docs diff rather than silently.
    expect({ built: built.length, total: WIDGET_TYPES.length }).toEqual({
      built: 42,
      total: 43,
    })
  })
})
