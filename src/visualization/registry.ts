/**
 * The Visualization registry (B1) — the read surface over the classification
 * manifest, and the implementation of FR-VZ-05.
 *
 * Note what is NOT here: nothing binds a Dataset to a Visualization Type.
 * Per the invariant, "a Dataset is not bound to any Visualization Type. Any
 * Visualization Family whose Data Shape the Dataset satisfies may present it."
 * Eligibility is computed on demand, never stored.
 */

import type { Dataset } from '../domain/dataset'
import { satisfies } from './data-shape'
import type { Satisfaction, SatisfactionOptions } from './data-shape'
import { visualizationFamilies } from './families'
import type { VisualizationFamily } from './families'
import { typesInFamily } from './visualization-types'
import type { VisualizationType } from './visualization-types'

export interface FamilyEligibility {
  family: VisualizationFamily
  satisfaction: Satisfaction
  /** The Types this Family contributes, offered only when satisfied. */
  visualizationTypes: VisualizationType[]
}

export function listFamilies(): VisualizationFamily[] {
  return visualizationFamilies
}

/**
 * Evaluate every Family against a Dataset.
 *
 * Returns all thirteen regardless of outcome — the authoring surface needs the
 * failures too, so it can explain to an Author *why* a Visualization Type is
 * not on offer (UC-02). Use `offeredVisualizationTypes` for the FR-VZ-05
 * decision itself.
 */
export function evaluateFamilies(
  dataset: Dataset,
  options: SatisfactionOptions = {},
): FamilyEligibility[] {
  return visualizationFamilies.map((family) => ({
    family,
    satisfaction: satisfies(dataset, family.dataShape, options),
    visualizationTypes: typesInFamily(family.id),
  }))
}

/**
 * FR-VZ-05 — the Visualization Types that may be offered for this Dataset.
 *
 * `indeterminate` Families are excluded: the system cannot establish that the
 * Dataset satisfies the Data Shape, and FR-VZ-05 says to offer *only* those it
 * does satisfy. Offering on a maybe would break the requirement; the authoring
 * UI surfaces the indeterminacy separately so the gap is visible rather than
 * silently costing the Author a valid option.
 */
export function offeredVisualizationTypes(
  dataset: Dataset,
  options: SatisfactionOptions = {},
): VisualizationType[] {
  return evaluateFamilies(dataset, options)
    .filter((e) => e.satisfaction.status === 'satisfied')
    .flatMap((e) => e.visualizationTypes)
}

/** Whether a specific Visualization Type may present a Dataset. Guards binding. */
export function canPresent(
  dataset: Dataset,
  visualizationTypeId: string,
  options: SatisfactionOptions = {},
): boolean {
  return offeredVisualizationTypes(dataset, options).some((t) => t.id === visualizationTypeId)
}
