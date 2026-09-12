/**
 * Finding the rows in a relayed response — and saying which shape arrived.
 *
 * The API's own documentation of `GET /v1/datasets/{id}/query` reads two ways,
 * three lines apart. Its 200 is described as *"The Source System's envelope,
 * relayed verbatim"*, while the schema composes Analytics's `Envelope` with
 * `data` = *"The upstream response body, unmodified"*. Since the integration
 * guide §4.3 requires the Source System to return an envelope too, those
 * readings differ by a level of nesting:
 *
 *   flat:   { status, message, data: [rows], meta }         ← rows at .data
 *   nested: { status, message, data: { status, message, data: [rows], meta } }
 *
 * Rather than guess, this handles both and reports which it found. Guessing is
 * the wrong move for a specific reason: the rows would fail loudly at the wrong
 * depth, but `meta.partial` would not. Read at the wrong level it is
 * `undefined`, which is falsy, which means *not partial* — so a chart missing
 * half its data renders as though it were whole. The integration guide calls
 * that "the worst outcome available", and it is the one failure here that is
 * silent.
 *
 * When the question is settled from a real response, this does not need
 * deleting — it needs one `expect` in a test pinning the shape we actually get.
 */

import type { DatasetRow } from '../domain/query'
import type { Envelope } from '../api/client'

export type RelayShape = 'flat' | 'nested'

export interface RelayedBody {
  rows: DatasetRow[]
  /** `meta.partial` from whichever level actually carried it. */
  partial: boolean
  /** The publisher's reason, when they gave one. */
  partialReason: string | null
  /** Which reading matched. Logged once, so the ambiguity is answered in a trace. */
  shape: RelayShape
}

export class RelayShapeError extends Error {
  constructor(saw: string) {
    super(
      `The query response did not carry rows where either documented reading puts them (saw ${saw}).`,
    )
    this.name = 'RelayShapeError'
  }
}

export function readRelayedBody(envelope: Envelope<unknown>): RelayedBody {
  const data = envelope.data

  if (Array.isArray(data)) {
    return { rows: asRows(data), ...partialOf(envelope.meta), shape: 'flat' }
  }

  if (isEnvelopeLike(data)) {
    const inner = data.data
    if (!Array.isArray(inner)) throw new RelayShapeError(describe(inner))
    /*
     * The inner envelope's `meta` wins. Under this reading it is the Source
     * System's own marker, and the outer one is ours — which never sets it.
     */
    return {
      rows: asRows(inner),
      ...partialOf(data.meta ?? envelope.meta),
      shape: 'nested',
    }
  }

  throw new RelayShapeError(describe(data))
}

/**
 * Rows are taken as they arrive, not coerced.
 *
 * The widget data contract asks publishers for JSON numbers rather than
 * formatted strings, precisely because coercing `"1,234.50"` yields `NaN` and a
 * `NaN` in an SVG path draws nothing at all — no error, an empty chart that
 * reads as missing data. Silently repairing it here would hide the contract
 * breach from the only party who can fix it.
 */
const asRows = (values: unknown[]): DatasetRow[] =>
  values.filter((row): row is DatasetRow => typeof row === 'object' && row !== null)

function partialOf(meta: unknown): { partial: boolean; partialReason: string | null } {
  if (typeof meta !== 'object' || meta === null) return { partial: false, partialReason: null }
  const record = meta as { partial?: unknown; reason?: unknown }
  return {
    partial: record.partial === true,
    partialReason: typeof record.reason === 'string' ? record.reason : null,
  }
}

const isEnvelopeLike = (
  value: unknown,
): value is { status: unknown; data?: unknown; meta?: unknown } =>
  typeof value === 'object' && value !== null && 'status' in value && 'data' in value

function describe(value: unknown): string {
  if (value === undefined) return 'no data property'
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  if (typeof value === 'object') return `an object with keys ${Object.keys(value).join(', ') || '(none)'}`
  return typeof value
}
