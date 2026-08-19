/**
 * In-memory retrieval over the fixture Catalogue.
 *
 * Beyond standing in for a real Source System, this fake can be told to return
 * each outcome on demand. That is not test scaffolding for its own sake: the
 * requirements insist four outcomes stay visually distinct, and the only way to
 * hold a team to that is to make every one of them reachable in the running
 * application rather than reasoned about in a document.
 */

import { catalogueFixtures } from '../catalogue/fixtures'
import { fixtureRows } from '../catalogue/fixture-rows'
import { executeQuery } from './aggregate'
import type { DatasetQuery } from '../domain/query'
import type { DatasetRetrievalPort, RetrievalOutcome, ViewerIdentity } from './port'
import type { AccessRecorderPort, AuthorizationPort } from '../access/port'

/** What the fake should do for a given Dataset. */
export type RetrievalScenario =
  | 'normal'
  | 'empty'
  | 'denied'
  | 'withdrawn'
  | 'failed'
  | 'loading'

export const RETRIEVAL_SCENARIOS: RetrievalScenario[] = [
  'normal',
  'empty',
  'denied',
  'withdrawn',
  'failed',
  'loading',
]

/** Long enough that the loading treatment can be inspected rather than glimpsed. */
const LOADING_SCENARIO_DELAY_MS = 600_000

export interface FakeRetrievalOptions {
  /** Scenario per Dataset id. Anything unlisted behaves normally. */
  scenarios?: Record<string, RetrievalScenario>
  /** Simulated latency for normal responses. */
  latencyMs?: number
  /**
   * Authorization is asked here as well as in the Catalogue, and that
   * duplication is deliberate: FR-DA-09 determines authorization per Widget at
   * retrieval time, and FR-DA-12 says a Viewer must not obtain through a Widget
   * what they could not obtain directly. A Catalogue-only check would leave a
   * Widget bound before a Viewer's access was revoked still serving data.
   */
  authorization?: AuthorizationPort

  /** FR-DA-14 — notified whenever personal data is actually served. */
  accessRecorder?: AccessRecorderPort
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export class FakeDatasetRetrieval implements DatasetRetrievalPort {
  private readonly options: FakeRetrievalOptions

  constructor(options: FakeRetrievalOptions = {}) {
    this.options = options
  }

  /** FR-DA-09 — resolved per Dataset, per call, by IAM rather than by us. */
  private async authorized(datasetId: string, viewer: ViewerIdentity): Promise<boolean> {
    if (!this.options.authorization) return true
    return this.options.authorization.mayConsumeDataset(datasetId, viewer)
  }

  /**
   * FR-DA-14 — recorded when personal data is actually served, not when it is
   * merely asked for. A denied or withdrawn Dataset exposes nothing, so there
   * is nothing to account for.
   */
  private async recordIfPersonal(datasetId: string, viewer: ViewerIdentity): Promise<void> {
    const recorder = this.options.accessRecorder
    if (!recorder) return

    const dataset = catalogueFixtures.find((d) => d.id === datasetId)
    if (!dataset?.exposesPersonalData) return

    await recorder.record({
      at: new Date().toISOString(),
      viewerId: viewer.id,
      viewerName: viewer.displayName,
      datasetId: dataset.id,
      datasetName: dataset.name,
    })
  }

  async retrieve(
    datasetId: string,
    query: DatasetQuery,
    viewer: ViewerIdentity,
  ): Promise<RetrievalOutcome> {
    if (!(await this.authorized(datasetId, viewer))) {
      await wait(this.options.latencyMs ?? 180)
      return { kind: 'denied' }
    }

    const scenario = this.options.scenarios?.[datasetId] ?? 'normal'

    if (scenario === 'loading') {
      await wait(LOADING_SCENARIO_DELAY_MS)
      return { kind: 'empty' }
    }

    await wait(this.options.latencyMs ?? 180)

    switch (scenario) {
      case 'denied':
        return { kind: 'denied' }
      case 'withdrawn':
        return { kind: 'withdrawn' }
      case 'empty':
        return { kind: 'empty' }
      case 'failed':
        throw new Error('The Source System did not respond.')
    }

    const dataset = catalogueFixtures.find((d) => d.id === datasetId)
    if (!dataset) throw new Error(`No Dataset '${datasetId}' in the Catalogue.`)

    const rows = executeQuery(fixtureRows[datasetId] ?? [], query)

    // FR-DA-14 — the Viewer has been served this Dataset, so if it carries
    // personal data the access is now accountable.
    await this.recordIfPersonal(datasetId, viewer)

    // An authorized retrieval that yields nothing is `empty`, never `rows: []`
    // — the distinction is the whole point of this contract.
    return rows.length === 0
      ? { kind: 'empty' }
      : { kind: 'rows', rows, totalCount: rows.length }
  }

  async listFilterValues(
    datasetId: string,
    field: string,
    viewer: ViewerIdentity,
  ): Promise<(string | number)[]> {
    if (!(await this.authorized(datasetId, viewer))) return []

    const scenario = this.options.scenarios?.[datasetId] ?? 'normal'
    // A denied or withdrawn Dataset must not populate a filter control either,
    // or the control leaks values from data the Viewer cannot see (FR-DA-12).
    if (scenario === 'denied' || scenario === 'withdrawn') return []

    const values = new Set<string | number>()
    for (const row of fixtureRows[datasetId] ?? []) {
      const value = row[field]
      if (value !== null && value !== undefined) values.add(value)
    }
    return Array.from(values).sort((a, b) =>
      typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)),
    )
  }
}
