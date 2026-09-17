/**
 * The module catalogue against the FRD manifest.
 *
 * This is the gate that ends the two-track split at its most load-bearing
 * point. The module and the workbench were built to different plans and kept
 * the same vocabulary by discipline alone — which held for 27 of 35 type ids
 * and silently drifted on the other 8. Discipline is not a mechanism, so this
 * is the mechanism.
 *
 * A module widget type is a *rendering* of an FRD Visualization Type. It may be
 * absent (not everything is built) but it may not be **unknown**: an id here
 * that the FRD has never heard of means either a rename nobody propagated or a
 * type nobody classified, and both are how the catalogues came apart the first
 * time.
 */

import { describe, expect, test } from 'bun:test'
import { visualizationFamilies } from '../../visualization/families'
import { visualizationTypes } from '../../visualization/visualization-types'
import { FAMILIES, RENAMED_TYPES, WIDGET_TYPES, currentTypeId } from './catalog'

const frdTypeIds = new Set(visualizationTypes.map((type) => type.id))
const frdFamilyIds = new Set(visualizationFamilies.map((family) => family.id))

/**
 * Module types the FRD does not classify, and why each is allowed.
 *
 * Deliberately a list of *named* exceptions rather than a count or a flag. A new
 * unclassified type fails this suite until someone adds it here with a reason,
 * which is the whole point — the failure is the conversation with the FRD
 * authors, not an obstacle to it.
 *
 * `status-list` (D7): the Status family's three FRD types are `status-indicator`,
 * `threshold-indicator` and `alert-banner`. A list of services each carrying a
 * state is none of them — it is one widget over many rows, where an indicator is
 * one widget over one. Proposed as a 43rd Visualization Type.
 */
const PROPOSED_TYPES: Readonly<Record<string, string>> = {
  'status-list': 'D7 — proposed as a 43rd Visualization Type; see Analytics_Merge_Plan.md §4',
}

describe('every module widget type is an FRD Visualization Type', () => {
  test('no type id is unknown to the manifest', () => {
    const unknown = WIDGET_TYPES.map((type) => type.id)
      .filter((id) => !frdTypeIds.has(id))
      .filter((id) => !(id in PROPOSED_TYPES))

    expect(unknown).toEqual([])
  })

  test('every proposed exception is still an exception', () => {
    // A proposal that gets accepted into the manifest must leave this list, or
    // the list slowly becomes a place ids go to stop being checked.
    for (const id of Object.keys(PROPOSED_TYPES)) {
      expect(frdTypeIds.has(id)).toBe(false)
    }
  })

  test('a module type sits in the same Family the FRD puts it in', () => {
    // Matching ids while disagreeing about the Family would be worse than a
    // rename: the picker would offer a type for a Data Shape it cannot present.
    const misfiled = WIDGET_TYPES.filter((type) => frdTypeIds.has(type.id))
      .map((type) => ({
        id: type.id,
        module: type.family,
        frd: visualizationTypes.find((frd) => frd.id === type.id)!.familyId,
      }))
      .filter((entry) => entry.module !== entry.frd)

    expect(misfiled).toEqual([])
  })
})

describe('every module family is an FRD Visualization Family', () => {
  test('no family id is unknown to the manifest', () => {
    const unknown = FAMILIES.map((family) => family.id).filter((id) => !frdFamilyIds.has(id))
    expect(unknown).toEqual([])
  })

  test('all 13 Families are present, in both directions', () => {
    expect(FAMILIES).toHaveLength(visualizationFamilies.length)
    expect([...frdFamilyIds].filter((id) => !FAMILIES.some((f) => f.id === id))).toEqual([])
  })
})

describe('the rename map', () => {
  test('every old id maps to one the manifest knows', () => {
    for (const [old, next] of Object.entries(RENAMED_TYPES)) {
      expect({ old, known: frdTypeIds.has(next) }).toEqual({ old, known: true })
    }
  })

  test('no old id is still in the catalogue', () => {
    // Renaming to an id that is itself still live would make the map a loop and
    // silently keep the old vocabulary alive.
    const live = Object.keys(RENAMED_TYPES).filter((old) =>
      WIDGET_TYPES.some((type) => type.id === old),
    )
    expect(live).toEqual([])
  })

  test('translating is idempotent', () => {
    // `boards.ts` applies this on every read; a map whose output is another
    // map's input would rename a board differently on the second load.
    for (const old of Object.keys(RENAMED_TYPES)) {
      expect(currentTypeId(currentTypeId(old))).toBe(currentTypeId(old))
    }
  })

  test('an id the map has never heard of passes through untouched', () => {
    expect(currentTypeId('line-chart')).toBe('line-chart')
    expect(currentTypeId('not-a-type')).toBe('not-a-type')
  })
})

describe('coverage against the FRD', () => {
  /*
   * There is no gap any more. This asserted the five names the merge plan
   * listed as absent, and those five are now in the catalogue — so the
   * assertion becomes the stronger one it was always a stand-in for: every
   * Type §4.2 names has an entry here.
   *
   * Names rather than a count, as before. A count passes while the contents
   * change, and would let a Type silently disappear as long as another
   * arrived.
   */
  test('every Visualization Type §4.2 names has a catalogue entry', () => {
    const moduleIds = new Set(WIDGET_TYPES.map((type) => type.id))
    const absent = visualizationTypes.map((type) => type.id).filter((id) => !moduleIds.has(id))

    expect(absent.sort()).toEqual([])
  })

  /*
   * An entry is not a renderer, and conflating the two is what made D6 wrong
   * for a day. `built.test.ts` holds each flag to a branch in the switch; this
   * holds the *set* of unbuilt types to the one standing decision behind it,
   * so building the last one is a deliberate edit here rather than a silent
   * pass.
   */
  test('the only Type without a renderer is the one with a dependency decision behind it', () => {
    const unbuilt = WIDGET_TYPES.filter((type) => !type.built).map((type) => type.id)
    expect(unbuilt).toEqual(['choropleth-map'])
  })
})
