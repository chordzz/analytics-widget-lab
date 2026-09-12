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
import { summarize, type CataloguePort, type DatasetSummary } from './port'
import { isApiError } from '../api/errors'
import type { ApiClient } from '../api/client'
import type { Dataset } from '../domain/dataset'

export function httpCatalogue(api: ApiClient): CataloguePort {
  return {
    async browse(): Promise<DatasetSummary[]> {
      const body = await api.request<{ datasets?: ApiDataset[] } | ApiDataset[]>('/v1/datasets')
      return listOf(body).filter(isPublished).map(datasetFrom).map(summarize)
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
