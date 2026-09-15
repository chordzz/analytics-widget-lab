/**
 * What the application shows for each session state.
 *
 * The `expired` case is the one with a design decision in it. Ten Widgets do
 * not each announce that the session ended — that would be ten wrong answers to
 * one question — and the board is not torn down either. One banner sits above
 * it, the stale figures stay visible and labelled, and signing back in is one
 * click. That is why `expired` is a state distinct from `signed-out`.
 */

import { useCallback, useMemo, useState } from 'react'
import { AnalyticsModule } from '../analytics'
import { httpCatalogue } from '../catalogue/http-catalogue'
import { httpRetrieval } from '../retrieval/http-retrieval'
import { httpBoardStore } from '../dashboard/http-board-store'
import { useSession } from './AuthProvider'
import type { Actor } from './port'
import type { ApiClient } from '../api/client'
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
  const [unsaved, setUnsaved] = useState<string[]>([])
  const [unrevoked, setUnrevoked] = useState<{ board: string; who: string }[]>([])

  const noteSaveFailed = useCallback((board: { id: string; name: string }) => {
    /*
     * A board that looks saved and is not is the failure worth surfacing. The
     * store retries on the next change, so this is not an error dialog — it is
     * a standing note that something is behind, and it clears itself when the
     * retry lands.
     */
    setUnsaved((names) => (names.includes(board.name) ? names : [...names, board.name]))
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

  const adapters = useMemo(
    () => ({
      data: {
        catalogue: httpCatalogue(api),
        retrieval: httpRetrieval(api, { onRelay: reportRelay }),
        viewer: { id: actor.id, displayName: actor.fullName },
      },
      boardStore: httpBoardStore(api, {
        onSaveFailed: (board) => {
          noteSaveFailed(board)
        },
        onGrantNotRevoked: (board, grant) => {
          noteGrantNotRevoked(board, grant)
        },
      }),
    }),
    [api, actor.id, actor.fullName, noteSaveFailed, noteGrantNotRevoked],
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
            <UnsavedNote names={unsaved} onDismiss={() => setUnsaved([])} />
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

function UnsavedNote({ names, onDismiss }: { names: string[]; onDismiss: () => void }) {
  const what = names.length === 1 ? `"${names[0]}"` : `${String(names.length)} boards`
  return (
    <button type="button" className="a-unsaved" onClick={onDismiss} title="Dismiss">
      {what} did not save — retrying
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
