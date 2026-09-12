/**
 * A sign-in that never leaves the browser.
 *
 * Same role the fixtures play for the Catalogue: the screen can be built,
 * reviewed and tested — including every failure it has to render — before the
 * real calls exist and without anyone typing a credential.
 *
 * The failures are the point. A sign-in screen is almost all error handling, and
 * the errors are the part nobody sees until they happen to someone.
 */

import { SignInError, type AuthTokens, type SignInClient } from './port'

/** The code the fake accepts. Anything else is rejected as a 401 would be. */
export const FAKE_CODE = '123456'

/** Ask for a code with this address to see the 503 path. */
export const UNAVAILABLE_EMAIL = 'unavailable@example.com'

export interface FakeSignInOptions {
  /** So the pending states are designed rather than glimpsed. */
  latencyMs?: number
  /** Mirrors `expires_in_seconds` from `/auth/request-otp`. */
  expiresInSeconds?: number
}

export function fakeSignInClient({
  latencyMs = 400,
  expiresInSeconds = 300,
}: FakeSignInOptions = {}): SignInClient {
  const pause = () => new Promise((resolve) => setTimeout(resolve, latencyMs))

  return {
    async requestCode(email) {
      await pause()
      if (email.trim().toLowerCase() === UNAVAILABLE_EMAIL) {
        throw new SignInError({
          kind: 'unavailable',
          message: 'Sign-in is temporarily unavailable. Please try again in a few minutes.',
        })
      }
      /*
       * Resolves for every other address, registered or not — which is the whole
       * behaviour being modelled. The real endpoint answers identically either
       * way so that the form cannot be used to discover who has an account, and
       * a fake that said "unknown email" would let us build a screen that gives
       * that away.
       */
      return { expiresInSeconds }
    },

    async verifyCode(email, otp) {
      await pause()
      if (otp !== FAKE_CODE) {
        throw new SignInError({
          kind: 'rejected',
          message: "That code wasn't right. Check it and try again.",
        })
      }
      return {
        accessToken: 'fake-access-token',
        refreshToken: 'fake-refresh-token',
        expiresAt: Date.now() + 15 * 60 * 1000,
        actorId: `fake:${email}`,
      } satisfies AuthTokens
    },
  }
}
