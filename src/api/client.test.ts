/**
 * The rules that have to hold for every call.
 *
 * Two of these are the reason this module exists at all. **One refresh, not
 * ten** is invisible in a working session and catastrophic if the API rotates
 * refresh tokens. **401 twice is the end** is the difference between signing
 * someone out once and hammering IAM until it signs them out for us.
 */

import { describe, expect, test } from 'bun:test'
import { createApiClient, type Diagnostic } from './client'
import { ApiError, isApiError } from './errors'
import { fakeTokenProvider } from '../auth/fake-provider'

const envelope = (data: unknown, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ status: true, message: 'OK', data, ...extra })

interface Call {
  url: string
  authorization: string | null
  method: string
  body: string | null
}

/** A `fetch` that records what it was asked and replies from a script. */
function stubFetch(replies: (call: Call) => Response) {
  const calls: Call[] = []
  const impl = ((input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers)
    const call: Call = {
      url: String(input),
      authorization: headers.get('Authorization'),
      method: init?.method ?? 'GET',
      body: typeof init?.body === 'string' ? init.body : null,
    }
    calls.push(call)
    return Promise.resolve(replies(call))
  }) as typeof globalThis.fetch
  return { impl, calls }
}

const json = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(body, { status, headers: { 'content-type': 'application/json', ...headers } })

const clientWith = (replies: (call: Call) => Response, tokens = fakeTokenProvider()) => {
  const { impl, calls } = stubFetch(replies)
  const diagnostics: Diagnostic[] = []
  const client = createApiClient({
    baseUrl: 'https://api.example.test/',
    tokens,
    fetch: impl,
    onDiagnostic: (entry) => diagnostics.push(entry),
  })
  return { client, calls, tokens, diagnostics }
}

describe('the envelope is unwrapped exactly once', () => {
  test('a caller receives `data`, not the wrapper', async () => {
    const { client } = clientWith(() => json(envelope({ id: 'peniremit.settlements' })))
    expect(await client.request<{ id: string }>('/v1/datasets/x')).toEqual({
      id: 'peniremit.settlements',
    })
  })

  test('the whole envelope is available when the caller needs it', async () => {
    /*
     * The query endpoint does. Its 200 is described both as the Source System's
     * envelope relayed verbatim and as ours carrying that body in `data`, and
     * `meta.partial` sits at a different depth under each reading. An adapter
     * handed only `data` cannot tell which it received.
     */
    const { client } = clientWith(() =>
      json(envelope([{ region: 'EMEA' }], { meta: { partial: true, reason: 'retention' } })),
    )
    const result = await client.requestEnvelope('/v1/datasets/x/query')
    expect(result.data).toEqual([{ region: 'EMEA' }])
    expect(result.meta).toEqual({ partial: true, reason: 'retention' })
  })

  test('a 200 that is not an envelope is named, not dereferenced', async () => {
    // A proxy error page, a redirect to a login form, a mock left running. All
    // present as a 200 whose body has no `status`, and all are better reported
    // than met as `undefined.data` three frames later.
    const { client } = clientWith(() => json('<!doctype html><p>hello'))
    expect(client.request('/v1/datasets')).rejects.toMatchObject({ kind: 'malformed' })
  })
})

