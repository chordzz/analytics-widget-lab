/**
 * Boards, and the operations that change them.
 *
 * A pure reducer with the React parts kept out, for two reasons. It is the only
 * way to test reordering and publishing without mounting anything; and a host
 * portal that already has state management can drive these functions directly
 * instead of adopting the module's hook.
 *
 * Persistence is localStorage under a versioned key. That is honest for a UI
 * module with mock data — there is no server on this track — and it is one
 * function to replace when there is.
 */

import { clampHeight } from './resize'
import type { WidgetSpec } from '../widgets/Widget'

export type BoardStatus = 'draft' | 'published'

export interface Board {
  id: string
  name: string
  description: string
  status: BoardStatus
  /** ISO date, as a string, because that is all it is ever displayed as. */
  updated: string
  widgets: WidgetSpec[]
}

export interface BoardsState {
  boards: Board[]
  /** The board the builder is editing. */
  editingId: string | null
}

export type BoardsAction =
  | { type: 'create-board'; id: string; name?: string; at: string }
  | { type: 'ensure-editing'; id: string; at: string }
  | { type: 'open-board'; id: string }
  | { type: 'rename-board'; id: string; name: string; at: string }
  | { type: 'describe-board'; id: string; description: string; at: string }
  | { type: 'delete-board'; id: string }
  | { type: 'set-status'; id: string; status: BoardStatus; at: string }
  | { type: 'add-widget'; boardId: string; widget: WidgetSpec; at: string }
  | { type: 'update-widget'; boardId: string; widget: WidgetSpec; at: string }
  | { type: 'remove-widget'; boardId: string; widgetId: string; at: string }
  | { type: 'duplicate-widget'; boardId: string; widgetId: string; newId: string; at: string }
  | {
      type: 'resize-widget'
      boardId: string
      widgetId: string
      /** Either dimension may be left alone. */
      span?: number
      height?: number
      at: string
    }
  | { type: 'move-widget'; boardId: string; from: number; to: number; at: string }
  | { type: 'replace-all'; boards: Board[] }

/** A board spans twelve columns; a widget may take one to all of them. */
export const MIN_SPAN = 2
export const MAX_SPAN = 12

export const clampSpan = (span: number): number =>
  Math.max(MIN_SPAN, Math.min(MAX_SPAN, Math.round(span)))

export function boardsReducer(state: BoardsState, action: BoardsAction): BoardsState {
  switch (action.type) {
    case 'replace-all':
      return { ...state, boards: action.boards }

    case 'create-board': {
      const board: Board = {
        id: action.id,
        name: action.name?.trim() || 'Untitled dashboard',
        description: '',
        status: 'draft',
        updated: action.at,
        widgets: [],
      }
      // Newest first: a board you just made should not be below six older ones.
      return { boards: [board, ...state.boards], editingId: board.id }
    }

    /*
     * Make sure *something* is open, without ever making a second empty board.
     *
     * The builder needs a board on arrival, and the obvious "create one if none
     * is open" belongs in an effect — where React's development double-invoke
     * runs it twice against the same stale state and produces two blank drafts.
     * Deciding here instead makes it idempotent by construction: the reducer
     * always sees current state, so the second dispatch is a no-op.
     */
    case 'ensure-editing': {
      if (state.boards.some((board) => board.id === state.editingId)) return state

      const blank = state.boards.find(
        (board) => board.status === 'draft' && board.widgets.length === 0,
      )
      if (blank) return { ...state, editingId: blank.id }

      return boardsReducer(state, { type: 'create-board', id: action.id, at: action.at })
    }

    case 'open-board':
      return { ...state, editingId: action.id }

    case 'delete-board':
      return {
        boards: state.boards.filter((board) => board.id !== action.id),
        editingId: state.editingId === action.id ? null : state.editingId,
      }

    default:
      return { ...state, boards: state.boards.map((board) => applyToBoard(board, action)) }
  }
}

