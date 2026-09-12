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
  isLive,
  scopeInputFrom,
  type ApiDashboard,
} from './api-dashboard'
import { isApiError } from '../api/errors'
import type { ApiClient } from '../api/client'
import type { Board } from '../analytics/builder/boards'
import type { BoardStorePort } from '../analytics/builder/store'

/** A board the server has not seen yet carries one of these. */
const LOCAL_PREFIX = 'local:'

export interface HttpBoardStoreOptions {
  /** Surfaced so a UI can say a save did not land. Defaults to a console warning. */
  onSaveFailed?: (board: Board, error: unknown) => void
}

export function httpBoardStore(
  api: ApiClient,
  { onSaveFailed = warnSaveFailed }: HttpBoardStoreOptions = {},
): BoardStorePort {
  /** What we believe the server holds, by the id the client uses. */
  let baseline = new Map<string, Board>()
  /** Local id → the id the API assigned. */
  const assigned = new Map<string, string>()
  /** Local ids with a create in flight, so a second save does not duplicate. */
  const creating = new Set<string>()

  const remoteId = (localId: string) => assigned.get(localId) ?? localId

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
      return { boards, editingId: null }
    },

    async save(state) {
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
              body: dashboardInputFrom(board),
            })
            if (created?.id) assigned.set(id, created.id)
            baseline.set(id, board)
            if (board.status === 'published') await publish(board)
          })
          creating.delete(id)
          continue
        }

        if (composesTheSame(known, board)) {
          // Nothing the API holds has changed. Publication is checked below
          // regardless, because status is not part of the composition.
        } else {
          await attempt(board, async () => {
            await api.request(`/v1/dashboards/${encodeURIComponent(remoteId(id))}`, {
              method: 'PATCH',
              body: dashboardInputFrom(board),
            })
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
      }
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
function composesTheSame(a: Board, b: Board): boolean {
  return JSON.stringify(dashboardInputFrom(a)) === JSON.stringify(dashboardInputFrom(b))
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
