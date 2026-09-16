/**
 * Boards over `/v1/dashboards`.
 *
 * The port is whole-state — `save(state)` hands over every board — because
 * against `localStorage` that was one write. Against HTTP it cannot be: there
 * is a `POST`, a `PATCH`, a `POST /publish` and a `DELETE`, and none of them
 * takes a list. So this store diffs against the last state it knows the server
 * holds and sends only what changed.
 *
 * Diffing rather than changing the port is deliberate. The alternative is
 * per-board methods and a rewrite of every caller in `useBoards`, to gain
 * precision the 400ms debounce already provides — it coalesces a drag gesture
 * or a run of keystrokes into one save either way.
 *
 * **Identity.** A new board is minted a local id so it can be rendered and
 * edited immediately. The API assigns the real one on `POST`, and the two are
 * reconciled through a map held for the session: the client keeps calling the
 * board by its local name and this store translates. A reload picks the boards
 * up under their server ids, and the map starts empty again.
 *
 * **What it will not do.** A failed request does not clear the local state or
 * advance the baseline, so the next save retries it. Silently dropping an edit
 * because one request failed is the failure mode worth engineering against —
 * a board that looks saved and is not.
 */

import {
  boardFrom,
  dashboardInputFrom,
  type WidgetIdResolver,
  grantInputFrom,
  grantKey,
  isLive,
  scopeInputFrom,
  type ApiDashboard,
} from './api-dashboard'
import { browserEditingPointer, type EditingPointer } from './editing-pointer'
import { isApiError } from '../api/errors'
import type { ApiClient } from '../api/client'
import { placedWidgets, type Board } from '../analytics/builder/boards'
import type { ShareGrant } from '../domain/dashboard'
import type { BoardStorePort } from '../analytics/builder/store'

/** A board the server has not seen yet carries one of these. */
const LOCAL_PREFIX = 'local:'

export interface HttpBoardStoreOptions {
  /** Surfaced so a UI can say a save did not land. Defaults to a console warning. */
  onSaveFailed?: (board: Board, error: unknown) => void
  /**
   * A board reached the server.
   *
   * The counterpart `onSaveFailed` never had. Without it a note saying a board
   * did not save has no way to learn that it since did, so it stands for the
   * rest of the session — describing a state that stopped being true.
   */
  onSaved?: (board: Board) => void
  /**
   * An Author removed a Share Grant and the API offers no way to honour it.
   *
   * `POST /v1/dashboards/{id}/share-grants` is the only Grant route: there is no
   * DELETE, and no listing either. So a Grant can be created and never revoked,
   * and an Author who unticks a name has changed our copy and nothing else —
   * that person still sees the board.
   *
   * This must not be silent. Every other gap in this store is a save that can be
   * retried; this one is someone believing they revoked access when they did
   * not, which is a disclosure rather than an inconvenience.
   */
  onGrantNotRevoked?: (board: Board, grant: ShareGrant) => void
  /**
   * Where the board you had open is remembered. Defaults to `localStorage`.
   *
   * Injected so a host that would rather not persist anything can say so, and
   * so the tests have something to look at.
   */
  editingPointer?: EditingPointer
}

