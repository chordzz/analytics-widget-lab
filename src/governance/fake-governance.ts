/**
 * Stand-in for backend overlap detection.
 *
 * The detection here is deliberately crude — token overlap on names, and an
 * identical-Measure check on content. Real detection is a backend concern and
 * will be better than this. What matters for the frontend is the *shape* of a
 * finding: which incumbent, on what grounds, and how confident — because that
 * is what an Administrator needs in order to rule, and it is what the review
 * surface is built against.
 */

import { catalogueFixtures } from '../catalogue/fixtures'
import { validatePublication } from '../domain/publication-contract'
import type { GovernancePort, OverlapFinding, PendingPublication } from './port'
import type { Dataset } from '../domain/dataset'

const STOP_WORDS = new Set(['the', 'a', 'of', 'and', 'by', 'per', 'total', 'count'])

const tokens = (value: string): string[] =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token))

function nameOverlap(candidate: Dataset, incumbent: Dataset): OverlapFinding | null {
  const a = new Set(tokens(candidate.name))
  const b = new Set(tokens(incumbent.name))
  const shared = [...a].filter((token) => b.has(token))
  if (shared.length === 0) return null

  const confidence = shared.length / Math.max(a.size, b.size)
  if (confidence < 0.5) return null

  return {
    kind: 'name',
    incumbentId: incumbent.id,
    incumbentName: incumbent.name,
    confidence,
    detail: `Both names centre on "${shared.join(' ')}". Two Datasets answering the same question under near-identical names is how a Catalogue ends up with several incompatible versions of one metric.`,
  }
}

function contentOverlap(candidate: Dataset, incumbent: Dataset): OverlapFinding | null {
  const measuresOf = (dataset: Dataset) =>
    new Set(dataset.fields.filter((f) => f.role === 'measure').map((f) => f.key))

  const a = measuresOf(candidate)
  const b = measuresOf(incumbent)
  if (a.size === 0 || b.size === 0) return null

  const shared = [...a].filter((key) => b.has(key))
  if (shared.length === 0) return null

  const confidence = shared.length / Math.max(a.size, b.size)
  return {
    kind: 'content',
    incumbentId: incumbent.id,
    incumbentName: incumbent.name,
    confidence,
    detail: `Both declare a Measure named ${shared.map((s) => `"${s}"`).join(', ')}. Identical Measure keys across Source Systems usually mean either one definition duplicated, or two different definitions wearing one name — and the second is worse.`,
  }
}

/** FR-GV-02 — what the backend would surface. */
export function detectOverlaps(candidate: Dataset, incumbents: Dataset[]): OverlapFinding[] {
  return incumbents
    .filter((incumbent) => incumbent.id !== candidate.id)
    .flatMap((incumbent) =>
      [nameOverlap(candidate, incumbent), contentOverlap(candidate, incumbent)].filter(
        (finding): finding is OverlapFinding => finding !== null,
      ),
    )
    .sort((a, b) => b.confidence - a.confidence)
}

export interface FakeGovernanceOptions {
  /** Submissions not yet in general use. */
  submissions?: { dataset: Dataset; submittedBy: string }[]
}

export class FakeGovernance implements GovernancePort {
  private readonly pending: PendingPublication[]
  private readonly listeners = new Set<() => void>()

  constructor(options: FakeGovernanceOptions = {}) {
    this.pending = (options.submissions ?? []).map(({ dataset, submittedBy }) => ({
      dataset,
      submittedBy,
      status: 'pending' as const,
      violations: validatePublication(dataset).violations,
      overlaps: detectOverlaps(dataset, catalogueFixtures),
    }))
  }

  async reviewCatalogue(): Promise<Dataset[]> {
    return catalogueFixtures
  }

  async pendingPublications(): Promise<PendingPublication[]> {
    return [...this.pending]
  }

  async resolve(
    datasetId: string,
    outcome: 'admitted' | 'rejected',
    note: string,
  ): Promise<void> {
    const entry = this.pending.find((p) => p.dataset.id === datasetId)
    if (!entry) throw new Error(`No pending publication '${datasetId}'.`)

    // FR-GV-04 — the publication contract is not an Administrator's to waive.
    // Overlap is a judgement call; a missing classification is not.
    if (outcome === 'admitted' && entry.violations.length > 0) {
      throw new Error(
        'This Dataset does not satisfy the publication contract and cannot enter general use until it does.',
      )
    }

    entry.status = outcome === 'admitted' ? 'in-general-use' : 'rejected'
    entry.resolution = { outcome, note }
    this.listeners.forEach((listener) => listener())
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }
}