describe('the status table', () => {
  const cases: [number, string][] = [
    [400, 'validation'],
    [403, 'denied'],
    [404, 'not-found'],
    [410, 'withdrawn'],
    [500, 'upstream'],
    [503, 'unavailable'],
    [504, 'timeout'],
  ]

  for (const [status, kind] of cases) {
    test(`${String(status)} is ${kind}`, async () => {
      const { client } = clientWith(() =>
        json(JSON.stringify({ status: false, message: 'nope' }), status),
      )
      await expect(client.request('/v1/datasets/x/query')).rejects.toMatchObject({ kind })
    })
  }

  test("the envelope's message is what a human is shown", async () => {
    const { client } = clientWith(() =>
      json(JSON.stringify({ status: false, message: 'Insufficient permissions' }), 403),
    )
    await expect(client.request('/v1/datasets/x/query')).rejects.toThrow('Insufficient permissions')
  })

  test('a 400 carries every violation at once', async () => {
    // The API states this is deliberate, so a publisher fixes a declaration in
    // one round trip rather than one error at a time. Dropping them here would
    // throw that away at the last step.
    const { client } = clientWith(() =>
      json(
        JSON.stringify({
          status: false,
          message: 'Dataset declaration rejected',
          data: {
            violations: [
              { field: 'fields[2].aggregations', message: '"sum" cannot be applied to a string' },
              { field: 'required_permission_key', message: 'must match <domain-key>::<resource>' },
            ],
          },
        }),
        400,
      ),
    )

    try {
      await client.request('/v1/datasets', { method: 'POST', body: {} })
      throw new Error('should have thrown')
    } catch (error) {
      expect(isApiError(error)).toBe(true)
      expect((error as ApiError).violations).toHaveLength(2)
      expect((error as ApiError).violations[0].field).toBe('fields[2].aggregations')
    }
  })

  test('fetch itself failing is a different thing from a bad answer', async () => {
    // Offline, DNS, CORS. There is no response, so there is no status and no
    // message — reporting it as a server error would send someone to read logs
    // that do not mention the call.
    const { impl } = stubFetch(() => {
      throw new Error('network down')
    })
    const client = createApiClient({ baseUrl: 'https://api.example.test', fetch: impl })
    await expect(client.request('/v1/datasets')).rejects.toMatchObject({
      kind: 'transport',
      status: null,
    })
  })
})

describe('401 is refreshed once, and only once', () => {
  test('a first 401 refreshes and retries, and the caller never sees it', async () => {
    const tokens = fakeTokenProvider()
    let seen = 0
    const { client, calls } = clientWith(() => {
      seen += 1
      return seen === 1
        ? json(JSON.stringify({ status: false, message: 'Invalid or expired token' }), 401)
        : json(envelope([{ region: 'EMEA' }]))
    }, tokens)

    expect(await client.request<unknown[]>('/v1/datasets/x/query')).toEqual([{ region: 'EMEA' }])
    expect(calls).toHaveLength(2)
    expect(tokens.refreshCount()).toBe(1)
    // And the retry carried the new token, not the one that was just refused.
    expect(calls[1].authorization).not.toEqual(calls[0].authorization)
  })

  test('a second 401 ends the session and makes no third attempt', async () => {
    /*
     * The token IAM has just issued is being refused, so retrying cannot help.
     * A client that loops here signs the user out by hammering IAM on their
     * behalf, which is the same outcome reached expensively.
     */
    const tokens = fakeTokenProvider()
    const { client, calls } = clientWith(
      () => json(JSON.stringify({ status: false, message: 'Invalid or expired token' }), 401),
      tokens,
    )

    await expect(client.request('/v1/datasets/x/query')).rejects.toMatchObject({
      kind: 'session-expired',
    })
    expect(calls).toHaveLength(2)
  })

  test('a rejected refresh token ends the session', async () => {
    const tokens = fakeTokenProvider()
    tokens.expire()
    tokens.breakRefresh()
    const { client } = clientWith(() => json(envelope([])), tokens)

    await expect(client.request('/v1/datasets/x/query')).rejects.toMatchObject({
      kind: 'session-expired',
    })
  })

  test('but a refresh that could not be attempted is a network problem', async () => {
    /*
     * The distinction the client must not flatten. A dead refresh token and a
     * dropped connection both leave us without a token, and they need opposite
     * advice: sign in again, versus check your connection and retry. Telling
     * someone the wrong one costs them the other fix.
     */
    const tokens = fakeTokenProvider()
    tokens.expire()
    tokens.breakNetwork()
    const { client } = clientWith(() => json(envelope([])), tokens)

    await expect(client.request('/v1/datasets/x/query')).rejects.toMatchObject({
      kind: 'transport',
    })
  })
})