export function httpBoardStore(
  api: ApiClient,
  {
    onSaveFailed = warnSaveFailed,
    onSaved = () => {},
    onGrantNotRevoked = warnGrantNotRevoked,
    editingPointer = browserEditingPointer(),
  }: HttpBoardStoreOptions = {},
): BoardStorePort {
  /** What we believe the server holds, by the id the client uses. */
  let baseline = new Map<string, Board>()
  /** Local id → the id the API assigned. */
  const assigned = new Map<string, string>()
  /**
   * The same translation for Widgets, per board.
   *
   * A Widget is minted a client id so it can be placed and edited immediately,
   * and that id used to travel to the API — which kept it, so `local:w-…`
   * ended up in their records, prefix and all. Now it is withheld on the first
   * save and the API issues one, which this remembers so later saves address
   * the Widget by the name the server knows it under.
   *
   * Per board because a Widget has no identity outside the Dashboard holding it
   * — the API embeds them by value, which is D23.
   */
  const assignedWidgets = new Map<string, Map<string, string>>()
  /** Local ids with a create in flight, so a second save does not duplicate. */
  const creating = new Set<string>()
  /**
   * Whether this store has ever been told what the server holds.
   *
   * Everything below diffs against `baseline`, so a store that has not loaded
   * believes the server is empty and creates every board it is handed. That is
   * not hypothetical: swap the store instance mid-session and the next save
   * duplicates the whole workspace, because a board still carrying a `local:`
   * id looks new to a `baseline` that was never filled in.
   *
   * Saving before loading is therefore a programming error rather than a state
   * to handle, and refusing is the only answer that cannot make it worse.
   */
  let loaded = false
  /**
   * Grants we have successfully sent, by board and target.
   *
   * Held here because it cannot be read back: `Dashboard` carries no
   * `share_grants` and there is no listing route, so the server's answer to
   * "who is this shared with" is unavailable. This map is the whole of our
   * knowledge, and it starts empty on every reload — which is why a re-POST
   * after a reload is expected rather than a bug. The API is explicit that it
   * is safe: "adding the same grant twice returns the existing one".
   */
  const sentGrants = new Map<string, Set<string>>()

  const remoteId = (localId: string) => assigned.get(localId) ?? localId

  /**
   * What to call a Widget on the wire.
   *
   * The id the API issued if it has issued one; the client's own if it was
   * never a local mint — a Widget that arrived from a load already carries the
   * server's name. `undefined` asks for one.
   */
  const widgetIdFor = (boardId: string): WidgetIdResolver => {
    const known = assignedWidgets.get(boardId)
    return (clientId) =>
      known?.get(clientId) ?? (clientId.startsWith(LOCAL_PREFIX) ? undefined : clientId)
  }

  /**
   * Record the ids the API issued, pairing by grid position.
   *
   * Position rather than array order: no two Widgets on a board occupy the same
   * cell — the grid guarantees it — so `x,y` identifies one unambiguously,
   * where order would depend on the server returning what it was sent in the
   * order it was sent.
   */
  function rememberWidgetIds(board: Board, returned: ApiDashboard | undefined): void {
    if (!returned?.widgets) return

    const atPosition = new Map(
      returned.widgets
        .filter((widget) => typeof widget.id === 'string' && widget.id !== '')
        .map((widget) => [`${String(widget.layout?.x)},${String(widget.layout?.y)}`, widget.id!]),
    )

    const known = assignedWidgets.get(board.id) ?? new Map<string, string>()
    for (const widget of placedWidgets(board)) {
      const issued = atPosition.get(`${String(widget.x)},${String(widget.y)}`)
      if (issued !== undefined && issued !== widget.id) known.set(widget.id, issued)
    }
    assignedWidgets.set(board.id, known)
  }

  return {
    async load(_seed, authorId) {
      /*
       * The seed is ignored, and that is the point of this line.
       *
       * `LocalBoardStore` falls back to demo boards when storage is empty,
       * which is right for a lab and wrong for an account: an empty list from
       * the API means this person has no dashboards, and writing three
       * fabricated ones into their workspace is not a friendlier version of
       * that — it is a lie that they then have to delete.
       */
      const body = await api.request<ApiDashboard[] | { dashboards?: ApiDashboard[] }>(
        '/v1/dashboards',
      )
      const boards = listOf(body).filter(isLive).map((entry) => boardFrom(entry, authorId))

      baseline = new Map(boards.map((board) => [board.id, board]))
      assigned.clear()
      loaded = true

      /*
       * Validated against what came back, not trusted.
       *
       * The pointer outlives the session that wrote it, so it can name a board
       * since deleted, one belonging to whoever used this browser last, or one
       * this viewer may no longer see. In every case it is absent from `boards`,
       * and returning it anyway would open the Create screen on a board that
       * does not exist.
       */
      const remembered = editingPointer.read()
      const editingId = remembered && boards.some((board) => board.id === remembered)
        ? remembered
        : null

      if (remembered !== null && editingId === null) editingPointer.write(null)

      return { boards, editingId }
    },

    async save(state) {
      if (!loaded) {
        /*
         * Refused, loudly, rather than treated as "the server is empty".
         *
         * The one way to reach this is a store swapped underneath its caller —
         * `useBoards` schedules its save from an effect keyed on the store, and
         * a fresh instance has an empty `baseline`. Creating everything again is
         * the expensive mistake; doing nothing costs one debounce, and the next
         * save after `load` resolves does the right thing.
         */
        console.warn('[analytics] save before load — ignoring, the server state is unknown')
        return
      }

      const next = new Map(state.boards.map((board) => [board.id, board]))

      // Deletions first: a board removed and another created in the same tick
      // should not race for a name, and DELETE is the cheapest to get out.
      for (const [id, board] of baseline) {
        if (next.has(id)) continue
        await attempt(board, async () => {
          await api.request(`/v1/dashboards/${encodeURIComponent(remoteId(id))}`, {
            method: 'DELETE',
          })
          baseline.delete(id)
          assigned.delete(id)
          assignedWidgets.delete(id)
          sentGrants.delete(id)
        })
      }

      for (const [id, board] of next) {
        const known = baseline.get(id)

        if (!known) {
          if (creating.has(id)) continue
          creating.add(id)
          await attempt(board, async () => {
            const created = await api.request<ApiDashboard>('/v1/dashboards', {
              method: 'POST',
              body: dashboardInputFrom(board, widgetIdFor(id)),
            })
            if (created?.id) assigned.set(id, created.id)
            rememberWidgetIds(board, created)
            baseline.set(id, board)
            if (board.status === 'published') await publish(board)
          })
          creating.delete(id)
          await reconcileGrants(board)
          continue
        }

        if (composesTheSame(known, board, widgetIdFor(id))) {
          // Nothing the API holds has changed. Publication is checked below
          // regardless, because status is not part of the composition.
        } else {
          await attempt(board, async () => {
            const updated = await api.request<ApiDashboard>(
              `/v1/dashboards/${encodeURIComponent(remoteId(id))}`,
              { method: 'PATCH', body: dashboardInputFrom(board, widgetIdFor(id)) },
            )
            rememberWidgetIds(board, updated)
            baseline.set(id, board)
          })
        }

        /*
         * Publication is its own endpoint and its own decision — FR-CO-04 makes
         * it an act an Author takes after reviewing, and the API agrees by
         * giving it a route rather than a field. So a board becoming published,
         * or a published board's scope moving, is a separate call and never a
         * side effect of an edit.
         */
        const scopeMoved =
          board.status === 'published' &&
          (known.status !== 'published' ||
            JSON.stringify(known.scope) !== JSON.stringify(board.scope))

        if (scopeMoved) {
          await attempt(board, async () => {
            await publish(board)
            baseline.set(id, board)
          })
        }

        await reconcileGrants(board)
      }

      /*
       * Written after the boards, and under the id the *server* knows.
       *
       * A board created during this save is known locally as `local:board-xyz`
       * until the POST answers; writing that name would leave a pointer that is
       * stale the moment the page reloads, which is the one moment it is read.
       */
      editingPointer.write(
        state.editingId === null ? null : remoteId(state.editingId),
      )
    },

    /**
     * Local, and marked as such.
     *
     * The API issues the real id on `POST`. A board needs *an* id the moment it
     * is created so it can be rendered and edited, and the prefix is what lets
     * `save` tell "never sent" from "sent, and this is what it came back as".
     */
    mintId(prefix) {
      return `${LOCAL_PREFIX}${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`
    },

    /**
     * Still the browser's clock, and still wrong in the same way.
     *
     * `updated_at` is the server's and arrives on the next load, so this is a
     * placeholder that is right to the day and replaced by the authority. Two
     * people editing from different machines can still disagree until then.
     */
    now() {
      return new Date().toISOString().slice(0, 10)
    },
  }

  /**
   * Send Grants that are new, and report the ones we cannot take back.
   *
   * Grants are a separate route from the board itself, like publication — but
   * unlike publication the route only goes one way. What this can do is create;
   * what it cannot do is revoke, and the difference is reported rather than
   * absorbed.
   *
   * A failure here does not advance `sentGrants`, so the next save retries it,
   * and it does not fail the board's save: the composition landed, and a Grant
   * refused for want of `dashboard.share` is a permissions answer rather than a
   * lost edit.
   */
  async function reconcileGrants(board: Board): Promise<void> {
    const sent = sentGrants.get(board.id) ?? new Set<string>()
    const wanted = new Map(board.shareGrants.map((grant) => [grantKey(grant), grant]))

    for (const [key, grant] of wanted) {
      if (sent.has(key)) continue
      try {
        await api.request(
          `/v1/dashboards/${encodeURIComponent(remoteId(board.id))}/share-grants`,
          { method: 'POST', body: grantInputFrom(grant) },
        )
        sent.add(key)
      } catch (error) {
        // A session ending is not a Grant problem and must keep rising.
        if (isApiError(error) && error.kind === 'session-expired') throw error
        onSaveFailed(board, error)
      }
    }

    for (const key of [...sent]) {
      if (wanted.has(key)) continue
      /*
       * The Author removed it and we have nowhere to send that. Forgetting the
       * key would make the next save re-POST a Grant they deliberately removed;
       * keeping it is the truth — the Grant is live upstream — so it stays, and
       * the caller is told.
       */
      const removed = lastKnownGrant(board.id, key)
      if (removed) onGrantNotRevoked(board, removed)
    }

    sentGrants.set(board.id, sent)
  }

  /** The Grant as it was before removal, for a message that can name someone. */
  function lastKnownGrant(boardId: string, key: string): ShareGrant | undefined {
    return baseline.get(boardId)?.shareGrants.find((grant) => grantKey(grant) === key)
  }

  async function publish(board: Board): Promise<void> {
    await api.request(`/v1/dashboards/${encodeURIComponent(remoteId(board.id))}/publish`, {
      method: 'POST',
      body: scopeInputFrom(board.scope),
    })
  }

  /**
   * One board's failure is not the save's failure.
   *
   * The baseline is only advanced by the operation that succeeded, so a board
   * whose request failed is still different from what the server holds and is
   * retried on the next save. A session ending keeps rising — that is not a
   * save problem and the banner above the board is the right place for it.
   */
  async function attempt(board: Board, operation: () => Promise<void>): Promise<void> {
    try {
      await operation()
      onSaved(board)
    } catch (error) {
      if (isApiError(error) && error.kind === 'session-expired') throw error
      onSaveFailed(board, error)
    }
  }
}

