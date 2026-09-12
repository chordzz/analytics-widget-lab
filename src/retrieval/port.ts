/**
 * The retrieval boundary.
 *
 * The shape of `RetrievalOutcome` is the contract documented in
 * docs/PUBLICATION_CONTRACT.md § Retrieval response contract, and it exists in
 * this form for one reason: the Viewer must be able to tell four situations
 * apart, and the frontend cannot infer them from an empty row set.
 *
 *   rows      — data came back
 *   empty     — authorized, but the Dataset has nothing to say (FR-VZ-10)
 *   denied    — not authorized for this Dataset (FR-DA-10, FR-DA-11)
 *   withdrawn — the Dataset is gone (FR-DP-13, FR-DP-14)
 *
 * Collapsing `denied` into `empty` teaches Viewers the figure is zero.
 * Collapsing it into a thrown error teaches them the system is broken. Both are
 * worse than saying access was denied, so neither is representable here.
 *
 * A genuine failure is a rejected promise, not an outcome — it is the absence
 * of an answer rather than one of the answers.
 */

import type { DatasetQuery, DatasetRow } from '../domain/query'

export interface ViewerIdentity {
  id: string
  displayName: string
  /**
   * Organizational scopes this identity belongs to, as maintained by the IAM
   * context. Analytics conforms to IAM's model and does not interpret it —
   * it asks, and honours the answer. Single-level only (§10).
   */
  organizationalScopeIds?: string[]
}

/**
 * A publisher saying this answer is not the whole answer.
 *
 * Not a seventh outcome. It rides on the two that carry data because it is a
 * qualifier on an answer, not an answer of its own — the retrieval succeeded and
 * the Viewer is authorized; there is simply less here than they asked for.
 *
 * The integration guide requires Source Systems to set `meta.partial` when
 * retention cut a range short or a shard was unavailable, and is blunt about the
 * alternative: *"a chart missing half its data and not saying so is the worst
 * outcome available."* Carrying it this far and stopping would reproduce exactly
 * that, since an unread marker and an absent one are the same picture.
 */
export interface PartialResult {
  /** The publisher's words, when they gave any. */
  reason: string | null
}

export type RetrievalOutcome =
  | { kind: 'rows'; rows: DatasetRow[]; totalCount: number; partial?: PartialResult }
  /**
   * Empty can be partial too, and that pairing is the sharpest case: the source
   * served none of what was asked for. Drawn as a plain empty state it reads as
   * "there is nothing here", which is a claim about the data rather than about
   * the request.
   */
  | { kind: 'empty'; partial?: PartialResult }
  | { kind: 'denied' }
  | { kind: 'withdrawn' }

export interface DatasetRetrievalPort {
  /**
   * FR-DP-09 — must not change the state of the owning Source System.
   * FR-DP-10 — identical queries must give identical results.
   * FR-DA-09 — authorization is resolved here, per Dataset, per call.
   */
  retrieve(
    datasetId: string,
    query: DatasetQuery,
    viewer: ViewerIdentity,
  ): Promise<RetrievalOutcome>

  /**
   * The values a Viewer may choose from for an exposed filter (FR-VZ-06).
   *
   * Not derived from any requirement — the FRD says an Author configures which
   * filters are exposed, but never says how a Viewer discovers the permitted
   * values. A filter control cannot be populated without this, and the values
   * must be scoped to the Viewer's authorization or the control itself leaks
   * data the Viewer cannot otherwise obtain (FR-DA-12). Recorded as Finding 8.
   */
  listFilterValues(
    datasetId: string,
    field: string,
    viewer: ViewerIdentity,
  ): Promise<(string | number)[]>
}
