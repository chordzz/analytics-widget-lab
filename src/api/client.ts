/**
 * The one place that speaks HTTP to the Analytics API.
 *
 * Three things live here and nowhere else, because each is a rule that has to
 * hold for every call rather than a detail of any one of them:
 *
 *   - **the envelope.** Every response, success or failure, is
 *     `{ status, message, data }` — the API says so and the running service
 *     confirms it. One unwrap here; nothing above ever sees the wrapper.
 *   - **the status table.** Which code means denied, withdrawn, or the source
 *     system being down. Adapters map kinds to render states; they do not read
 *     status codes.
 *   - **401, once.** A first 401 asks for a refresh and a retry. A second means
 *     the session is genuinely over. Never a third.
 *
 * What deliberately does *not* live here is any knowledge of Datasets, Widgets
 * or rows. This module could serve a different API of the same shape.
 */

import { ApiError, kindForStatus, type Violation } from './errors'
import type { TokenProvider } from '../auth/port'

/** The shape every response takes. */
export interface Envelope<T = unknown> {
  status: boolean
  message: string
  data?: T
  /**
   * Not in the API's own `Envelope` schema, but the integration guide requires
   * Source Systems to set `meta.partial` on a truncated result and says it
   * "reaches the portal". Typed here so the retrieval adapter can look for it
   * rather than discovering it exists by reading a network trace.
   */
  meta?: Record<string, unknown>
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | boolean | null | undefined>
  /**
   * Default true. The three `/auth` routes are `security: []` — they mint the
   * token every other route requires, so asking for one first would deadlock.
   */
  authenticated?: boolean
}

/** Emitted on every non-2xx, for the console or a log sink. Never carries a token. */
export interface Diagnostic {
  path: string
  status: number | null
  kind: string
  message: string
  requestId: string | null
  correlationId: string | null
}

export interface ApiClientOptions {
  baseUrl: string
  /** Omit for a client that only calls unauthenticated routes. */
  tokens?: TokenProvider
  /** Injected so tests need no network. */
  fetch?: typeof globalThis.fetch
  onDiagnostic?: (entry: Diagnostic) => void
}

export interface ApiClient {
  /** Resolves to `envelope.data`. What almost every caller wants. */
  request<T>(path: string, options?: RequestOptions): Promise<T>
  /**
   * Resolves to the whole envelope.
   *
   * The query endpoint needs this. Its 200 is described both as the Source
   * System's envelope relayed verbatim *and* as our envelope carrying that body
   * in `data` — readings that differ by a level of nesting, and `meta.partial`
   * sits at a different depth in each. An adapter handed only `data` cannot tell
   * which it got, and the failure mode is a truncated chart that does not say so.
   */
  requestEnvelope<T>(path: string, options?: RequestOptions): Promise<Envelope<T>>
}

