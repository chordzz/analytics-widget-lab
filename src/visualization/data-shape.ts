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
   * Permit proposed Field semantics to decide otherwise-undecidable clauses.
   * Off by default so the FRD's model as written is what gets evaluated.
   */
  useProposedSemantics?: boolean
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
      options.useProposedSemantics && clause.testWithSemantics
        ? clause.testWithSemantics
        : clause.test

    if (decide(dataset)) continue

    // A clause that failed and is known to be inexpressible is not a definite
    // "no" — the model simply cannot tell. Keep the two apart.
    if (clause.undecidable && !options.useProposedSemantics) {
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
