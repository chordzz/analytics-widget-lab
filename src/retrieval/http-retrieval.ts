/**
 * Retrieval over `GET /v1/datasets/{id}/query`.
 *
 * **What the wire can carry, and what it cannot.** The endpoint accepts the
 * Dataset's published Filter Parameters and nothing else — no `dimensions`, no
 * `measures`, no `sort`, no `limit` (D22). Analytics stores nothing and
 * computes nothing; it forwards and relays the answer byte for byte.
 *
 * So the query is split. Filters and the time range go upstream, where they
 * narrow the data before it crosses the network. What has nowhere to go is
 * finished here, over the rows that came back.
 *
 * That second half is not a workaround, it is the answer our own widget data
 * contract already gives publishers: *"Either the endpoint returns a stable
 * order and says so, or it does not and we sort in the browser."* Against a
 * Dataset already stored at the grain a chart draws — which is what the
 * contract asks for — the local pass is a no-op. Against a raw one it is the
 * difference between a correct chart and a scrambled one.
 *
 * **What it refuses to do quietly.** A 401 is not a Widget state and does not
 * become one; it rises past this layer as a session ending. A relayed body
 * whose rows are not where either documented reading puts them raises rather
 * than returning zero rows, because "no data" is a claim about the world.
 */

import { executeQuery } from './aggregate'
import { readRelayedBody, RelayShapeError, type RelayShape } from './relayed-body'
import { isApiError } from '../api/errors'
import type { ApiClient } from '../api/client'
import type { DatasetQuery } from '../domain/query'
import type { DatasetRetrievalPort, RetrievalOutcome } from './port'

export interface HttpRetrievalOptions {
  /**
   * Called once per response with what the relay actually looked like.
   *
   * The nesting question is open, and this is how it gets answered from a real
   * trace rather than by re-reading the spec. It also carries `partial`, which
   * is the one thing here that would otherwise fail silently — see D27.
   */
  onRelay?: (report: { datasetId: string; shape: RelayShape; partial: boolean; reason: string | null }) => void
}

export function httpRetrieval(api: ApiClient, { onRelay }: HttpRetrievalOptions = {}): DatasetRetrievalPort {
  return {
    async retrieve(datasetId, query): Promise<RetrievalOutcome> {
      let envelope
      try {
        envelope = await api.requestEnvelope(`/v1/datasets/${encodeURIComponent(datasetId)}/query`, {
          query: upstreamParameters(query),
        })
      } catch (error) {
        if (isApiError(error)) {
          // The two per-Widget outcomes. Everything else — including a session
          // ending — keeps rising.
          if (error.kind === 'denied') return { kind: 'denied' }
          if (error.kind === 'withdrawn') return { kind: 'withdrawn' }
        }
        throw error
      }

      const relayed = readRelayedBody(envelope)
      onRelay?.({
        datasetId,
        shape: relayed.shape,
        partial: relayed.partial,
        reason: relayed.partialReason,
      })

      if (relayed.rows.length === 0) return { kind: 'empty' }

      // Filters are re-applied deliberately. Upstream has already narrowed by
      // the parameters it publishes; re-applying is idempotent and covers the
      // ones it does not.
      const rows = executeQuery(relayed.rows, query)
      return rows.length === 0 ? { kind: 'empty' } : { kind: 'rows', rows, totalCount: rows.length }
    },

    async listFilterValues(datasetId, field): Promise<(string | number)[]> {
      /*
       * Finding 8, still open: the API publishes no endpoint for the values a
       * Viewer may choose from, and `allowed_values` on a Filter Parameter is
       * the closest thing — it belongs to the Dataset declaration, not here.
       *
       * Deriving them from a retrieval is the obvious shortcut and the wrong
       * one: the control would then offer whatever the current query returned,
       * which changes as other filters change. Better to offer nothing than to
       * offer a list that is quietly wrong.
       */
      void datasetId
      void field
      return []
    },
  }
}

/**
 * The query, reduced to what the endpoint accepts.
 *
 * Undeclared parameters are refused upstream before the request leaves, so
 * anything sent here that the Dataset did not publish fails the whole query
 * with a 400 rather than being ignored — which is the right way round, and why
 * nothing is invented.
 */
export function upstreamParameters(query: DatasetQuery): Record<string, string | number> {
  const parameters: Record<string, string | number> = {}

  for (const [field, value] of Object.entries(query.filters ?? {})) {
    parameters[field] = value
  }

  /*
   * `from` and `to` are the names the API's own example uses, and they are the
   * only names available to guess with: Filter Parameter names are per-Dataset.
   * A Dataset that spells them differently rejects these with a 400 naming the
   * offending field — visible, and fixed by reading one real declaration.
   */
  if (query.timeRange?.from) parameters.from = query.timeRange.from
  if (query.timeRange?.to) parameters.to = query.timeRange.to

  return parameters
}

export { RelayShapeError }