export function createApiClient({
  baseUrl,
  tokens,
  fetch: fetchImpl = globalThis.fetch,
  onDiagnostic = defaultDiagnostic,
}: ApiClientOptions): ApiClient {
  const root = baseUrl.replace(/\/+$/, '')

  async function send(path: string, options: RequestOptions): Promise<Response> {
    const authenticated = options.authenticated !== false

    const attempt = async (token: string | null) => {
      const headers: Record<string, string> = { Accept: 'application/json' }
      if (token) headers.Authorization = `Bearer ${token}`
      if (options.body !== undefined) headers['Content-Type'] = 'application/json'

      return fetchImpl(root + path + queryString(options.query), {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
      })
    }

    if (!authenticated || !tokens) {
      try {
        return await attempt(null)
      } catch {
        throw transportError(path)
      }
    }

    let response: Response
    try {
      response = await attempt(await tokens.ensure())
    } catch (error) {
      throw asSessionOrTransport(path, error)
    }

    if (response.status !== 401) return response

    /*
     * One retry, and only one.
     *
     * The clock is not the only thing that ends a session — a token can be
     * revoked before it expires, and a laptop can wake with a stale idea of the
     * time — so a 401 is evidence that outranks `ensure`'s arithmetic. But a
     * second 401 carrying a token IAM has just issued means the session is over,
     * and a client that keeps trying here logs a user out by hammering IAM on
     * their behalf.
     */
    let renewed: string
    try {
      renewed = await tokens.renew()
    } catch (error) {
      throw asSessionOrTransport(path, error)
    }

    try {
      response = await attempt(renewed)
    } catch {
      throw transportError(path)
    }

    if (response.status === 401) {
      throw new ApiError({
        kind: 'session-expired',
        message: 'Your session has ended. Please sign in again.',
        status: 401,
        requestId: response.headers.get('x-request-id'),
      })
    }

    return response
  }

  async function envelopeOf<T>(path: string, options: RequestOptions = {}): Promise<Envelope<T>> {
    const response = await send(path, options)
    const requestId = response.headers.get('x-request-id')
    const body = await readJson(response)

    if (!response.ok) {
      const kind = kindForStatus(response.status)
      const message = messageOf(body) ?? `The request failed (${String(response.status)}).`
      onDiagnostic({
        path,
        status: response.status,
        kind,
        message,
        requestId,
        correlationId: response.headers.get('x-correlation-id'),
      })
      throw new ApiError({
        kind,
        message,
        status: response.status,
        violations: violationsOf(body),
        requestId,
      })
    }

    if (!isEnvelope(body)) {
      /*
       * Not defensive pedantry. "Every response, success or failure" is an
       * envelope, so a 200 that is not one means we are talking to something
       * else — a proxy's error page, a redirect to a login form, a mock left
       * running. Saying that plainly beats reading `undefined.data` three
       * frames later.
       */
      throw new ApiError({
        kind: 'malformed',
        message: 'The API returned a 200 that is not the documented envelope.',
        status: response.status,
        requestId,
      })
    }

    return body as Envelope<T>
  }

  return {
    requestEnvelope: envelopeOf,
    async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
      return (await envelopeOf<T>(path, options)).data as T
    },
  }
}

function queryString(query: RequestOptions['query']): string {
  if (!query) return ''
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    // `undefined` and `null` mean "not asked for". Sending `?from=undefined`
    // would be a filter value the Source System has to reject.
    if (value === undefined || value === null) continue
    params.set(key, String(value))
  }
  const encoded = params.toString()
  return encoded ? `?${encoded}` : ''
}

/** A body that is not JSON is not a reason to throw here; the status still is. */
async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return null
  }
}

const isEnvelope = (body: unknown): body is Envelope =>
  typeof body === 'object' &&
  body !== null &&
  'status' in body &&
  typeof (body as { status: unknown }).status === 'boolean'

function messageOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const message = (body as { message?: unknown }).message
  return typeof message === 'string' && message !== '' ? message : null
}

function violationsOf(body: unknown): Violation[] {
  if (typeof body !== 'object' || body === null) return []
  const data = (body as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return []
  const violations = (data as { violations?: unknown }).violations
  if (!Array.isArray(violations)) return []
  return violations.filter(
    (entry): entry is Violation =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as Violation).field === 'string' &&
      typeof (entry as Violation).message === 'string',
  )
}

/**
 * `fetch` rejected, so there is no response and nothing to quote.
 *
 * The thrown cause is deliberately dropped rather than folded into the message:
 * it is a browser string about DNS or CORS that means nothing to whoever reads
 * it, and the path is the part that identifies the call.
 */
const transportError = (path: string) =>
  new ApiError({
    kind: 'transport',
    message: `Could not reach the Analytics API (${path}).`,
    status: null,
  })

/**
 * A token provider that gives up throws its own `ApiError`; anything else that
 * happens while getting a token is a transport problem. Re-wrapping the first
 * would turn "your session ended" into "we could not reach the API", which
 * sends someone to check their network instead of signing in.
 */
function asSessionOrTransport(path: string, error: unknown): ApiError {
  if (error instanceof Error && error.name === 'ApiError') return error as ApiError
  return transportError(path)
}

function defaultDiagnostic(entry: Diagnostic): void {
  // `x-request-id` is the single highest-value thing to log here: it is what
  // lets a backend engineer find this exact call in their own logs.
  console.warn(
    `[analytics-api] ${entry.path} → ${String(entry.status)} ${entry.kind}` +
      (entry.requestId ? ` (request ${entry.requestId})` : ''),
  )
}
