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
 * There is a third shape, and it is not an ambiguity — it is a different kind
 * of answer:
 *
 *   aggregate: { status, message, data: { value: 1420, delta: 28 } }
 *
 * One object rather than a list, because the question has one answer. The API
 * asks for it by name: `PresentationOption.single_value` says to back a stat
 * card with "an aggregate-shaped Dataset — the Source System returns the figure
 * over the received filters; Analytics and the frontend never compute it."
 *
 * We rejected it outright until 22 September, which cost sixteen of Peniremit's
 * forty-one Datasets — every stat card on all four of their dashboards — a
 * `failed` widget rather than a number. Read as one row, which is what it is:
 * everything downstream already handles a single row, `singleValueOf`
 * included.
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

export type RelayShape = 'flat' | 'nested' | 'aggregate'

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
      `The query response carried neither rows nor a single aggregate figure, in any of the ` +
        `three readings the contract admits (saw ${saw}).`,
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
    /*
     * The inner envelope's `meta` wins. Under this reading it is the Source
     * System's own marker, and the outer one is ours — which never sets it.
     */
    const meta = partialOf(data.meta ?? envelope.meta)

    if (Array.isArray(inner)) return { rows: asRows(inner), ...meta, shape: 'nested' }

    // Aggregate, one level deeper. Both ambiguities are orthogonal: a publisher
    // may nest *and* answer with a single figure, and rejecting that
    // combination would be an accident of how these two checks are ordered.
    const single = asSingleRow(inner)
    if (single) return { rows: single.rows, ...meta, shape: 'aggregate' }

    throw new RelayShapeError(describe(inner))
  }

  const single = asSingleRow(data)
  if (single) return { rows: single.rows, ...partialOf(envelope.meta), shape: 'aggregate' }

  throw new RelayShapeError(describe(data))
}

/**
 * An aggregate answer, as the one row it is.
 *
 * `{}` is *not* that row. A stat card over an object with no fields reads
 * `NaN`, which draws as a dash and looks like a rendering fault; zero rows
 * reaches the `empty` state, which says plainly that the endpoint answered with
 * nothing. A genuine zero still has a key — `{ "value": 0 }` — so the two are
 * distinguishable and nothing real is lost.
 *
 * Returns a wrapper rather than the rows themselves, so that "not an object"
 * and "an object with no fields" stay distinct at the call site.
 */
function asSingleRow(value: unknown): { rows: DatasetRow[] } | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return { rows: Object.keys(value).length === 0 ? [] : [value as DatasetRow] }
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