/**
 * Whether a board would produce the same `DashboardInput`.
 *
 * Compared on the payload rather than on the board, so fields the API never
 * sees — `updated`, which is stamped on every action — do not provoke a PATCH.
 * Without this, dragging one widget saves every board on the screen.
 */
function composesTheSame(a: Board, b: Board, widgetId: WidgetIdResolver): boolean {
  // Through the same resolver, or the first save after a Widget is issued an id
  // would look like a change to the composition when only its name on the wire
  // moved.
  return (
    JSON.stringify(dashboardInputFrom(a, widgetId)) ===
    JSON.stringify(dashboardInputFrom(b, widgetId))
  )
}

function listOf(body: ApiDashboard[] | { dashboards?: ApiDashboard[] } | undefined): ApiDashboard[] {
  if (Array.isArray(body)) return body
  if (body && Array.isArray(body.dashboards)) return body.dashboards
  return []
}

function warnSaveFailed(board: Board, error: unknown): void {
  console.warn(
    `[analytics] "${board.name}" did not save: ${error instanceof Error ? error.message : String(error)}`,
  )
}

function warnGrantNotRevoked(board: Board, grant: ShareGrant): void {
  console.warn(
    `[analytics] "${board.name}": ${grant.recipientLabel} still has access. ` +
      'The Analytics API has no route to revoke a Share Grant.',
  )
}
