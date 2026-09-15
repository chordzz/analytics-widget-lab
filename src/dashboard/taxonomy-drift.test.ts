/**
 * The guard that replaces the one that failed.
 *
 * The previous version asserted our translation table was still needed against a
 * hardcoded copy of the backend's list. When they changed their list the copy
 * went stale, the test kept passing, and the translation became the bug it was
 * written to prevent. So these tests are about the comparison being *sensitive*
 * — it has to notice a change in either direction, or it is the same mistake in
 * a new file.
 */

import { describe, expect, test } from 'bun:test'
import { compareTaxonomy, describeDrift, inAgreement } from './taxonomy-drift'
import { visualizationTypes } from '../visualization/visualization-types'
import { visualizationFamilies } from '../visualization/families'

/** Everything we know, in the shape `/v1/visualizations` returns. */
const wholeTaxonomy = () =>
  visualizationFamilies.map((family) => ({
    family: family.id,
    types: visualizationTypes
      .filter((type) => type.familyId === family.id && type.id !== 'status-list')
      .map((type) => type.id),
  }))

describe('agreement is recognised', () => {
  test('our own manifest, echoed back, is no drift', () => {
    expect(inAgreement(compareTaxonomy(wholeTaxonomy()))).toBe(true)
  })

  test('`status-list` being absent upstream is not drift', () => {
    /*
     * D7 — our own proposed 43rd Type, an extension to §4.2 rather than part of
     * it. The API having no name for it is the expected state, and reporting it
     * every boot would make this a report nobody reads.
     */
    expect(compareTaxonomy(wholeTaxonomy()).oursOnly).toEqual([])
  })

  test('the field is read under either name the API might use', () => {
    // The schema calls it `types`; the change log's example calls it
    // `visualization_types`. Guessing one would make the whole taxonomy look
    // absent, which reads as total drift.
    const asLogged = wholeTaxonomy().map(({ family, types }) => ({
      family,
      visualization_types: types,
    }))
    expect(inAgreement(compareTaxonomy(asLogged))).toBe(true)
  })
})

describe('a change in either direction is noticed', () => {
  test('a type we do not have', () => {
    // A board could arrive carrying it, and we would render a card that cannot
    // draw. Worth knowing before that happens.
    const drift = compareTaxonomy([...wholeTaxonomy(), { family: 'tabular', types: ['sunburst'] }])
    expect(drift.theirsOnly).toEqual(['sunburst'])
    expect(inAgreement(drift)).toBe(false)
  })

  test('a type they do not have', () => {
    /*
     * The case that went undetected last time, in the direction that hurts: an
     * Author builds the widget, it renders, and the save is refused with a 400.
     */
    const thinned = wholeTaxonomy().map((option) => ({
      ...option,
      types: option.types.filter((id) => id !== 'line-chart'),
    }))
    expect(compareTaxonomy(thinned).oursOnly).toEqual(['line-chart'])
  })

  test('a renamed type shows as both, which is what a rename is', () => {
    // Precisely the 15 September change, seen from the other side. Sixteen of
    // these would have been sixteen lines in a log rather than silence.
    const renamed = wholeTaxonomy().map((option) => ({
      ...option,
      types: option.types.map((id) => (id === 'line-chart' ? 'line' : id)),
    }))
    const drift = compareTaxonomy(renamed)
    expect(drift.theirsOnly).toEqual(['line'])
    expect(drift.oursOnly).toEqual(['line-chart'])
  })

  test('a family rename is noticed too', () => {
    const renamed = wholeTaxonomy().map((option) =>
      option.family === 'trend' ? { ...option, family: 'trend-over-time' } : option,
    )
    const drift = compareTaxonomy(renamed)
    expect(drift.familiesTheirsOnly).toEqual(['trend-over-time'])
    expect(drift.familiesOursOnly).toEqual(['trend'])
  })

  test('an empty answer is total drift, not agreement', () => {
    // A deployment that answers with nothing is not a deployment that agrees.
    expect(inAgreement(compareTaxonomy([]))).toBe(false)
  })
})

describe('what it says', () => {
  test('nothing at all when the two agree', () => {
    expect(describeDrift(compareTaxonomy(wholeTaxonomy()))).toEqual([])
  })

  test('and names the consequence, not just the difference', () => {
    const thinned = wholeTaxonomy().map((option) => ({
      ...option,
      types: option.types.filter((id) => id !== 'line-chart'),
    }))
    const said = describeDrift(compareTaxonomy(thinned)).join(' ')
    expect(said).toContain('refuse on save')
    expect(said).toContain('line-chart')
  })
})
