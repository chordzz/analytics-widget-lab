/**
 * The three `/auth` calls, typed.
 *
 * All three are `security: []` — they mint the token every other route
 * requires — so every request here is unauthenticated by construction.
 *
 * The mapping from status to `SignInFailure` is the substance. The API answers
 * 401 for a wrong code and 503 when it cannot reach the authorization service,
 * and those must not reach the screen as the same thing: one means look at the
 * code again, the other means come back in a few minutes.
 */

import { ApiError, isApiError } from '../api/errors'
import { SignInError, type AuthTokens, type SignInClient } from './port'
import type { ApiClient } from '../api/client'

/** `TokenBundle` as the API returns it. */
interface TokenBundleBody {
  access_token: string
  refresh_token: string
  token_type?: string
  expires_in: number
  actor_id?: string
}

interface RequestOtpBody {
  sent?: boolean
  expires_in_seconds?: number
}

/**
 * Fallback life for a sign-in code.
 *
 * `expires_in_seconds` is documented as optional, so the countdown needs a
 * number when it is absent. Five minutes is the common shape of an emailed
 * code — and being wrong here is visible rather than dangerous: the countdown
 * reaches zero and offers a resend, which is what someone does anyway.
 */
const DEFAULT_CODE_LIFE_SECONDS = 300

export function otpSignInClient(api: ApiClient): SignInClient {
  return {
    async requestCode(email) {
      const data = await call<RequestOtpBody>(api, '/auth/request-otp', { email })
      return { expiresInSeconds: data?.expires_in_seconds ?? DEFAULT_CODE_LIFE_SECONDS }
    },

    async verifyCode(email, otp) {
      const data = await call<TokenBundleBody>(api, '/auth/verify-otp', { email, otp })
      return tokensFrom(data)
    },
  }
}

/** `POST /auth/refresh`. Not part of `SignInClient` — the provider owns it. */
export async function refreshTokens(api: ApiClient, refreshToken: string): Promise<AuthTokens> {
  const data = await api.request<TokenBundleBody>('/auth/refresh', {
    method: 'POST',
    body: { refresh_token: refreshToken },
    authenticated: false,
  })
  return tokensFrom(data)
}

/**
 * `expires_in` is a TTL and becomes an instant here, at the one moment the two
 * are equivalent. Keeping it relative would make it meaningless after a reload,
 * and `localStorage` means there will be reloads.
 */
export function tokensFrom(body: TokenBundleBody | undefined, now = Date.now()): AuthTokens {
  if (!body || typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string') {
    throw new SignInError({
      kind: 'unknown',
      message: 'Signed in, but the response did not contain a usable token.',
    })
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    // A missing or nonsensical `expires_in` becomes "already stale", so the
    // first call refreshes rather than sending a token of unknown age.
    expiresAt: now + Math.max(0, Number(body.expires_in) || 0) * 1000,
    actorId: typeof body.actor_id === 'string' ? body.actor_id : '',
  }
}

async function call<T>(api: ApiClient, path: string, body: unknown): Promise<T | undefined> {
  try {
    return await api.request<T>(path, { method: 'POST', body, authenticated: false })
  } catch (error) {
    throw signInFailure(error)
  }
}

function signInFailure(error: unknown): SignInError {
  if (!isApiError(error)) {
    return new SignInError({
      kind: 'unknown',
      message: 'Something went wrong signing you in. Please try again.',
    })
  }

  switch ((error as ApiError).kind) {
    case 'unauthorized':
      /*
       * A 401 from these routes is not a session ending — there is no session
       * yet. It is the code being wrong or expired, which is the one message
       * on this screen that has to be exact.
       */
      return new SignInError({
        kind: 'rejected',
        message: "That code wasn't right. Check it and try again.",
      })
    case 'validation':
      return new SignInError({
        kind: 'invalid',
        message: firstViolation(error as ApiError) ?? 'Please check the details and try again.',
      })
    case 'unavailable':
    case 'timeout':
    case 'upstream':
      return new SignInError({
        kind: 'unavailable',
        message: 'Sign-in is temporarily unavailable. Please try again in a few minutes.',
      })
    case 'transport':
      return new SignInError({
        kind: 'unavailable',
        message: 'Could not reach the sign-in service. Check your connection and try again.',
      })
    default:
      return new SignInError({
        kind: 'unknown',
        message: 'Something went wrong signing you in. Please try again.',
      })
  }
}

/**
 * One violation, not all of them.
 *
 * The API returns every offending field at once so a *publisher* can fix a
 * declaration in one round trip. A sign-in form has two fields and a person
 * reading it under mild stress; the first problem is the one to say.
 */
const firstViolation = (error: ApiError): string | null => error.violations[0]?.message ?? null
