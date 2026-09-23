/**
 * The Catalogue over `/v1/datasets`.
 *
 * Authorization is not delegated to an `AuthorizationPort` here, and that is
 * the point rather than an omission. The API resolves the viewer from the
 * bearer token and returns only "Datasets the viewer may see" — FR-DP-12
 * enforced upstream, where it cannot be bypassed by a client that forgets to
 * ask. `viewer` stays in the signature because the port is shared with the
 * fixtures, which have no token and must decide it themselves.
 */

import { datasetFrom, isPublished, type ApiDataset } from './api-dataset'
import { summarize, type CataloguePort, type DatasetSummary, type TaxonomyEntry } from './port'
import { isApiError } from '../api/errors'
import type { ApiClient } from '../api/client'
import type { Dataset } from '../domain/dataset'

/** `PresentationOption`, as the API spells it. */
interface ApiTaxonomyEntry {
  family: string
  /**
   * `visualization_types` is what the API sends, and has always sent. The
   * published schema called it `types` until 18 September, and we followed the
   * schema — so this adapter has been reading a property that was never on the
   * wire and returning an empty list for every Family since BE-5 was adopted.
   *
   * Both are read. Not because the name is still in doubt — the backend has
   * confirmed which it is and added a test marshalling the real structs — but
   * because `taxonomy-drift.ts` reads both and quietly kept working through the
   * whole episode, and this one, reading a single spelling, did not. Two
   * adapters on one endpoint disagreeing about its shape is how the failure
   * lasted; agreeing about it is the cheap half of the fix.
   */
  visualization_types?: string[]
  types?: string[]
  requirement?: string
  single_value?: boolean
}

/** The Types in one taxonomy entry, under either spelling. */
const typesOf = (entry: ApiTaxonomyEntry): string[] => {
  if (Array.isArray(entry.visualization_types)) return entry.visualization_types
  if (Array.isArray(entry.types)) return entry.types
  return []
}

export function httpCatalogue(api: ApiClient): CataloguePort {
  return {
    async browse(): Promise<DatasetSummary[]> {
      const body = await api.request<{ datasets?: ApiDataset[] } | ApiDataset[]>('/v1/datasets')
      return listOf(body).filter(isPublished).map(datasetFrom).map(summarize)
    },

    /**
     * `GET /v1/visualizations` — BE-5, adopted.
     *
     * The authority for what `visualization_type` may be, so nothing here keeps
     * a copy. A local list is exactly how the two taxonomies drifted apart:
     * ours said `line-chart` where theirs said `line`, sixteen ids diverged,
     * and nothing noticed until a save was refused.
     *
     * An empty answer is not "no types exist" — it is the endpoint declining,
     * and `acceptedByApi` falls back rather than locking every widget in the
     * product. `403` is the likely one: it needs `dataset.read`, which a viewer
     * who can compose might still lack.
     */
    async visualizations(): Promise<TaxonomyEntry[]> {
      try {
        const body = await api.request<ApiTaxonomyEntry[]>('/v1/visualizations')
        return (Array.isArray(body) ? body : []).map((entry) => ({
          family: entry.family,
          types: typesOf(entry),
          ...(entry.requirement === undefined ? {} : { requirement: entry.requirement }),
          ...(entry.single_value === undefined ? {} : { singleValue: entry.single_value }),
        }))
      } catch {
        return []
      }
    },

    async describe(datasetId: string): Promise<Dataset | null> {
      try {
        const body = await api.request<ApiDataset>(`/v1/datasets/${encodeURIComponent(datasetId)}`)
        if (!body || !isPublished(body)) return null
        return datasetFrom(body)
      } catch (error) {
        /*
         * The port's contract: absent and forbidden are deliberately
         * indistinguishable, so the Catalogue cannot be used to probe for
         * Datasets a viewer cannot see. The API takes the same position —
         * its 404 covers "does not exist, is deleted, or the viewer may not see
         * it" — so this is agreement, not a translation.
         *
         * Everything else still throws. A 503 is not "no such Dataset".
         */
        if (isApiError(error) && (error.kind === 'not-found' || error.kind === 'denied')) {
          return null
        }
        throw error
      }
    },
  }
}

/**
 * A list endpoint may answer with a bare array or with a named collection, and
 * the spec's `data` is untyped. Both are accepted; anything else is empty
 * rather than a crash, because an unreadable Catalogue should show nothing to
 * build from rather than take the screen down.
 */
function listOf(body: { datasets?: ApiDataset[] } | ApiDataset[] | undefined): ApiDataset[] {
  if (Array.isArray(body)) return body
  if (body && Array.isArray(body.datasets)) return body.datasets
  return []
}
