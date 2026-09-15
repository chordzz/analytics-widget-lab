/**
 * What went wrong, at the resolution a caller can act on.
 *
 * A tagged union rather than a class hierarchy, matching `RetrievalOutcome` and
 * `WidgetRenderState`: the callers switch on the kind, and `instanceof` across
 * module boundaries is one bundler configuration away from quietly failing.
 *
 * The kinds exist because the API is emphatic that these are different
 * situations. `denied` and `withdrawn` are per-Widget and leave the board
 * standing; `session-expired` is not about a Widget at all. Collapsing any pair
 * of them loses the distinction the six render states exist to preserve.
 */

export type ApiErrorKind =
  /** 401 twice on an authenticated route — a refresh did not save it. Rises past the Widget layer. */
  | 'session-expired'
  /**
   * 401 on a route that carries no session to refresh — the three `/auth`
   * endpoints. There is nothing to renew here: the credential presented was
   * simply refused, which on `/auth/verify-otp` means the code was wrong.
   */
  | 'unauthorized'
  /** 403 — the viewer lacks the Dataset's permission key. One Widget, not the board. */
  | 'denied'
  /** 410 — the publisher withdrew the Dataset. */
  | 'withdrawn'
  | 'not-found'
  /** 400 — `data.violations` names every offending field at once. */
  | 'validation'
  /** 503 — the Source System or the authorization service is unreachable. */
  | 'unavailable'
  /** 500 — the Source System 404'd its own registered path. Their misconfiguration. */
  | 'upstream'
  /** 504 — past the 10s forward timeout. */
  | 'timeout'
  /** `fetch` itself failed: offline, DNS, CORS. No answer at all, not a bad one. */
  | 'transport'
  /** A 2xx whose body is not the envelope every response is documented to be. */
  | 'malformed'
  | 'unknown'

/** `data.violations[]` on a 400. */
export interface Violation {
  field: string
  message: string
}

export interface ApiErrorDetail {
  kind: ApiErrorKind
  message: string
  status?: number | null
  violations?: Violation[]
  /**
   * `x-request-id` from the response.
   *
   * Kept on the error because it is the one thing that lets a backend engineer
   * find this exact failure in their logs, and the moment it is worth having is
   * the moment something has gone wrong.
   */
  requestId?: string | null
}

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null
  readonly violations: Violation[]
  readonly requestId: string | null

  constructor(detail: ApiErrorDetail) {
    super(detail.message)
    this.name = 'ApiError'
    this.kind = detail.kind
    this.status = detail.status ?? null
    this.violations = detail.violations ?? []
    this.requestId = detail.requestId ?? null
  }
}

export const isApiError = (error: unknown): error is ApiError =>
  error instanceof Error && error.name === 'ApiError' && 'kind' in error

/** True for the one kind that is about the session rather than about a Widget. */
export const isSessionExpired = (error: unknown): boolean =>
  isApiError(error) && error.kind === 'session-expired'

/**
 * HTTP status to kind.
 *
 * Straight from the API's own documentation of the query endpoint, which is the
 * most fully specified route and the only data-bearing one.
 *
 * 401 reaches here only on an unauthenticated route. On an authenticated one the
 * client intercepts it first, because a first 401 is an instruction to refresh
 * rather than a failure — and it raises `session-expired` itself if the retry is
 * refused too.
 */
export function kindForStatus(status: number): ApiErrorKind {
  switch (status) {
    case 400:
      return 'validation'
    case 401:
      return 'unauthorized'
    case 403:
      return 'denied'
    case 404:
      return 'not-found'
    case 410:
      return 'withdrawn'
    case 500:
      return 'upstream'
    case 503:
      return 'unavailable'
    case 504:
      return 'timeout'
    default:
      return 'unknown'
  }
}
