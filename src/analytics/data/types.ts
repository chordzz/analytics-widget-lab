/**
 * The module's view of the publication model.
 *
 * This file used to *define* a Dataset — a lighter one, with `kind` where the
 * FRD says `role` and nothing at all about who published it or who may see it.
 * That was the right call while the module was a parallel track whose job was
 * designing widgets. It is the wrong call now: two definitions of Dataset is how
 * the two tracks came apart, and the FRD's is the one that traces to a
 * requirement.
 *
 * So the model comes from `domain/dataset.ts` and this file is what the module
 * needs on top of it:
 *
 *   - `Row`, because a widget draws rows and the model deliberately does not
 *     carry any. Metadata and records are answered by different ports.
 *   - Role helpers, so a caller says `measures(dataset)` rather than filtering
 *     on a discriminant every time.
 *
 * Merge Plan Stage 2. The extensions the module needed — `format`, the
 * geographic semantics, `suits` — went *into* the model as numbered divergences
 * rather than staying here as a second opinion about what a Field is.
 */

import type { DatasetRow } from '../../domain/query'
import type { Dataset, Field, FieldRole } from '../../domain/dataset'

export type {
  Aggregation,
  DataClassification,
  Dataset,
  Dimension,
  Field,
  FieldRole,
  FieldSemantic,
  Measure,
  TimeDimension,
  ValueFormat,
} from '../../domain/dataset'

export { isCoordinate, isGeographic } from '../../domain/dataset'

/**
 * One record.
 *
 * The same type the retrieval port returns, aliased rather than redeclared —
 * the primitives take rows from wherever the host got them, and a second
 * definition would let the two drift into disagreeing about whether a cell may
 * be null.
 */
export type Row = DatasetRow

export const fieldsOfRole = (dataset: Dataset, role: FieldRole): Field[] =>
  dataset.fields.filter((field) => field.role === role)

export const measures = (dataset: Dataset) => fieldsOfRole(dataset, 'measure')
export const dimensions = (dataset: Dataset) => fieldsOfRole(dataset, 'dimension')
export const timeFields = (dataset: Dataset) => fieldsOfRole(dataset, 'time-dimension')

/**
 * Dimensions, including Time Dimensions.
 *
 * Per the FRD's Definitions table a Time Dimension *is* a Dimension, so it
 * counts wherever a Dimension is required. Slots that need a non-temporal one
 * say so explicitly.
 */
export const allDimensions = (dataset: Dataset): Field[] =>
  dataset.fields.filter((field) => field.role !== 'measure')

export const fieldOf = (dataset: Dataset, key: string): Field | undefined =>
  dataset.fields.find((field) => field.key === key)
