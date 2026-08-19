/**
 * Catalogue governance — the Analytics Administrator's boundary.
 *
 * The division of labour is set by the requirements: **detection is backend,
 * the frontend is the review and intervention surface**. Nothing here decides
 * whether two Datasets overlap; it presents findings and carries an
 * Administrator's judgement back.
 *
 * Why this exists at all: the second failure mode the capability was built to
 * remove is divergent definitions of the same metric — two teams each defining
 * "active users" and arriving at different numbers. A Catalogue that quietly
 * accumulates six overlapping definitions reproduces that failure *inside* the
 * conformed capability. Whether the guard is review, automated detection or
 * naming governance is a design decision; that some guard is required is not.
 */

import type { Dataset } from '../domain/dataset'
import type { PublicationViolation } from '../domain/publication-contract'

/**
 * Where a submitted Dataset sits relative to general use.
 *
 * FR-GV-03 hinges on `pending` existing as a real state: an overlap must be
 * surfaced *before* the Dataset enters general use, which is impossible if
 * publication is a single atomic step from submitted to consumable.
 */
export type PublicationStatus = 'pending' | 'in-general-use' | 'rejected'

export type OverlapKind = 'name' | 'content'

/** One reason the backend believes two Datasets may be the same thing. */
export interface OverlapFinding {
  kind: OverlapKind
  /** The already-published Dataset the candidate resembles. */
  incumbentId: string
  incumbentName: string
  /** 0–1. Advisory only; the Administrator decides, not the score. */
  confidence: number
  detail: string
}

export interface PendingPublication {
  dataset: Dataset
  submittedBy: string
  status: PublicationStatus
  /** FR-GV-04 — a Dataset failing the publication contract cannot become consumable. */
  violations: PublicationViolation[]
  /** FR-GV-02, FR-GV-03 — what the backend's detection turned up. */
  overlaps: OverlapFinding[]
  /** Recorded when an Administrator has ruled on it. */
  resolution?: { outcome: 'admitted' | 'rejected'; note: string }
}

export interface GovernancePort {
  /**
   * FR-GV-01 — the *complete* Catalogue, including each Dataset's owning Source
   * System, classification and Field descriptions.
   *
   * Deliberately not filtered by consume authorization, unlike
   * `CataloguePort.browse` (FR-DP-12). Reviewing a Dataset's description is not
   * consuming its data, and an Administrator who could only govern the subset
   * they personally may read could not govern the Catalogue at all. The
   * distinction holds because nothing on this port returns records.
   */
  reviewCatalogue(): Promise<Dataset[]>

  /** Submissions awaiting a ruling, newest first. */
  pendingPublications(): Promise<PendingPublication[]>

  /**
   * FR-GV-03 — an Administrator's ruling, taken before the Dataset enters
   * general use. `note` is required for both outcomes: an admitted duplicate is
   * a decision someone will later need explained.
   */
  resolve(datasetId: string, outcome: 'admitted' | 'rejected', note: string): Promise<void>
}
