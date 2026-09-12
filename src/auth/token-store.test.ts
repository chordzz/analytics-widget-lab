/**
 * Storage hygiene.
 *
 * Two of these are about the decision to use `localStorage` rather than about
 * the code: a stored blob outlives the build that wrote it, so it is untrusted
 * input, and anything we cannot fully understand is cleared rather than kept.
 */

import { describe, expect, test } from 'bun:test'
import { STORAGE_KEY, browserTokenStore, memoryTokenStore } from './token-store'
import type { AuthTokens } from './port'

const tokens: AuthTokens = {
  accessToken: 'access',
  refreshToken: 'refresh',
  expiresAt: 1_800_000_000_000,
  actorId: 'actor-1',
}

/** A `Storage`-shaped object; bun has no DOM. */
function fakeStorage(seed: Record<string, string> = {}) {
  const held = new Map(Object.entries(seed))
  return {
    getItem: (key: string) => held.get(key) ?? null,
    setItem: (key: string, value: string) => void held.set(key, value),
    removeItem: (key: string) => void held.delete(key),
    clear: () => held.clear(),
    key: (index: number) => [...held.keys()][index] ?? null,
    get length() {
      return held.size
    },
    held,
  }
}

describe('a session survives a reload', () => {
  test('what is written comes back', () => {
    const store = browserTokenStore(fakeStorage() as unknown as Storage)
    store.write(tokens)
    expect(store.read()).toEqual(tokens)
  })

  test('one namespaced, versioned key', () => {
    // The version is what lets a shape change invalidate every stored session
    // instead of being met by parse failures on every load.
    const storage = fakeStorage()
    browserTokenStore(storage as unknown as Storage).write(tokens)
    expect([...storage.held.keys()]).toEqual([STORAGE_KEY])
    expect(STORAGE_KEY).toMatch(/\.v\d+$/)
  })
})

describe('a blob we cannot fully understand is not a session', () => {
  const rejected: Record<string, string> = {
    'not json': 'nonsense{',
    'not an object': '"a string"',
    null: 'null',
    'missing refresh token': JSON.stringify({ ...tokens, refreshToken: undefined }),
    'empty access token': JSON.stringify({ ...tokens, accessToken: '' }),
    'expiry as a string': JSON.stringify({ ...tokens, expiresAt: '1800000000000' }),
    'expiry not finite': JSON.stringify({ ...tokens, expiresAt: Number.NaN }),
  }

  for (const [why, raw] of Object.entries(rejected)) {
    test(`${why} reads as signed out`, () => {
      expect(browserTokenStore(fakeStorage({ [STORAGE_KEY]: raw }) as unknown as Storage).read()).toBeNull()
    })
  }

  test('and is cleared, not left to fail again on every load', () => {
    const storage = fakeStorage({ [STORAGE_KEY]: 'nonsense{' })
    browserTokenStore(storage as unknown as Storage).read()
    expect(storage.held.has(STORAGE_KEY)).toBe(false)
  })

  test('a string expiry would otherwise refresh forever', () => {
    /*
     * The reason `expiresAt` is type-checked rather than trusted. `'180…' - skew`
     * is `NaN`, `NaN > now` is false, so a token stored by an older build would
     * be treated as expired on every single call — a refresh per request, which
     * looks like a working session right up until IAM rate-limits it.
     */
    const stored = JSON.stringify({ ...tokens, expiresAt: '1800000000000' })
    expect(browserTokenStore(fakeStorage({ [STORAGE_KEY]: stored }) as unknown as Storage).read()).toBeNull()
  })
})

describe('signing out leaves nothing behind', () => {
  test('clear removes the key', () => {
    const storage = fakeStorage()
    const store = browserTokenStore(storage as unknown as Storage)
    store.write(tokens)
    store.clear()
    expect(storage.held.size).toBe(0)
    expect(store.read()).toBeNull()
  })
})

describe('storage that is unavailable is not a crash', () => {
  test('a null storage reads as signed out and swallows writes', () => {
    // Safari in private mode, a browser set to block site data, some webviews.
    // "Cannot persist" must degrade to "ask for a code again", not to a blank page.
    const store = browserTokenStore(null)
    expect(() => store.write(tokens)).not.toThrow()
    expect(store.read()).toBeNull()
    expect(() => store.clear()).not.toThrow()
  })

  test('a storage that throws is treated the same way', () => {
    const hostile = {
      getItem() {
        throw new Error('denied')
      },
      setItem() {
        throw new Error('denied')
      },
      removeItem() {
        throw new Error('denied')
      },
    } as unknown as Storage

    const store = browserTokenStore(hostile)
    expect(store.read()).toBeNull()
    expect(() => store.write(tokens)).not.toThrow()
    expect(() => store.clear()).not.toThrow()
  })
})

describe('the in-memory store is the same contract', () => {
  test('round trip and clear', () => {
    const store = memoryTokenStore()
    expect(store.read()).toBeNull()
    store.write(tokens)
    expect(store.read()).toEqual(tokens)
    store.clear()
    expect(store.read()).toBeNull()
  })
})
