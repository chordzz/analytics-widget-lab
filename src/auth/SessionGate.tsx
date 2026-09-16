/**
 * What the application shows for each session state.
 *
 * The `expired` case is the one with a design decision in it. Ten Widgets do
 * not each announce that the session ended — that would be ten wrong answers to
 * one question — and the board is not torn down either. One banner sits above
 * it, the stale figures stay visible and labelled, and signing back in is one
 * click. That is why `expired` is a state distinct from `signed-out`.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AnalyticsModule } from '../analytics'
import { httpAuthorization } from '../access/http-authorization'
import { httpCatalogue } from '../catalogue/http-catalogue'
import { httpRetrieval } from '../retrieval/http-retrieval'
import { httpBoardStore } from '../dashboard/http-board-store'
import { checkTaxonomyDrift, describeDrift, inAgreement } from '../dashboard/taxonomy-drift'
import { useSession } from './AuthProvider'
import type { Actor } from './port'
import type { ApiClient } from '../api/client'
import { isApiError } from '../api/errors'
import type { Board } from '../analytics/builder/boards'
import type { ShareGrant } from '../domain/dashboard'
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

  if (state.status === 'unavailable') {
    /*
     * We hold a token and cannot find out whose it is — `/v1/me` answered `503`,
     * or never answered at all.
     *
     * Not a sign-in screen, because the token is probably fine and asking for a
     * fresh code would be asking someone to fix a problem that is not theirs.
     * Not the dashboard either: board ownership is decided by comparing the
     * actor id, so without one every board would look like somebody else's.
     */
    return <SessionUnavailable onRetry={() => window.location.reload()} />
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

  return (
    <>
      {state.status === 'expired' && (
        <SessionBanner actor={state.actor.fullName} onSignIn={() => setReauthenticating(true)} />
      )}
      <SignedIn actor={state.actor} api={api} generation={generation} onSignOut={signOut} />
    </>
  )
}

/**
 * Signed in, in principle, and unable to prove it.
 *
 * Says which service is degraded rather than "something went wrong", because
 * the two lead somewhere different: one is worth waiting out, the other is
 * worth reporting.
 */
function SessionUnavailable({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="a-auth">
      <div className="a-auth__card">
        <div className="a-auth__head">
          <h1 className="a-auth__title">Signing you in is taking longer than usual</h1>
          <p className="a-auth__lede">
            We could not reach the identity service to confirm who you are. You are still
            signed in — this usually clears on its own.
          </p>
        </div>
        <button type="button" className="a-button a-button--primary a-auth__submit" onClick={onRetry}>
          Try again
        </button>
      </div>
    </main>
  )
}

/**
 * The module, with real adapters.
 *
 * Split out so the adapters can be memoised on `api`. Built inline they would
 * be new objects every render, and both providers below key their load effects
 * on the identity of what they were handed — so a fresh adapter is a fresh
 * load, which sets state, which renders again. The symptom is not a slow app
 * but a request loop against the API.
 */
