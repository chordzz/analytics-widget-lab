/**
 * The module's fixtures, behind the real port contracts.
 *
 * Merge Plan Stage 5. `CataloguePort` and `DatasetRetrievalPort` are the
 * workbench's — imported, not re-declared, because a second definition of a
 * boundary is how the two tracks came apart in the first place. What is new is
 * an implementation of them over the module's own 13 datasets.
 *
 * The point of this stage is that **the module becomes asynchronous while there
 * is still no backend**. Every bug that comes with asynchrony — a widget that
 * renders before its rows arrive, a board that flashes empty on load, a race
 * between two retrievals for the same card — surfaces here, on our own schedule,
 * rather than on integration day.
 *
 * Two properties are worth stating because they are structural rather than
 * incidental:
 *
 *   - **The Catalogue cannot retrieve.** `CataloguePort` has no method that
 *     returns a record, so browsing cannot accidentally pull data (FR-DP-11).
 *     That is a property of the interface, not of this implementation.
 *   - **Four outcomes, not an array and an error field.** `[]` cannot mean
 *     empty, denied and withdrawn at once — Finding 7. The scenario switch below
 *     exists so every one of them is reachable in the running application rather
 *     than argued about in a document.
 */

import { executeQuery } from '../../retrieval/aggregate'
import { summarize, type CataloguePort, type DatasetSummary } from '../../catalogue/port'
import type {
  DatasetRetrievalPort,
  RetrievalOutcome,
  ViewerIdentity,
} from '../../retrieval/port'
import type { Dataset } from '../../domain/dataset'
import type { DatasetQuery } from '../../domain/query'
import { datasets, datasetById, rowsFor } from './datasets'

/**
 * What the fake should do for a given Dataset.
 *
 * Kept identical to the workbench's `RetrievalScenario` so the two fakes can be
 * driven by one control when the surfaces merge.
 */
export type Scenario = 'normal' | 'empty' | 'denied' | 'withdrawn' | 'failed'

export const SCENARIOS: Scenario[] = ['normal', 'empty', 'denied', 'withdrawn', 'failed']

export interface FixtureOptions {
  /** Scenario per Dataset id. Anything unlisted behaves normally. */
  scenarios?: Record<string, Scenario>
  /**
   * Simulated latency, in milliseconds.
   *
   * Zero by default and non-zero in the running app. A fake that resolves
   * instantly hides exactly the bugs this stage exists to find: nothing ever
   * renders in its loading state, so nothing is ever designed for it.
   */
  latencyMs?: number
}

const wait = (ms: number) =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()

export class FixtureCatalogue implements CataloguePort {
  private readonly options: FixtureOptions

  constructor(options: FixtureOptions = {}) {
    this.options = options
  }

  private withdrawn(id: string): boolean {
    return this.options.scenarios?.[id] === 'withdrawn'
  }

  async browse(_viewer: ViewerIdentity): Promise<DatasetSummary[]> {
    await wait(this.options.latencyMs ?? 0)
    // A withdrawn Dataset is gone from the Catalogue, not listed as broken.
    // A Widget already bound to it is what has to explain itself — see the
    // `withdrawn` render state — but nobody should be able to bind a new one.
    return datasets.filter((dataset) => !this.withdrawn(dataset.id)).map(summarize)
  }

  async describe(datasetId: string, _viewer: ViewerIdentity): Promise<Dataset | null> {
    await wait(this.options.latencyMs ?? 0)
    if (this.withdrawn(datasetId)) return null
    return datasetById(datasetId) ?? null
  }
}

export class FixtureRetrieval implements DatasetRetrievalPort {
  private readonly options: FixtureOptions

  constructor(options: FixtureOptions = {}) {
    this.options = options
  }

  async retrieve(
    datasetId: string,
    query: DatasetQuery,
    _viewer: ViewerIdentity,
  ): Promise<RetrievalOutcome> {
    await wait(this.options.latencyMs ?? 0)

    const scenario = this.options.scenarios?.[datasetId] ?? 'normal'

    switch (scenario) {
      case 'denied':
        return { kind: 'denied' }
      case 'withdrawn':
        return { kind: 'withdrawn' }
      case 'empty':
        return { kind: 'empty' }
      case 'failed':
        // A failure is a rejected promise, not an outcome — it is the absence
        // of an answer rather than one of the answers.
        throw new Error(`The source system did not answer for '${datasetId}'.`)
      case 'normal':
        break
    }

    const dataset = datasetById(datasetId)
    // A Dataset that is not in the Catalogue at all reads as withdrawn rather
    // than as a failure: from a Viewer's side those are the same situation, and
    // "broken" is the more alarming of the two readings.
    if (!dataset) return { kind: 'withdrawn' }

    const rows = executeQuery(rowsFor(datasetId), query)
    return rows.length === 0
      ? { kind: 'empty' }
      : { kind: 'rows', rows, totalCount: rowsFor(datasetId).length }
  }

  async listFilterValues(
    datasetId: string,
    field: string,
    _viewer: ViewerIdentity,
  ): Promise<(string | number)[]> {
    await wait(this.options.latencyMs ?? 0)

    const seen = new Set<string | number>()
    for (const row of rowsFor(datasetId)) {
      const value = row[field]
      if (value !== null && value !== undefined) seen.add(value)
    }

    return Array.from(seen).sort((a, b) =>
      typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)),
    )
  }
}

/**
 * The Viewer the module runs as until there is a session to ask.
 *
 * D8 ends here in shape but not in substance: every port call now carries an
 * identity, so the parameter exists and is threaded through, but the fixtures
 * authorize everyone. Swapping in a real `AuthorizationPort` is then a change to
 * the adapters rather than to every call site.
 */
export const LOCAL_VIEWER: ViewerIdentity = {
  id: 'local',
  displayName: 'You',
  organizationalScopeIds: [],
}
