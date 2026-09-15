/**
 * A token provider whose session can be ended on command.
 *
 * The refresh behaviour is the part of auth most likely to be wrong and least
 * likely to be noticed: it only runs when a token expires, which in development
 * is roughly never. So it gets a fake that can expire on demand and that counts
 * how many refreshes actually happened — because "one refresh, not ten" is the
 * property, and a working session looks identical either way.
 */

import { ApiError } from '../api/errors'
import type { TokenProvider } from './port'

export interface FakeTokenProvider extends TokenProvider {
  /** The next `ensure()` refreshes. */
  expire(): void
  /** The refresh token is rejected — the session is over. */
  breakRefresh(): void
  /** The refresh cannot be attempted at all — the network is down. */
  breakNetwork(): void
  /** How many times a refresh actually reached the wire. */
  refreshCount(): number
  current(): string
}

export interface FakeTokenOptions {
  /** Resolve refreshes on a later tick, so concurrent callers really do overlap. */
  latencyMs?: number
}

export function fakeTokenProvider({ latencyMs = 0 }: FakeTokenOptions = {}): FakeTokenProvider {
  let generation = 1
  let stale = false
  let broken = false
  let offline = false
  let refreshes = 0
  let inflight: Promise<string> | null = null
  const listeners = new Set<() => void>()

  const token = () => `fake-token-${String(generation)}`

  async function refresh(): Promise<string> {
    refreshes += 1
    if (latencyMs > 0) await new Promise((resolve) => setTimeout(resolve, latencyMs))
    if (offline) throw new TypeError('Failed to fetch')
    if (broken) {
      for (const listener of listeners) listener()
      /*
       * A *rejected* refresh token, which is a session ending — the same
       * `ApiError` the real provider raises when `/auth/refresh` answers 401.
       * A plain `Error` here would be indistinguishable from the network being
       * down, and the client would tell someone to check their connection when
       * what they need to do is sign in again.
       */
      throw new ApiError({
        kind: 'session-expired',
        message: 'Your session has ended. Please sign in again.',
        status: 401,
      })
    }
    generation += 1
    stale = false
    return token()
  }

  /**
   * One in-flight refresh, shared.
   *
   * Ten widgets on a board all get their 401 in the same tick. Without this each
   * would start its own refresh, and if the API rotates refresh tokens — likely,
   * and still unconfirmed — nine of them would present one the first has already
   * spent, and the session would end because it was being used.
   */
  function renew(): Promise<string> {
    inflight ??= refresh().finally(() => {
      inflight = null
    })
    return inflight
  }

  return {
    async ensure() {
      return stale ? renew() : token()
    },
    renew,
    onExpired(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    expire() {
      stale = true
    },
    breakRefresh() {
      broken = true
    },
    breakNetwork() {
      offline = true
    },
    refreshCount: () => refreshes,
    current: token,
  }
}
