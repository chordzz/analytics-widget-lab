/**
 * Data Shape and the satisfaction predicate.
 *
 * "Data Shape: the combination of Dimensions, Measures, and Time Dimension
 * that a Visualization Family requires in order to render meaningfully."
 *
 * This module is the keystone of FR-VZ-05 (P0/Stable): when a Dashboard Author
 * selects a Dataset, the system shall offer only those Visualization Types
 * whose Family Data Shape the selected Dataset satisfies.
 */

import type { Dataset } from '../domain/dataset'

/**
 * Records a Data Shape requirement that the published model cannot express.
 * See Finding 1 in Analytics_Frontend_Plan.md §9.
 */
export interface UndecidableClause {
  /** What the Family requires, and why the published model cannot answer it. */
  requirement: string
  /** The proposed descriptor that would make it decidable. */
  resolvedBy: string
}

export interface DataShapeClause {
  /** Stated so it can be shown to an Author as a reason. */
  describe: string
  /** Decides the clause using only the published model (FR-DP-03 — FR-DP-07). */
  test: (dataset: Dataset) => boolean
  /**
   * Present when `test` may return false for a Dataset that genuinely does
   * satisfy the requirement, because the published model cannot express it.
   */
  undecidable?: UndecidableClause
  /** Decides the clause when proposed Field semantics are permitted. */
  testWithSemantics?: (dataset: Dataset) => boolean
}

export interface DataShape {
  /** The shape as stated in §4.2, verbatim where practical. */
  summary: string
  clauses: DataShapeClause[]
}

/**
 * The outcome of evaluating a Dataset against a Data Shape.
 *
 * `indeterminate` is not a failure — it means the published model does not
 * carry enough information to decide, which is a gap in the publication
 * contract rather than a property of the Dataset.
 */
export type Satisfaction =
  | { status: 'satisfied' }
  | { status: 'unsatisfied'; unmet: string[] }
  | { status: 'indeterminate'; undecided: UndecidableClause[] }

export interface SatisfactionOptions {
  /**
   * Evaluate the FRD's model *without* Field semantics, as it stood before the
   * API could carry them.
   *
   * This was `useProposedSemantics`, default off, and the default was right
   * while the semantics were a proposal: consulting a descriptor the
   * publication model could not express would have papered over the gap
   * instead of showing it.
   *
   * The API published `semantic` and `record_volume` on 17–18 September. They
   * are declaration data now, and evaluating without them would ignore what a
   * publisher has actually said — the same mistake in the other direction, and
   * the one that keeps five Families unreachable no matter what anybody
   * declares.
   *
   * So the option is inverted rather than deleted. It has one honest remaining
   * caller: the contract document, which shows what the descriptors changed by
   * measuring both ways.
   */
  ignoreFieldSemantics?: boolean
}

/** FR-VZ-05 — can this Visualization Family present this Dataset? */
export function satisfies(
  dataset: Dataset,
  shape: DataShape,
  options: SatisfactionOptions = {},
): Satisfaction {
  const unmet: string[] = []
  const undecided: UndecidableClause[] = []

  for (const clause of shape.clauses) {
    const decide =
      !options.ignoreFieldSemantics && clause.testWithSemantics
        ? clause.testWithSemantics
        : clause.test

    if (decide(dataset)) continue

    /*
     * A clause that failed and is known to be inexpressible is not a definite
     * "no" — the model simply cannot tell. Keep the two apart.
     *
     * Which is now only true when semantics are being ignored. With them
     * consulted, a failing clause means the publisher declared no
     * `additive-total`, no `state`, no volume — a definite answer about this
     * declaration, not a limit of the model. Reporting "cannot be determined"
     * there would send an Author to ask us about a gap that is theirs to fill,
     * and it is the over-offering the backend corrected on their own side.
     */
    if (clause.undecidable && options.ignoreFieldSemantics) {
      undecided.push(clause.undecidable)
    } else {
      unmet.push(clause.describe)
    }
  }

  // A definite failure outranks an undecidable one: if the Dataset provably
  // lacks a required Measure, no amount of extra metadata rescues it.
  if (unmet.length > 0) return { status: 'unsatisfied', unmet }
  if (undecided.length > 0) return { status: 'indeterminate', undecided }
  return { status: 'satisfied' }
}
