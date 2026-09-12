/**
 * The token provider for the standalone app.
 *
 * Holds the session, refreshes it, and says when it is over. Two properties are
 * the whole of the design and both are invisible in a session that never
 * expires — which, in development, is every session anyone tests by hand.
 *
 * **One refresh, not ten.** A board's Widgets query in parallel, so they expire
 * in parallel. Without a shared in-flight promise, ten Widgets start ten
 * refreshes; if the API rotates refresh tokens — likely, and unconfirmed — nine
 * present a token the first has already spent, and the session ends *because*
 * it was being used.
 *
 * **The clock is a hint, not the answer.** `ensure` refreshes early, on
 * `expiresAt` minus a skew, which avoids most 401s. It cannot avoid all of
 * them: a token can be revoked before it expires and a laptop can wake with a
 * stale idea of the time. So a 401 still has to be able to force a refresh,
 * which is what `renew` is for.
 */

import { ApiError } from '../api/errors'
import { refreshTokens } from './otp-client'
import { isFresh, type AuthTokens, type TokenProvider } from './port'
import type { ApiClient } from '../api/client'
import type { TokenStore } from './token-store'

export interface SessionTokenProvider extends TokenProvider {
  /** The stored session, if there is one. Read at boot to decide what to show. */
  tokens(): AuthTokens | null
  /** After a successful `/auth/verify-otp`. */
  adopt(tokens: AuthTokens): void
  /** Sign out. Local only — the API publishes no revocation endpoint. */
  discard(): void
}

export function sessionTokenProvider(api: ApiClient, store: TokenStore): SessionTokenProvider {
  let held: AuthTokens | null = store.read()
  let inflight: Promise<string> | null = null
  const listeners = new Set<() => void>()

  function end(): never {
    /*
     * Storage is cleared before anyone is told. A listener that re-reads the
     * store — a second tab, a boot path — must not find the dead session that
     * has just been given up on.
     */
    held = null
    store.clear()
    for (const listener of listeners) listener()
    throw new ApiError({
      kind: 'session-expired',
      message: 'Your session has ended. Please sign in again.',
      status: 401,
    })
  }

  async function refresh(): Promise<string> {
    const refreshToken = held?.refreshToken
    if (!refreshToken) end()

    let next: AuthTokens
    try {
      next = await refreshTokens(api, refreshToken)
    } catch (error) {
      /*
       * Only a *refusal* ends the session. A transport failure means we never
       * asked, so the refresh token may well still be good — discarding it
       * would sign someone out for a dropped connection, and they would have to
       * wait for an email to get back in.
       */
      if (error instanceof ApiError && error.kind === 'transport') throw error
      end()
    }

    held = next
    store.write(next)
    return next.accessToken
  }

  function renew(): Promise<string> {
    inflight ??= refresh().finally(() => {
      inflight = null
    })
    return inflight
  }

  return {
    async ensure() {
      if (!held) end()
      // A refresh already running is the one to wait for, even if this caller's
      // own arithmetic says the token is still good.
      if (inflight) return inflight
      return isFresh(held) ? held.accessToken : renew()
    },

    renew,

    onExpired(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    tokens: () => held,

    adopt(tokens) {
      held = tokens
      store.write(tokens)
    },

    discard() {
      held = null
      store.clear()
    },
  }
}