function SignedIn({
  actor,
  api,
  generation,
  onSignOut,
}: {
  actor: Actor
  api: ApiClient
  generation: number
  onSignOut: () => void
}) {
  /**
   * Boards that did not save, and whether waiting will help.
   *
   * `retries` is the distinction the old note flattened. A `503` or a dropped
   * connection is worth saying "we will try again" about; a `400` will fail
   * identically for ever, because the payload is what the API refused. Telling
   * someone to wait for a retry that cannot succeed is worse than telling them
   * nothing.
   */
  const [unsaved, setUnsaved] = useState<{ name: string; retries: boolean; why: string }[]>([])
  const [unrevoked, setUnrevoked] = useState<{ board: string; who: string }[]>([])

  const noteSaveFailed = useCallback((board: { id: string; name: string }, error: unknown) => {
    /*
     * A board that looks saved and is not is the failure worth surfacing, so
     * this is a standing note rather than a dialog.
     *
     * What it may not do is claim to be retrying. Nothing is scheduled: the
     * store tries again on the *next save*, and a save only happens when the
     * board changes. Stop touching it and nothing ever runs again.
     */
    const kind = isApiError(error) ? error.kind : 'transport'
    const retries = kind !== 'validation' && kind !== 'denied' && kind !== 'not-found'
    const why = error instanceof Error ? error.message : 'The API refused it.'

    setUnsaved((entries) =>
      entries.some((entry) => entry.name === board.name)
        ? entries
        : [...entries, { name: board.name, retries, why }],
    )
  }, [])

  /** The board reached the server after all. */
  const noteSaved = useCallback((board: { name: string }) => {
    setUnsaved((entries) => entries.filter((entry) => entry.name !== board.name))
  }, [])

  /*
   * Not a dismissible note like an unsaved board, because it does not resolve
   * itself. A failed save retries; this one cannot — the API has no route to
   * revoke a Share Grant — so the Author is told plainly that the person still
   * has access, and it stays until they acknowledge it.
   */
  const noteGrantNotRevoked = useCallback((board: Board, grant: ShareGrant) => {
    setUnrevoked((entries) =>
      entries.some((entry) => entry.board === board.name && entry.who === grant.recipientLabel)
        ? entries
        : [...entries, { board: board.name, who: grant.recipientLabel }],
    )
  }, [])

  /*
   * Ask the API whether our taxonomy is still its taxonomy.
   *
   * Once per session, after sign-in, and it never blocks anything. The reason it
   * exists is a failure worth not repeating: we once guarded a Visualization
   * Type translation with a test that compared against a hardcoded copy of the
   * backend's list, so when their list changed the test kept passing and the
   * translation silently started sending strings the API rejects.
   *
   * A log line is the right weight. A disagreement is a fact about two
   * deployments rather than a reason to refuse to render, and every consequence
   * it predicts — a 400 on save, a card that cannot draw — is one somebody will
   * otherwise meet without explanation.
   */
  useEffect(() => {
    let cancelled = false
    void checkTaxonomyDrift(api).then((drift) => {
      if (cancelled || !drift || inAgreement(drift)) return
      for (const line of describeDrift(drift)) {
        console.warn(`[analytics-taxonomy] ${line}`)
      }
    })
    return () => {
      cancelled = true
    }
  }, [api])

  const adapters = useMemo(
    () => ({
      data: {
        catalogue: httpCatalogue(api),
        retrieval: httpRetrieval(api, { onRelay: reportRelay }),
        /*
         * Passed explicitly, because the default is wrong here. Omitting it
         * falls back to `LocalAuthorization` — the fixtures' implementation,
         * which answers from a hardcoded array of three people. Against a real
         * account that decided a department board by looking a real actor up in
         * a demo, and always said no.
         */
        authorization: httpAuthorization(),
        viewer: { id: actor.id, displayName: actor.fullName },
        /*
         * What the UI may offer, straight from `/v1/me`. Absent — IAM's lookup
         * failed, or local-auth mode — means unknown, and unknown offers
         * everything; the API still enforces.
         */
        permissions: actor.permissions,
      },
      boardStore: httpBoardStore(api, {
        onSaveFailed: (board, error) => {
          noteSaveFailed(board, error)
        },
        onSaved: (board) => {
          noteSaved(board)
        },
        onGrantNotRevoked: (board, grant) => {
          noteGrantNotRevoked(board, grant)
        },
      }),
    }),
    [
      api,
      actor.id,
      actor.fullName,
      actor.permissions,
      noteSaveFailed,
      noteSaved,
      noteGrantNotRevoked,
    ],
  )

  return (
    <AnalyticsModule
      /*
       * Keyed on the session so a re-authenticated board refetches. Blunt — it
       * remounts rather than re-queries — but boards live on the server now,
       * and the alternative is a screen of widgets holding data from a session
       * that has ended.
       */
      key={generation}
      data={adapters.data}
      boardStore={adapters.boardStore}
      headerActions={
        <>
          {unsaved.length > 0 && (
            <UnsavedNote entries={unsaved} onDismiss={() => setUnsaved([])} />
          )}
          {unrevoked.length > 0 && (
            <UnrevokedNote entries={unrevoked} onDismiss={() => setUnrevoked([])} />
          )}
          <SignOut name={actor.fullName} onSignOut={onSignOut} />
        </>
      }
    />
  )
}

/**
 * Someone still has access to a board the Author thinks they removed.
 *
 * Worded as what is true rather than as what failed. "Could not revoke" reads
 * like a transient error worth retrying; the Author needs to know the state of
 * the world, which is that this person can still open the board.
 */
export function UnrevokedNote({
  entries,
  onDismiss,
}: {
  entries: { board: string; who: string }[]
  onDismiss: () => void
}) {
  const first = entries[0]
  const more = entries.length - 1

  return (
    <button
      type="button"
      className="a-unsaved a-unsaved--warning"
      onClick={onDismiss}
      title="Revoking a share is not yet supported by the Analytics API. Dismiss"
    >
      {first.who} still sees &ldquo;{first.board}&rdquo;
      {more > 0 && ` and ${String(more)} more`}
    </button>
  )
}

/**
 * A board that did not save, said as what is actually true.
 *
 * Two wordings, because two situations. A transient failure will be tried again
 * — but on the next edit, not on a timer, so "retrying" overstated even that.
 * A rejected payload will not: it fails identically every time until the widget
 * or the board changes, and an Author waiting for a retry is waiting for
 * nothing.
 */
export function UnsavedNote({
  entries,
  onDismiss,
}: {
  entries: { name: string; retries: boolean; why: string }[]
  onDismiss: () => void
}) {
  const first = entries[0]
  const more = entries.length - 1
  const what = entries.length === 1 ? `"${first.name}"` : `${String(entries.length)} boards`

  return (
    <button
      type="button"
      className="a-unsaved"
      onClick={onDismiss}
      title={entries.every((entry) => entry.retries) ? 'Dismiss' : first.why}
    >
      {first.retries
        ? `${what} did not save — will retry`
        : `${what} was rejected — editing it will try again`}
      {more > 0 && entries.length > 1 && ''}
    </button>
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
