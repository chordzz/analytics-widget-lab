/**
 * Sign in — email, then the code that arrives by email.
 *
 * One factor, because that is what the API implements: *"No password, no second
 * factor, no device approval — this is the temporary Analytics sign-in path."*
 * So nothing here handles a password, and nothing here should grow one.
 *
 * Four things below are properties of the API rather than preferences, and each
 * is marked where it appears:
 *
 *   1. We never say an address is unknown. `/auth/request-otp` answers
 *      identically whether or not it is registered, so that an account cannot be
 *      probed — and copy that says "no account found" hands back exactly the
 *      answer the endpoint withheld.
 *   2. A rejected code and an unavailable service must not read alike. They are
 *      a 401 and a 503; one means look again, the other means come back later.
 *      Collapsing them costs someone a minute retyping a code that was right.
 *   3. The email is the only state between the two steps. There is no challenge
 *      token, so a wrong code just means asking again with the same address.
 *   4. `expires_in_seconds` is given to us, so the code's life is shown. A
 *      countdown is the difference between "try again" and retyping a dead code.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnalyticsProvider } from '../analytics/theme/AnalyticsProvider'
import { Icon } from '../analytics/shell/Icon'
import { SignInError, type AuthTokens, type SignInClient, type SignInFailure } from './port'
import type { AnalyticsTheme } from '../analytics/theme/tokens'
import './auth.css'

/**
 * How long before "Resend code" becomes available again.
 *
 * A guess, and flagged as one. The API documents no resend cooldown, no attempt
 * cap and no lockout (question 3 to the backend team). Thirty seconds is
 * conservative — it stops us hammering their mail path without being long enough
 * to strand someone whose first code never arrived. Replace it with their number
 * when we have it.
 */
const RESEND_COOLDOWN_SECONDS = 30

export interface CodeStepState {
  name: 'code'
  email: string
  expiresInSeconds: number
  /** When the code was requested; the countdown is derived from it. */
  sentAt: number
}

type Step = { name: 'email' } | CodeStepState

export interface SignInScreenProps {
  client: SignInClient
  onSignedIn: (tokens: AuthTokens) => void
  /** Shown above the form — e.g. "Your session ended." */
  notice?: string
  /**
   * Same override a host passes `AnalyticsModule`. The screen carries its own
   * provider because it is what a viewer sees *before* the module mounts, and
   * it would otherwise be the one unthemed page in the product.
   */
  theme?: Partial<AnalyticsTheme>
}

export function SignInScreen({ client, onSignedIn, notice, theme }: SignInScreenProps) {
  const [step, setStep] = useState<Step>({ name: 'email' })
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<SignInFailure | null>(null)

  const requestCode = useCallback(
    async (address: string) => {
      setBusy(true)
      setFailure(null)
      try {
        const { expiresInSeconds } = await client.requestCode(address)
        setCode('')
        setStep({ name: 'code', email: address, expiresInSeconds, sentAt: Date.now() })
      } catch (error) {
        setFailure(failureOf(error))
      } finally {
        setBusy(false)
      }
    },
    [client],
  )

  const submitCode = useCallback(
    async (address: string, otp: string) => {
      setBusy(true)
      setFailure(null)
      try {
        onSignedIn(await client.verifyCode(address, otp))
      } catch (error) {
        setFailure(failureOf(error))
        // The code is cleared so the field does not sit there holding a value we
        // have just been told is wrong — retyping over a stale one is how people
        // submit the same wrong code twice.
        setCode('')
      } finally {
        setBusy(false)
      }
    },
    [client, onSignedIn],
  )

  return (
    <AnalyticsProvider theme={theme}>
      <main className="a-auth">
        <div className="a-auth__card">
          <div className="a-auth__brand">
            <span className="a-auth__mark" aria-hidden="true">
              <Icon name="widgets" size={18} />
            </span>
            <span className="a-auth__wordmark">Analytics</span>
          </div>

          {notice && (
            <p className="a-auth__notice" role="status">
              {notice}
            </p>
          )}

          {step.name === 'email' ? (
            <SignInEmailStep
              email={email}
              onEmailChange={setEmail}
              busy={busy}
              failure={failure}
              onSubmit={() => void requestCode(email.trim())}
            />
          ) : (
            <SignInCodeStep
              step={step}
              code={code}
              onCodeChange={setCode}
              busy={busy}
              failure={failure}
              onSubmit={() => void submitCode(step.email, code.trim())}
              onResend={() => void requestCode(step.email)}
              onUseAnother={() => {
                setStep({ name: 'email' })
                setFailure(null)
                setCode('')
              }}
            />
          )}
        </div>
      </main>
    </AnalyticsProvider>
  )
}

/**
 * The two panes are exported because they are the two screens, and the tests
 * render them directly — `SignInScreen` holds which one is showing in state, so
 * a static render can only ever reach the first.
 */