describe('a board of widgets refreshes once between them', () => {
  test('ten concurrent 401s produce one refresh and ten successes', async () => {
    /*
     * The property the whole seam exists for. A board's widgets query in
     * parallel, so they expire in parallel; ten independent refreshes against an
     * API that rotates refresh tokens means nine are spending a token the first
     * already used, and the session ends *because* it was in use.
     *
     * Latency on the fake is load-bearing: with an instantly-resolving refresh
     * the calls would not actually overlap and the test would pass without
     * proving anything.
     */
    const tokens = fakeTokenProvider({ latencyMs: 5 })
    const refused = new Set<string>()

    const { client, calls } = clientWith((call) => {
      const token = call.authorization ?? ''
      // Every widget's first call is refused once, the way an expiry lands.
      if (token.endsWith('-1') && !refused.has(call.url + token)) {
        refused.add(call.url + token)
        return json(JSON.stringify({ status: false, message: 'Invalid or expired token' }), 401)
      }
      return json(envelope([{ ok: true }]))
    }, tokens)

    const results = await Promise.all(
      Array.from({ length: 10 }, (_, index) =>
        client.request<unknown[]>(`/v1/datasets/d${String(index)}/query`),
      ),
    )

    expect(results).toHaveLength(10)
    expect(results.every((rows) => Array.isArray(rows))).toBe(true)
    expect(tokens.refreshCount()).toBe(1)
    expect(calls).toHaveLength(20)
  })
})

describe('what gets logged, and what never does', () => {
  test('a failure logs the request id, which is what finds it upstream', async () => {
    const { client, diagnostics } = clientWith(() =>
      json(JSON.stringify({ status: false, message: 'nope' }), 503, {
        'x-request-id': '7f3c9a12',
        'x-correlation-id': '7f3c9a12',
      }),
    )

    await expect(client.request('/v1/datasets')).rejects.toThrow()
    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0].requestId).toBe('7f3c9a12')
  })

  test('and the error carries it too, where a UI can surface it', async () => {
    const { client } = clientWith(() =>
      json(JSON.stringify({ status: false, message: 'nope' }), 503, { 'x-request-id': 'abc123' }),
    )
    await expect(client.request('/v1/datasets')).rejects.toMatchObject({ requestId: 'abc123' })
  })

  test('no token reaches a diagnostic or an error message', async () => {
    /*
     * Cheap, and it is the kind of leak that arrives by accident during a
     * debugging session and never leaves — a token pasted into an error string
     * ends up in whatever log sink the deployment has.
     */
    const tokens = fakeTokenProvider()
    const { client, diagnostics } = clientWith(
      () => json(JSON.stringify({ status: false, message: 'nope' }), 503),
      tokens,
    )

    const secret = tokens.current()
    try {
      await client.request('/v1/datasets')
    } catch (error) {
      expect(String((error as Error).message)).not.toContain(secret)
    }
    expect(JSON.stringify(diagnostics)).not.toContain(secret)
  })

  test('a successful call logs nothing', async () => {
    const { client, diagnostics } = clientWith(() => json(envelope([])))
    await client.request('/v1/datasets')
    expect(diagnostics).toHaveLength(0)
  })
})

describe('the request itself', () => {
  test('the bearer token is attached', async () => {
    const { client, calls, tokens } = clientWith(() => json(envelope([])))
    await client.request('/v1/datasets')
    expect(calls[0].authorization).toBe(`Bearer ${tokens.current()}`)
  })

  test('an unauthenticated route asks for no token', async () => {
    // The three /auth routes are `security: []` — they mint the token every
    // other route requires, so waiting for one first would deadlock sign-in.
    const tokens = fakeTokenProvider()
    const { client, calls } = clientWith(() => json(envelope({ sent: true })), tokens)
    await client.request('/auth/request-otp', {
      method: 'POST',
      body: { email: 'a@b.com' },
      authenticated: false,
    })
    expect(calls[0].authorization).toBeNull()
    expect(calls[0].body).toBe('{"email":"a@b.com"}')
  })

  test('filters become query parameters, and absent ones are absent', async () => {
    // `?from=undefined` is a filter value the Source System has to reject, and
    // it would read as our bug in their logs.
    const { client, calls } = clientWith(() => json(envelope([])))
    await client.request('/v1/datasets/x/query', {
      query: { from: '2026-08-01', currency: 'NGN', to: undefined, limit: null },
    })
    expect(calls[0].url).toBe('https://api.example.test/v1/datasets/x/query?from=2026-08-01&currency=NGN')
  })

  test('a trailing slash on the base URL does not double up', async () => {
    const { client, calls } = clientWith(() => json(envelope([])))
    await client.request('/v1/me')
    expect(calls[0].url).toBe('https://api.example.test/v1/me')
  })
})
