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
import type { AccessRecorderPort, AuthorizationPort, OrgScopeRef } from '../../access/port'
import type { DashboardScope, ShareGrant } from '../../domain/dashboard'
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
  private readonly recorder?: AccessRecorderPort

  constructor(options: FixtureOptions = {}, recorder?: AccessRecorderPort) {
    this.options = options
    this.recorder = recorder
  }

  async retrieve(
    datasetId: string,
    query: DatasetQuery,
    viewer: ViewerIdentity,
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
    if (rows.length === 0) return { kind: 'empty' }

    /*
     * FR-DA-14 — recorded here, and only here.
     *
     * Three things about the placement are the requirement rather than
     * convenience:
     *
     *   - **At the boundary, not in a component.** This is the only place that
     *     knows a retrieval happened. A component would miss the ones it did not
     *     render and double-count the ones it re-rendered.
     *   - **Only when data was actually served.** A `denied` or `withdrawn`
     *     outcome means the Viewer saw nothing, and recording those would assert
     *     someone accessed personal data when they did not — which is worse than
     *     no record, because it is a false one.
     *   - **Only for Datasets that say they carry personal data.** Logging every
     *     retrieval would bury the entries that matter under the ones that do
     *     not, and FR-DA-14 asks for the former.
     */
    if (dataset.exposesPersonalData && this.recorder) {
      void this.recorder.record({
        at: new Date().toISOString(),
        viewerId: viewer.id,
        viewerName: viewer.displayName,
        datasetId: dataset.id,
        datasetName: dataset.name,
      })
    }

    return { kind: 'rows', rows, totalCount: rowsFor(datasetId).length }
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
  organizationalScopeIds: ['operations'],
}

/**
 * Other people, so sharing is reachable.
 *
 * Not decoration. A directory containing only the Viewer makes the Share Grant
 * control impossible to reach in the running module — there is nobody to grant
 * to — and a surface nobody can open is a surface nobody designs or notices is
 * broken. Same reasoning as the retrieval scenarios: every state the
 * requirements insist on has to be producible by using the app.
 *
 * They resolve through `resolveRecipient` like any other identity, so FR-DA-08
 * (a Grant naming someone outside the Scope has no effect) is demonstrable
 * rather than argued: Priya is outside `operations`.
 */
export const DEMO_DIRECTORY: ViewerIdentity[] = [
  LOCAL_VIEWER,
  { id: 'ada', displayName: 'Ada Lovelace', organizationalScopeIds: ['operations'] },
  { id: 'grace', displayName: 'Grace Hopper', organizationalScopeIds: ['operations'] },
  { id: 'priya', displayName: 'Priya Raman', organizationalScopeIds: ['finance'] },
]

/**
 * Authorization, for a module running as one local identity.
 *
 * Honest rather than permissive: the *shape* is real — every question is asked
 * of this port and answered per call — and the answers reflect a single-viewer
 * world. When a host supplies a real `AuthorizationPort`, the Scope and Grant
 * behaviour that already works here starts meaning something without a single
 * call site changing.
 *
 * `mayConsumeDataset` returns true for everything, and that is the one to look
 * at first when wiring a backend: FR-DA-09 and FR-DP-12 both go through it.
 */
export class LocalAuthorization implements AuthorizationPort {
  private readonly people: ViewerIdentity[]
  private readonly groups: OrgScopeRef[]

  constructor(
    people: ViewerIdentity[] = DEMO_DIRECTORY,
    groups: OrgScopeRef[] = [
      { scopeId: 'operations', label: 'Operations' },
      { scopeId: 'finance', label: 'Finance' },
    ],
  ) {
    this.people = people
    this.groups = groups
  }

  async mayConsumeDataset(_datasetId: string, _viewer: ViewerIdentity): Promise<boolean> {
    return true
  }

  async satisfiesScope(scope: DashboardScope, viewer: ViewerIdentity): Promise<boolean> {
    switch (scope.kind) {
      case 'organization-wide':
        return true
      case 'organizational-scope':
        return (viewer.organizationalScopeIds ?? []).includes(scope.scopeId)
      case 'personal':
        /*
         * Personal is the Author's alone, and `canViewDashboard` returns true for
         * the Author before it reaches here. So this is only ever asked about
         * somebody else, and the answer is no.
         */
        return false
    }
  }

  async resolveRecipient(grant: ShareGrant): Promise<ViewerIdentity[]> {
    // An unresolvable recipient returns empty rather than throwing: FR-DA-08
    // needs the Author told that a Grant has no effect, which is a fact about
    // the Grant and not a failure of the system.
    if (grant.recipientKind === 'group') {
      return this.people.filter((identity) =>
        (identity.organizationalScopeIds ?? []).includes(grant.recipientId),
      )
    }

    const found = this.people.find((identity) => identity.id === grant.recipientId)
    return found ? [found] : []
  }

  async mayAdministerCatalogue(_viewer: ViewerIdentity): Promise<boolean> {
    // Finding 12 — the Analytics Administrator user class does not exist in IAM,
    // so nothing can truthfully answer yes yet.
    return false
  }

  async directory(): Promise<{ individuals: ViewerIdentity[]; groups: OrgScopeRef[] }> {
    // What the sharing UI offers. Everyone but the Author themselves — granting
    // yourself access to your own board is a control that can only be a no-op.
    return { individuals: this.people, groups: this.groups }
  }
}
