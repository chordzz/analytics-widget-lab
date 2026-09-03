/**
 * D3 — every Type's slots are a refinement of its Family's.
 *
 * Merge Plan §9, guard 2. The plan's own words: "Without it this entry is a
 * euphemism for 'two tables that disagree'."
 *
 * FR-VZ-03 declares mapping slots **per Family**, so a new Family needs no
 * application change. The module declares them **per Type**, because `funnel`
 * and `sankey` share a Family and are not the same mapping. D3 keeps both: the
 * Family table is the eligibility contract FR-VZ-05 evaluates, and the Type
 * table refines it for rendering.
 *
 * A refinement may narrow a Family slot or add an optional one. It may never
 * **widen a required** one — a Type demanding less than its Family would be
 * offered for a Dataset the Family cannot present, which is FR-VZ-05 broken
 * through the back door.
 */

import { describe, expect, test } from 'bun:test'
import { WIDGET_TYPES, widgetType } from '../widgets/catalog'
import { contributesTo, demandFor, satisfies, slotsFor } from './requirements'
import { slotsForFamily } from '../../visualization/mapping-slots'
import { datasets } from '../data/datasets'

const built = WIDGET_TYPES.filter((type) => type.built)

/**
 * Types that knowingly do not refine their Family, with the reason — D18.
 *
 * Declared here rather than skipped, and asserted to be exactly this list, so
 * adding a second one is a decision someone makes in review with the divergence
 * register in view. An exception table nobody checks the size of is a way to
 * turn a failing guard off one entry at a time.
 */
const DECLARED_EXCEPTIONS: Record<string, string> = {
  /*
   * D18 / Finding 16. The FRD classifies "Gantt / timeline chart" under Temporal
   * Pattern, whose Data Shape requires a Time Dimension. A Gantt's axis is not a
   * period, it is an *interval*: a bar begins at a start and ends at an end, and
   * the common encoding — the one `project-timeline` uses — is two numeric
   * offsets. There is no Time Dimension anywhere in it.
   *
   * Left as a divergence rather than "fixed" either way, because both fixes are
   * worse than the gap. Narrowing the axis to a Time Dimension makes the type
   * satisfy nothing. Re-storing start and end as dates would satisfy the letter
   * of the Family and is the FRD's classification to change, not ours.
   */
  'timeline-chart':
    'A Gantt spans an interval, not a period — Temporal Pattern requires a Time Dimension and a start/end pair is not one.',
}

describe('every built Type refines its Family', () => {
  test.each(built.map((type) => [type.id, type.family] as const))(
    '%s (%s) demands at least what its Family requires',
    (typeId, familyId) => {
      if (DECLARED_EXCEPTIONS[typeId]) return

      for (const slot of slotsForFamily(familyId)) {
        if (slot.min === 0) continue // optional — a Type may drop it

        expect(demandFor(typeId, slot)).toBeGreaterThanOrEqual(slot.min)
      }
    },
  )

  test('a Family with no slot table is a gap, not a pass', () => {
    // If `slotsForFamily` returned `[]` for everything the loop above would be
    // vacuous and every Type would "refine" its Family. This is the assertion
    // that keeps the suite honest.
    const covered = new Set(built.map((type) => type.family))
    for (const familyId of covered) {
      expect(slotsForFamily(familyId).length).toBeGreaterThan(0)
    }
  })

  test('at least one Family actually requires something', () => {
    const anyRequired = [...new Set(built.map((type) => type.family))].some((familyId) =>
      slotsForFamily(familyId).some((slot) => slot.min > 0),
    )
    expect(anyRequired).toBe(true)
  })
})

