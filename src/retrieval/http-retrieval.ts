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

      /*
       * The marker travels with the answer rather than only to the log. An
       * unread `meta.partial` and an absent one draw the same chart, which is
       * the outcome the integration guide calls the worst available.
       */
      const partial = relayed.partial ? { reason: relayed.partialReason } : undefined

      if (relayed.rows.length === 0) return { kind: 'empty', partial }

      // Filters are re-applied deliberately. Upstream has already narrowed by
      // the parameters it publishes; re-applying is idempotent and covers the
      // ones it does not.
      const rows = executeQuery(relayed.rows, query)
      return rows.length === 0
        ? { kind: 'empty', partial }
        : { kind: 'rows', rows, totalCount: rows.length, partial }
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
  /*
   * Only `parameters`, and only what was resolved against the declaration.
   *
   * `filters` is deliberately not sent. It is keyed by Field key — a column and
   * the value it must equal — and the endpoint accepts parameter names, which
   * are a different list. Sending one that happens to match by coincidence
   * would work; sending one that does not fails the *whole* query, because an
   * undeclared parameter is refused before the request leaves.
   *
   * `timeRange` is not sent either, and that is the fix rather than an
   * omission. It used to be written out as `from` and `to` on the guess that
   * every Dataset spells a date range that way — a convention the API's own
   * example happens to use and nothing promises. `queryFor` now resolves it
   * against the Dataset's declared parameters, where the names are known, and
   * what survives arrives here already named correctly.
   */
  return { ...query.parameters }
}

export { RelayShapeError }