export function SignInEmailStep({
  email,
  onEmailChange,
  busy,
  failure,
  onSubmit,
}: {
  email: string
  onEmailChange: (value: string) => void
  busy: boolean
  failure: SignInFailure | null
  onSubmit: () => void
}) {
  return (
    <form
      className="a-auth__form"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="a-auth__head">
        <h1 className="a-auth__title">Sign in</h1>
        <p className="a-auth__lede">We&rsquo;ll email you a one-time code.</p>
      </div>

      <Failure failure={failure} />

      <label className="a-auth__field">
        <span className="a-auth__label">Email address</span>
        <input
          className="a-auth__input"
          type="email"
          name="email"
          value={email}
          onChange={(event) => onEmailChange(event.target.value)}
          autoComplete="email"
          autoFocus
          required
          disabled={busy}
          placeholder="you@smcdao.com"
        />
      </label>

      <button className="a-button a-button--primary a-auth__submit" type="submit" disabled={busy || email.trim() === ''}>
        {busy ? 'Sending…' : 'Send code'}
      </button>
    </form>
  )
}

export function SignInCodeStep({
  step,
  code,
  onCodeChange,
  busy,
  failure,
  onSubmit,
  onResend,
  onUseAnother,
}: {
  step: CodeStepState
  code: string
  onCodeChange: (value: string) => void
  busy: boolean
  failure: SignInFailure | null
  onSubmit: () => void
  onResend: () => void
  onUseAnother: () => void
}) {
  const remaining = useCountdown(step.sentAt, step.expiresInSeconds)
  const sinceSent = useCountdown(step.sentAt, RESEND_COOLDOWN_SECONDS)
  const expired = remaining <= 0

  return (
    <form
      className="a-auth__form"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="a-auth__head">
        <h1 className="a-auth__title">Enter your code</h1>
        {/*
          Property 1. "If ... is registered" is the whole point: the endpoint
          answers the same either way so that nobody can use this form to find
          out whether an address has an account, and confirming delivery here
          would give that back.
        */}
        <p className="a-auth__lede">
          If <strong className="a-auth__email">{step.email}</strong> is registered, a code is on its
          way.
        </p>
      </div>

      <Failure failure={failure} />

      <label className="a-auth__field">
        <span className="a-auth__label">Sign-in code</span>
        <input
          className="a-auth__input a-auth__input--code"
          type="text"
          name="otp"
          value={code}
          onChange={(event) => onCodeChange(event.target.value)}
          /* Lets a phone or a Mac offer the code straight from the email. */
          autoComplete="one-time-code"
          inputMode="numeric"
          autoFocus
          required
          disabled={busy}
          aria-describedby="a-auth-expiry"
          /*
            Deliberately not a six-box input. The API does not document the
            code's length or alphabet (question 4), and a fixed-width control
            built on a guess is worse than a plain field: it silently truncates
            a longer code and cannot accept a letter at all.
          */
        />
      </label>

      <p className="a-auth__expiry" id="a-auth-expiry" aria-live="polite">
        {expired ? 'That code has expired — request a new one.' : `Expires in ${clock(remaining)}.`}
      </p>

      <button
        className="a-button a-button--primary a-auth__submit"
        type="submit"
        disabled={busy || expired || code.trim() === ''}
      >
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <div className="a-auth__alternatives">
        <button
          type="button"
          className="a-auth__link"
          onClick={onResend}
          disabled={busy || sinceSent > 0}
        >
          {sinceSent > 0 ? `Resend code in ${sinceSent}s` : 'Resend code'}
        </button>
        <span aria-hidden="true" className="a-auth__dot">
          ·
        </span>
        <button type="button" className="a-auth__link" onClick={onUseAnother} disabled={busy}>
          Use a different email
        </button>
      </div>
    </form>
  )
}

/**
 * Property 2, in one place. `rejected` and `unavailable` get different words and
 * different tones because they are different situations — and the second is not
 * the user's fault, so it must not be phrased as though it were.
 */
function Failure({ failure }: { failure: SignInFailure | null }) {
  if (!failure) return null
  return (
    <p className="a-auth__error" role="alert">
      {failure.message}
    </p>
  )
}

function failureOf(error: unknown): SignInFailure {
  if (error instanceof SignInError) return error.failure
  return {
    kind: 'unknown',
    message: 'Something went wrong signing you in. Please try again.',
  }
}

/**
 * Seconds left of a window that began at `startedAt`.
 *
 * Derived from the start instant rather than decremented from a counter, so a
 * backgrounded tab — where timers are throttled and may not fire for minutes —
 * shows the truth on its next tick instead of a countdown that fell behind.
 */
function useCountdown(startedAt: number, seconds: number): number {
  const compute = useCallback(
    () => Math.max(0, Math.ceil((startedAt + seconds * 1000 - Date.now()) / 1000)),
    [startedAt, seconds],
  )

  const [left, setLeft] = useState(compute)
  const computeRef = useRef(compute)
  computeRef.current = compute

  useEffect(() => {
    setLeft(computeRef.current())
    const timer = setInterval(() => setLeft(computeRef.current()), 1000)
    return () => clearInterval(timer)
  }, [startedAt, seconds])

  return left
}

function clock(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