function applyToBoard(board: Board, action: BoardsAction): Board {
  const id = 'boardId' in action ? action.boardId : 'id' in action ? action.id : null
  if (id !== board.id) return board

  const touched = (widgets: WidgetSpec[]): Board => ({
    ...board,
    widgets,
    updated: 'at' in action ? action.at : board.updated,
  })

  switch (action.type) {
    case 'rename-board':
      // An empty name would leave an unclickable row in the drafts list.
      return { ...board, name: action.name.trim() || 'Untitled dashboard', updated: action.at }

    case 'describe-board':
      return { ...board, description: action.description, updated: action.at }

    case 'set-status':
      return { ...board, status: action.status, updated: action.at }

    case 'add-widget':
      return touched([...board.widgets, action.widget])

    case 'update-widget':
      return touched(
        board.widgets.map((widget) => (widget.id === action.widget.id ? action.widget : widget)),
      )

    case 'remove-widget':
      return touched(board.widgets.filter((widget) => widget.id !== action.widgetId))

    case 'duplicate-widget': {
      const index = board.widgets.findIndex((widget) => widget.id === action.widgetId)
      if (index === -1) return board
      const copy = { ...board.widgets[index], id: action.newId }
      // Beside the original, not at the end — a duplicate you have to scroll to
      // find reads as a bug.
      const widgets = [...board.widgets]
      widgets.splice(index + 1, 0, copy)
      return touched(widgets)
    }

    case 'resize-widget':
      return touched(
        board.widgets.map((widget) => {
          if (widget.id !== action.widgetId) return widget
          return {
            ...widget,
            span: action.span === undefined ? widget.span : clampSpan(action.span),
            height: action.height === undefined ? widget.height : clampHeight(action.height),
          }
        }),
      )

    case 'move-widget': {
      const { from, to } = action
      if (from === to) return board
      if (from < 0 || from >= board.widgets.length) return board
      const widgets = [...board.widgets]
      const [moved] = widgets.splice(from, 1)
      widgets.splice(Math.max(0, Math.min(widgets.length, to)), 0, moved)
      return touched(widgets)
    }

    default:
      return board
  }
}

// --- selectors --------------------------------------------------------------

export const boardById = (state: BoardsState, id: string | null): Board | undefined =>
  state.boards.find((board) => board.id === id)

export const draftBoards = (state: BoardsState): Board[] =>
  state.boards.filter((board) => board.status === 'draft')

export const publishedBoards = (state: BoardsState): Board[] =>
  state.boards.filter((board) => board.status === 'published')

// --- persistence ------------------------------------------------------------

const STORAGE_KEY = 'analytics.boards.v1'

/**
 * Reads the saved session, falling back to the seed.
 *
 * Anything unparseable is discarded rather than repaired. A half-restored board
 * would render as a wall of error cards, which is a worse failure than starting
 * from the seed.
 *
 * `editingId` is persisted with the boards, not separately: reloading the
 * builder must put you back on the board you were building. Without it the
 * Create screen finds nothing open and starts a new one, quietly abandoning
 * your work and leaving an empty draft behind.
 */
export function loadState(seed: Board[]): BoardsState {
  const fallback: BoardsState = { boards: seed, editingId: null }
  if (typeof localStorage === 'undefined') return fallback

  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)

    const boards: unknown = Array.isArray(parsed) ? parsed : parsed?.boards
    if (!Array.isArray(boards) || boards.length === 0) return fallback

    const kept = boards.filter(isBoard)
    if (kept.length === 0) return fallback

    const editingId =
      !Array.isArray(parsed) && typeof parsed?.editingId === 'string' ? parsed.editingId : null

    // A pointer to a board that did not survive the filter is worse than none.
    return { boards: kept, editingId: kept.some((b) => b.id === editingId) ? editingId : null }
  } catch {
    return fallback
  }
}

export function saveState(state: BoardsState): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // A full or disabled store is not worth interrupting the session for.
  }
}

function isBoard(value: unknown): value is Board {
  if (typeof value !== 'object' || value === null) return false
  const board = value as Partial<Board>
  return (
    typeof board.id === 'string' &&
    typeof board.name === 'string' &&
    Array.isArray(board.widgets)
  )
}
