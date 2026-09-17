/**
 * The refresh behaviour, which is the part of auth that only runs when
 * something goes wrong and therefore never runs while anyone is watching.
 *
 * Three properties, each with a failure it prevents:
 *
 *   - one refresh for ten callers      → a rotating refresh token is not spent twice
 *   - a refusal ends it, a dropped connection does not
 *                                      → nobody is signed out for losing wifi
 *   - storage is cleared before anyone is told
 *                                      → no listener finds the dead session again
 */

import { describe, expect, test } from 'bun:test'
import { sessionTokenProvider } from './otp-provider'
import { memoryTokenStore } from './token-store'
import { createApiClient } from '../api/client'
import { ApiError } from '../api/errors'
import type { AuthTokens } from './port'

const live = (overrides: Partial<AuthTokens> = {}): AuthTokens => ({
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresAt: Date.now() + 15 * 60 * 1000,
  actorId: 'actor-1',
  ...overrides,
})

/** Expired as far as the skew is concerned, so `ensure` must refresh. */
const stale = () => live({ expiresAt: Date.now() + 5_000 })

interface Harness {
  refreshes: number
  reply: 'ok' | 'refused' | 'offline'
  latencyMs: number
}

function providerWith(seed: AuthTokens | null, harness: Partial<Harness> = {}) {
  const state: Harness = { refreshes: 0, reply: 'ok', latencyMs: 0, ...harness }
  const store = memoryTokenStore()
  if (seed) store.write(seed)

  const fetchImpl = (async () => {
    state.refreshes += 1
    if (state.latencyMs > 0) await new Promise((r) => setTimeout(r, state.latencyMs))
    if (state.reply === 'offline') throw new TypeError('Failed to fetch')
    if (state.reply === 'refused') {
      return new Response(JSON.stringify({ status: false, message: 'Invalid refresh token' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      })
    }
    return new Response(
      JSON.stringify({
        status: true,
        message: 'OK',
        data: {
          access_token: `access-${String(state.refreshes + 1)}`,
          refresh_token: `refresh-${String(state.refreshes + 1)}`,
          expires_in: 900,
          actor_id: 'actor-1',
        },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as unknown as typeof globalThis.fetch

  // Silenced: a refused refresh is the expected path in half these tests, and
  // the default diagnostic would print a warning for each one.
  const api = createApiClient({
    baseUrl: 'https://api.example.test',
    fetch: fetchImpl,
    onDiagnostic: () => {},
  })
  return { provider: sessionTokenProvider(api, store), store, state }
}

describe('a fresh token is used as it is', () => {
  test('no refresh while it is comfortably alive', async () => {
    const { provider, state } = providerWith(live())
    expect(await provider.ensure()).toBe('access-1')
    expect(state.refreshes).toBe(0)
  })

  test('a token inside the skew is refreshed before it is sent', async () => {
    /*
     * Five seconds of life is not enough to survive a slow request, so sending
     * it buys a guaranteed 401 and a round trip. The skew is the whole reason
     * most sessions never see one.
     */
    const { provider, state } = providerWith(stale())
    expect(await provider.ensure()).toBe('access-2')
    expect(state.refreshes).toBe(1)
  })

  test('and the refreshed pair is persisted, not just held', async () => {
    // Otherwise a reload lands on the spent refresh token and signs them out.
    const { provider, store } = providerWith(stale())
    await provider.ensure()
    expect(store.read()?.refreshToken).toBe('refresh-2')
  })
})

describe('ten callers, one refresh', () => {
  test('concurrent ensures share a single in-flight refresh', async () => {
    const { provider, state } = providerWith(stale(), { latencyMs: 5 })

    const tokens = await Promise.all(Array.from({ length: 10 }, () => provider.ensure()))

    expect(state.refreshes).toBe(1)
    expect(new Set(tokens).size).toBe(1)
  })

  test('and a renew joins a refresh ensure already started', async () => {
    // A Widget hitting a 401 mid-refresh must wait for the one in progress
    // rather than starting a second with a token that is about to be spent.
    const { provider, state } = providerWith(stale(), { latencyMs: 5 })

    const [a, b] = await Promise.all([provider.ensure(), provider.renew()])

    expect(state.refreshes).toBe(1)
    expect(a).toBe(b)
  })

  test('a later refresh is a new one, not the cached promise', async () => {
    // The in-flight promise must be released when it settles, or the session
    // can never be refreshed a second time.
    const { provider, state } = providerWith(stale(), { latencyMs: 1 })
    await provider.ensure()
    await provider.renew()
    expect(state.refreshes).toBe(2)
  })
})

describe('what ends a session and what does not', () => {
  test('a refused refresh token ends it', async () => {
    const { provider } = providerWith(stale(), { reply: 'refused' })
    await expect(provider.ensure()).rejects.toMatchObject({ kind: 'session-expired' })
  })

  test('a dropped connection does not', async () => {
    /*
     * We never asked, so the refresh token may well still be good. Discarding it
     * here would sign someone out for losing wifi in a lift — and getting back
     * in means waiting for an email.
     */
    const { provider, store } = providerWith(stale(), { reply: 'offline' })
    await expect(provider.ensure()).rejects.toMatchObject({ kind: 'transport' })
    expect(store.read()).not.toBeNull()
    expect(provider.tokens()).not.toBeNull()
  })

  test('no stored session at all ends it immediately', async () => {
    const { provider, state } = providerWith(null)
    await expect(provider.ensure()).rejects.toMatchObject({ kind: 'session-expired' })
    expect(state.refreshes).toBe(0)
  })
})

describe('ending a session leaves nothing behind', () => {
  test('storage is cleared and listeners are told', async () => {
    const { provider, store } = providerWith(stale(), { reply: 'refused' })
    const seen: boolean[] = []
    provider.onExpired(() => seen.push(store.read() === null))

    await expect(provider.ensure()).rejects.toThrow()

    expect(seen).toEqual([true])
    expect(provider.tokens()).toBeNull()
  })

  test('the order matters: cleared first, announced second', async () => {
    /*
     * A listener re-reading the store — a boot path, a second tab — must not
     * find the session that has just been given up on, or it will try to use it
     * and end it all over again.
     */
    const { provider, store } = providerWith(stale(), { reply: 'refused' })
    let storedWhenTold: unknown = 'not called'
    provider.onExpired(() => {
      storedWhenTold = store.read()
    })
    await expect(provider.ensure()).rejects.toThrow()
    expect(storedWhenTold).toBeNull()
  })

  test('unsubscribing works', async () => {
    const { provider } = providerWith(stale(), { reply: 'refused' })
    let called = 0
    const stop = provider.onExpired(() => (called += 1))
    stop()
    await expect(provider.ensure()).rejects.toThrow()
    expect(called).toBe(0)
  })
})

describe('signing in and out', () => {
  test('adopting a bundle persists it', () => {
    const { provider, store } = providerWith(null)
    provider.adopt(live({ accessToken: 'fresh' }))
    expect(store.read()?.accessToken).toBe('fresh')
    expect(provider.tokens()?.accessToken).toBe('fresh')
  })

  test('discarding clears storage', async () => {
    const { provider, store } = providerWith(live())
    provider.discard()
    expect(store.read()).toBeNull()
    await expect(provider.ensure()).rejects.toMatchObject({ kind: 'session-expired' })
  })
})

describe('an error raised here is the one the client understands', () => {
  test('it is an ApiError, so the client passes it through unchanged', async () => {
    // The client re-wraps anything that is not one as a transport failure, which
    // would turn "your session ended" into "check your connection".
    const { provider } = providerWith(null)
    try {
      await provider.ensure()
      throw new Error('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError)
    }
  })
})
