/**
 * Mapping slots — the parts of a visualization an Author fills with Fields.
 *
 * The Data Shape predicate answers whether a Family *can* present a Dataset.
 * It does not say which Field goes where, and for anything with more than one
 * Field it matters: a Trend needs to know which Field is the time axis.
 *
 * Declared per Family rather than per Visualization Type, for the same reason
 * the Data Shape is: line, area, spline and step all take a time axis and one
 * or more Measures. Kept as data so a new Family needs no new code (FR-VZ-03).
 *
 * A slot's `min` is the binding requirement; it is deliberately consistent with
 * the Family's Data Shape clauses, which is asserted in the tests rather than
 * left to inspection.
 */

import type { FieldRole } from '../domain/dataset'

/** Corresponds one-to-one with the keys of `FieldMapping`. */
export type MappingSlotId = 'timeDimension' | 'dimensions' | 'measures' | 'columns'

export interface MappingSlot {
  id: MappingSlotId
  label: string
  /** Which Field roles may fill this slot. */
  accepts: FieldRole[]
  min: number
  /** Undefined means unbounded. */
  max?: number
  hint?: string
}

const DIMENSION_ROLES: FieldRole[] = ['dimension', 'time-dimension']
const ALL_ROLES: FieldRole[] = ['dimension', 'time-dimension', 'measure']

const timeAxis = (min: number): MappingSlot => ({
  id: 'timeDimension',
  label: 'Time axis',
  accepts: ['time-dimension'],
  min,
  max: 1,
  hint: min === 0 ? 'Optional — adds trend and period comparison.' : undefined,
})

const category = (min: number, max?: number): MappingSlot => ({
  id: 'dimensions',
  label: max === 1 ? 'Category' : 'Categories',
  accepts: DIMENSION_ROLES,
  min,
  max,
})

const measures = (min: number, max?: number): MappingSlot => ({
  id: 'measures',
  label: max === 1 ? 'Measure' : 'Measures',
  accepts: ['measure'],
  min,
  max,
})

const columns: MappingSlot = {
  id: 'columns',
  label: 'Columns',
  accepts: ALL_ROLES,
  min: 1,
  hint: 'Shown in the order chosen.',
}

export const mappingSlotsByFamily: Record<string, MappingSlot[]> = {
  tabular: [columns],
  trend: [timeAxis(1), measures(1)],
  'categorical-comparison': [category(1, 1), measures(1)],
  composition: [category(1, 1), measures(1, 1)],
  distribution: [measures(1, 1)],
  correlation: [measures(2)],
  'ranking-and-flow': [category(1, 1), measures(1, 1)],
  geospatial: [category(1, 1), measures(1, 1)],
  radial: [measures(1)],
  'single-value': [measures(1, 1), timeAxis(0)],
  'temporal-pattern': [timeAxis(1), measures(1, 1)],
  // Chronological lists events rather than aggregating them, so it takes
  // columns like Tabular, plus the Time Dimension it is ordered by.
  chronological: [timeAxis(1), columns],
  /*
   * Two routes, as §4.2 describes and Finding 1 names: a threshold on a Measure,
   * or a Dimension whose values *are* states ("healthy", "degraded").
   *
   * This modelled only the first, which made every state-Dimension Status
   * Widget fail the refinement check in `refinement.test.ts` — the module builds
   * both routes and the Family table admitted one. So the Dimension is required
   * and the Measure optional: a state Dimension alone is a valid Status Widget,
   * a Measure alone needs a threshold to compare against, and `MappingSlotId`
   * has nowhere to put a threshold (D1 again).
   */
  status: [category(1, 1), measures(0, 1)],
}

export function slotsForFamily(familyId: string): MappingSlot[] {
  return mappingSlotsByFamily[familyId] ?? []
}
