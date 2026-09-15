/**
 * The session, as a state machine.
 *
 * Four states, and the distinction that earns the fourth is `expired` against
 * `signed-out`. Signed out means nobody is here: show a sign-in screen and
 * nothing else. Expired means *we know who this was and their board is still on
 * the screen behind us* — which is a banner over a dashboard, not a page
 * replacing one. Collapsing the two throws away the work someone had open.
 *
 * `code-sent` is not here. It belongs to the sign-in screen: a code in flight
 * is a step through a form, not a state of the application, and hoisting it
 * would let a stray re-render lose someone's half-finished sign-in.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createApiClient, type ApiClient } from '../api/client'
import { isApiError } from '../api/errors'
import { analyticsApiBaseUrl } from '../api/config'
import { browserTokenStore, type TokenStore } from './token-store'
import { sessionTokenProvider, type SessionTokenProvider } from './otp-provider'
import { otpSignInClient } from './otp-client'
import { fetchActor } from './me'
import type { Actor, AuthTokens, SignInClient } from './port'

/**
 * A failure that says nothing about the token.
 *
 * Deliberately narrow: anything not known to be transient is treated as the
 * session ending, because the cost of being wrong that way is one sign-in, and
 * the cost of being wrong the other way is a session that looks alive and can do
 * nothing.
 */
const isRetryable = (error: unknown): boolean =>
  isApiError(error) && (error.kind === 'unavailable' || error.kind === 'transport')

export type SessionState =
  /** Booting. Stored tokens exist or do not, and we have not asked yet. */
  | { status: 'unknown' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; actor: Actor }
  /** Had a session; a refresh could not save it. The board is still behind this. */
  | { status: 'expired'; actor: Actor }
  /**
   * We hold a token and cannot find out whose it is.
   *
   * `/v1/me` answered `503` — IAM could not be reached to resolve the profile —
   * or the request never left. The API is explicit that this is retryable and
   * the token is not necessarily bad, so signing out would throw away a good
   * session over a service the Viewer does not use.
   *
   * It is its own state rather than an optimistic `signed-in` because the actor
   * id is load-bearing: board ownership is decided by comparing it, so carrying
   * on without one would make every board look like somebody else's.
   */
  | { status: 'unavailable' }

export interface SessionValue {
  state: SessionState
  /** For the sign-in screen. */
  signIn: SignInClient
  /** After `/auth/verify-otp` succeeds. */
  adopt: (tokens: AuthTokens) => Promise<void>
  signOut: () => void
  /** The authenticated client the adapters are built on. */
  api: ApiClient
  /**
   * Increments on every new session.
   *
   * The module keys off it so a re-authenticated board refetches. Blunt — it
   * remounts rather than re-queries — but boards are persisted, and the
   * alternative is a screen full of widgets holding data from a session that
   * has ended.
   */
  generation: number
}

const SessionContext = createContext<SessionValue | null>(null)

export interface AuthProviderProps {
  children: ReactNode
  /** Overridden in tests; defaults to the configured deployment. */
  baseUrl?: string
  store?: TokenStore
  fetch?: typeof globalThis.fetch
}

export function AuthProvider({ children, baseUrl, store, fetch: fetchImpl }: AuthProviderProps) {
  const [state, setState] = useState<SessionState>({ status: 'unknown' })
  const [generation, setGeneration] = useState(0)

  /*
   * Built once. The provider holds the live tokens, so rebuilding it on a
   * re-render would drop the session — and rebuilding the client would orphan
   * any refresh already in flight.
   */
  const [{ api, tokens, signIn }] = useState(() => {
    const held: { provider: SessionTokenProvider | null } = { provider: null }
    const client = createApiClient({
      baseUrl: baseUrl ?? analyticsApiBaseUrl(),
      fetch: fetchImpl,
      // Read through a box: the client needs the provider and the provider
      // needs the client, and one of the two has to be late.
      tokens: {
        ensure: () => held.provider!.ensure(),
        renew: () => held.provider!.renew(),
        onExpired: (listener) => held.provider!.onExpired(listener),
      },
    })
    held.provider = sessionTokenProvider(client, store ?? browserTokenStore())
    return { api: client, tokens: held.provider, signIn: otpSignInClient(client) }
  })

  /**
   * Held in a ref so the expiry listener can name who it was without the
   * listener itself depending on `state` — a listener rebuilt on every state
   * change would unsubscribe and resubscribe on every render.
   */
  const actorRef = useRef<Actor | null>(null)

  useEffect(() => {
    return tokens.onExpired(() => {
      setState(
        actorRef.current
          ? { status: 'expired', actor: actorRef.current }
          : { status: 'signed-out' },
      )
    })
  }, [tokens])

  // Boot. A stored token is not a session until the API agrees it is one:
  // verification is local and cannot observe revocation.
  useEffect(() => {
    let cancelled = false

    void (async () => {
      if (!tokens.tokens()) {
        if (!cancelled) setState({ status: 'signed-out' })
        return
      }
      try {
        const actor = await fetchActor(api)
        if (cancelled) return
        actorRef.current = actor
        setState({ status: 'signed-in', actor })
        setGeneration((value) => value + 1)
      } catch (error) {
        if (cancelled) return

        /*
         * Not every failure here means the token is dead.
         *
         * `/v1/me` answers `503` when IAM cannot be reached to resolve the
         * profile, and the API says plainly that this is retryable — the token
         * is not necessarily bad. Discarding it would sign someone out of a
         * perfectly good session because a service they do not use was
         * momentarily down, and getting back in means waiting for an email.
         *
         * The same applies to `transport`: we never reached the API, so we
         * learned nothing about the token.
         *
         * Everything else — a `401`, a session the provider gave up on — is a
         * dead session, and the tokens go with it.
         */
        if (isRetryable(error)) {
          setState({ status: 'unavailable' })
          return
        }

        tokens.discard()
        setState({ status: 'signed-out' })
      }
    })()

    return () => {
      cancelled = true
    }
  }, [api, tokens])

  const adopt = useCallback(
    async (bundle: AuthTokens) => {
      tokens.adopt(bundle)
      const actor = await fetchActor(api)
      actorRef.current = actor
      setState({ status: 'signed-in', actor })
      setGeneration((value) => value + 1)
    },
    [api, tokens],
  )

  const signOut = useCallback(() => {
    /*
     * Local only. The API publishes no revocation endpoint, so the tokens stay
     * valid at IAM until they expire — which means "sign out" on a shared
     * machine is weaker than it looks, and that is worth knowing rather than
     * assuming. Raised with the backend team as question 9.
     */
    tokens.discard()
    actorRef.current = null
    setState({ status: 'signed-out' })
  }, [tokens])

  const value = useMemo<SessionValue>(
    () => ({ state, signIn, adopt, signOut, api, generation }),
    [state, signIn, adopt, signOut, api, generation],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession must be used inside <AuthProvider>')
  return value
}
