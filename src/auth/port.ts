/**
 * The token seam.
 *
 * Everything that needs a bearer token asks a `TokenProvider` for one. Two
 * implementations are foreseen and the interface exists so the second is cheap:
 *
 *   - `OtpTokenProvider` — signs in against `/auth/*` itself. The standalone app.
 *   - a host-supplied provider — the admin portal already holds a session and
 *     hands us a token. The embedded future the API's own text describes.
 *
 * Nothing under `src/analytics/` imports this. The module takes ports; the ports
 * are built with a provider; the module never learns what a token is.
 */

/** The IAM actor, as `GET /v1/me` returns it. */
export interface Actor {
  id: string
  email: string
  fullName: string
  username?: string
  profileImageUrl?: string
  /**
   * Not populated from the token upstream yet — their note, and the reason
   * department-scoped sharing currently fails closed.
   */
  departmentId?: string
  isHeadOfDepartment?: boolean
  permissions?: Record<string, boolean>
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  /**
   * Absolute epoch milliseconds, computed from `expires_in` the moment the
   * bundle arrives. Stored absolute rather than relative because a TTL measured
   * from "now" means nothing after a page reload, and this survives one.
   */
  expiresAt: number
  actorId: string
}

/** Refresh this long before `expiresAt` — long enough to cover a slow request. */
export const REFRESH_SKEW_MS = 60_000

export function isFresh(tokens: AuthTokens, now = Date.now()): boolean {
  return tokens.expiresAt - REFRESH_SKEW_MS > now
}

export interface TokenProvider {
  /** The token to send now; refreshes first if it is expired or within the skew. */
  ensure(): Promise<string>
  /**
   * Force a refresh — what the API client calls after a 401.
   *
   * Separate from `ensure` because the two answer different questions. `ensure`
   * reads the clock, which avoids most 401s and is wrong whenever the clock is:
   * a sleeping laptop, a revoked token. `renew` is the answer to evidence rather
   * than to arithmetic. Both share one in-flight refresh.
   */
  renew(): Promise<string>
  /** The session is over and no retry will save it. */
  onExpired(listener: () => void): () => void
}

/**
 * The two calls a sign-in screen makes.
 *
 * Split from `TokenProvider` because they are unauthenticated — they mint the
 * token everything else requires — and because a screen driven by a fake is a
 * screen whose copy can be reviewed before any of it is wired up.
 */
export interface SignInClient {
  /**
   * `POST /auth/request-otp`. Resolves identically whether or not the address is
   * registered; that is deliberate upstream and must survive into our copy.
   */
  requestCode(email: string): Promise<{ expiresInSeconds: number }>
  /** `POST /auth/verify-otp`. */
  verifyCode(email: string, otp: string): Promise<AuthTokens>
}

/**
 * Why a sign-in attempt failed, at the resolution the screen needs.
 *
 * `rejected` and `unavailable` are a 401 and a 503 and they must not read alike:
 * one means try again carefully, the other means try again later. Collapsing
 * them costs someone a minute of retyping a code that was right.
 */
export type SignInFailure =
  | { kind: 'rejected'; message: string }
  | { kind: 'invalid'; message: string }
  | { kind: 'unavailable'; message: string }
  | { kind: 'unknown'; message: string }

export class SignInError extends Error {
  readonly failure: SignInFailure

  constructor(failure: SignInFailure) {
    super(failure.message)
    this.name = 'SignInError'
    this.failure = failure
  }
}