describe('refinement is what is being checked, not overlap', () => {
  test('narrowing contributes', () => {
    // A Family slot taking any Field is satisfied by a Type slot taking a
    // Dimension — that is the second layer doing its job.
    expect(contributesTo({ accepts: ['dimension'] }, { accepts: ['dimension', 'measure'] })).toBe(
      true,
    )
  })

  test('widening does not', () => {
    /*
     * The case an id-based correspondence cannot see, and the reason this
     * compares accepted roles. A Family slot requiring a Time Dimension is not
     * satisfied by a Type slot that would also take a plain Dimension: an Author
     * fills it with one and the Family's requirement is silently gone.
     */
    expect(
      contributesTo({ accepts: ['dimension', 'time-dimension'] }, { accepts: ['time-dimension'] }),
    ).toBe(false)
  })

  test('an exact match contributes', () => {
    expect(contributesTo({ accepts: ['measure'] }, { accepts: ['measure'] })).toBe(true)
  })

  test('a disjoint slot does not', () => {
    expect(contributesTo({ accepts: ['measure'] }, { accepts: ['dimension'] })).toBe(false)
  })
})

describe('the refinement rule bites', () => {
  test('a Type demanding less than its Family is caught', () => {
    /*
     * The test for the test. Trend requires a time axis and a Measure; a Type
     * that dropped the Measure would still be offered for any Dataset with a
     * timestamp, and would then have nothing to plot.
     */
    const measures = slotsForFamily('trend').find((slot) => slot.id === 'measures')!

    expect(measures.min).toBeGreaterThan(0)
    expect(demandFor('line-chart', measures)).toBeGreaterThanOrEqual(measures.min)

    // A Type with no slots at all demands nothing, which is exactly what the
    // loop above would flag.
    expect(demandFor('no-such-type', measures)).toBe(0)
  })

  test('a narrower Type is allowed', () => {
    // Composition asks for one Measure; a donut takes exactly one. Narrowing is
    // the point of the second layer.
    const composition = slotsForFamily('composition').find((slot) => slot.id === 'measures')!
    expect(demandFor('donut-chart', composition)).toBeGreaterThanOrEqual(composition.min)
    expect(slotsFor('donut-chart').find((slot) => slot.id === 'value')?.max).toBe(1)
  })
})

describe('the two layers agree about eligibility', () => {
  test.each(built.map((type) => [type.id] as const))(
    '%s is only offered for Datasets its Family could present',
    (typeId) => {
      /*
       * The property the whole entry exists to protect, checked end to end
       * rather than through the tables: if the module offers a Type for a
       * Dataset, every *required* Family slot must be fillable from that
       * Dataset's Fields. Otherwise FR-VZ-05 has been circumvented by the
       * per-Type layer.
       */
      if (DECLARED_EXCEPTIONS[typeId]) return

      const family = widgetType(typeId)!.family
      const required = slotsForFamily(family).filter((slot) => slot.min > 0)

      for (const dataset of datasets.filter((candidate) => satisfies(typeId, candidate))) {
        for (const slot of required) {
          const available = dataset.fields.filter((field) => slot.accepts.includes(field.role))
          expect(available.length).toBeGreaterThanOrEqual(slot.min)
        }
      }
    },
  )
})

describe('the exception table stays small and deliberate', () => {
  test('exactly one Type is declared as not refining its Family', () => {
    // The guard on the guard. Turning this check off one entry at a time is the
    // easy way to make it meaningless, so the list is pinned.
    expect(Object.keys(DECLARED_EXCEPTIONS)).toEqual(['timeline-chart'])
  })

  test('every exception names a built Type and gives a reason', () => {
    for (const [typeId, reason] of Object.entries(DECLARED_EXCEPTIONS)) {
      expect(built.some((type) => type.id === typeId)).toBe(true)
      expect(reason.length).toBeGreaterThan(40)
    }
  })

  test('an exception is only granted where the check actually fails', () => {
    /*
     * Otherwise an entry could sit here forever after the underlying
     * disagreement was fixed, silently exempting a Type that no longer needs it.
     */
    for (const typeId of Object.keys(DECLARED_EXCEPTIONS)) {
      const familyId = widgetType(typeId)!.family
      const shortfall = slotsForFamily(familyId).some(
        (slot) => slot.min > 0 && demandFor(typeId, slot) < slot.min,
      )
      expect(shortfall).toBe(true)
    }
  })
})
