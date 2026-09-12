/**
 * What the application shows for each session state.
 *
 * The `expired` case is the one with a design decision in it. Ten Widgets do
 * not each announce that the session ended — that would be ten wrong answers to
 * one question — and the board is not torn down either. One banner sits above
 * it, the stale figures stay visible and labelled, and signing back in is one
 * click. That is why `expired` is a state distinct from `signed-out`.
 */

import { useState } from 'react'
import { AnalyticsModule } from '../analytics'
import { httpCatalogue } from '../catalogue/http-catalogue'
import { httpRetrieval } from '../retrieval/http-retrieval'
import { useSession } from './AuthProvider'
import { SignInScreen } from './SignInScreen'
import './auth.css'

export function SessionGate() {
  const { state, signIn, adopt, signOut, api, generation } = useSession()
  const [reauthenticating, setReauthenticating] = useState(false)

  if (state.status === 'unknown') {
    // A stored token is being checked against `/v1/me`. Deliberately quiet:
    // flashing a sign-in form at someone who is signed in is worse than a beat
    // of nothing.
    return <div className="a-auth a-auth--booting" aria-busy="true" />
  }

  if (state.status === 'signed-out' || reauthenticating) {
    return (
      <SignInScreen
        client={signIn}
        notice={reauthenticating ? 'Your session ended. Sign in to carry on.' : undefined}
        onSignedIn={async (tokens) => {
          await adopt(tokens)
          setReauthenticating(false)
        }}
      />
    )
  }

  const viewer = { id: state.actor.id, displayName: state.actor.fullName }

  return (
    <>
      {state.status === 'expired' && (
        <SessionBanner actor={state.actor.fullName} onSignIn={() => setReauthenticating(true)} />
      )}
      <AnalyticsModule
        /*
         * Keyed on the session so a re-authenticated board refetches. Blunt —
         * it remounts rather than re-queries — but boards are persisted, and
         * the alternative is a screen of widgets holding data from a session
         * that has ended.
         */
        key={generation}
        data={{
          catalogue: httpCatalogue(api),
          retrieval: httpRetrieval(api, { onRelay: reportRelay }),
          viewer,
        }}
        headerActions={<SignOut name={state.actor.fullName} onSignOut={signOut} />}
      />
    </>
  )
}

function SessionBanner({ actor, onSignIn }: { actor: string; onSignIn: () => void }) {
  return (
    <div className="a-session-banner" role="alert">
      <span>
        Your session ended, {actor}. The figures below are from before it did.
      </span>
      <button type="button" className="a-button a-button--primary" onClick={onSignIn}>
        Sign in again
      </button>
    </div>
  )
}

function SignOut({ name, onSignOut }: { name: string; onSignOut: () => void }) {
  return (
    <span className="a-session-who">
      <span className="a-muted">{name}</span>
      <button type="button" className="a-button" onClick={onSignOut}>
        Sign out
      </button>
    </span>
  )
}

/**
 * The one place the open question gets answered from a real response.
 *
 * `shape` says which of the two documented readings of the query envelope the
 * API actually sends, and `partial` is the marker that would otherwise vanish
 * silently if we read it at the wrong depth. Both go to the console rather than
 * nowhere, so the first real board settles it.
 */
function reportRelay(report: {
  datasetId: string
  shape: string
  partial: boolean
  reason: string | null
}): void {
  if (report.partial) {
    console.warn(
      `[analytics] ${report.datasetId} returned a partial result: ${report.reason ?? 'no reason given'}`,
    )
  }
  if (!seenShapes.has(report.shape)) {
    seenShapes.add(report.shape)
    console.info(`[analytics] query responses arrive in the "${report.shape}" envelope shape.`)
  }
}

const seenShapes = new Set<string>()
