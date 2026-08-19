/**
 * The boards store, as React sees it.
 *
 * A context rather than a hook per screen, because three screens read the same
 * boards — Dashboards lists the published ones, Drafts lists the rest, and
 * Create edits one — and they must not each hold their own copy. Publishing a
 * draft has to remove it from Drafts and add it to Dashboards in the same tick.
 *
 * Every mutating call stamps `updated` here, so the reducer stays pure and the
 * clock is injectable in tests.
 */

import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react'
import {
  boardsReducer,
  boardById,
  draftBoards,
  loadState,
  publishedBoards,
  saveState,
  type Board,
  type BoardsAction,
  type BoardsState,
} from './boards'
import { seedBoards } from './seed'
import type { WidgetSpec } from '../widgets/Widget'

const today = () => new Date().toISOString().slice(0, 10)

/** Unique enough for a client-side board; no server is issuing these. */
const newId = (prefix: string) =>
  `${prefix}-${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-4)}`

interface BoardsContextValue {
  state: BoardsState
  dispatch: (action: BoardsAction) => void
  boards: Board[]
  drafts: Board[]
  published: Board[]
  editing: Board | undefined
  /** Returns the new board's id, so a caller can navigate straight to it. */
  createBoard: (name?: string) => string
  openBoard: (id: string) => void
  /** Opens a board to edit, reusing a blank draft rather than adding another. */
  ensureEditing: () => void
  renameBoard: (id: string, name: string) => void
  deleteBoard: (id: string) => void
  publishBoard: (id: string) => void
  unpublishBoard: (id: string) => void
  addWidget: (boardId: string, widget: Omit<WidgetSpec, 'id'>) => void
  updateWidget: (boardId: string, widget: WidgetSpec) => void
  removeWidget: (boardId: string, widgetId: string) => void
  duplicateWidget: (boardId: string, widgetId: string) => void
  resizeWidget: (boardId: string, widgetId: string, size: { span?: number; height?: number }) => void
  moveWidget: (boardId: string, from: number, to: number) => void
}

const BoardsContext = createContext<BoardsContextValue | null>(null)

export function BoardsProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(boardsReducer, null, () => loadState(seedBoards))

  useEffect(() => {
    saveState(state)
  }, [state])

  const value = useMemo<BoardsContextValue>(() => {
    const at = today()

    return {
      state,
      dispatch,
      boards: state.boards,
      drafts: draftBoards(state),
      published: publishedBoards(state),
      editing: boardById(state, state.editingId),

      createBoard: (name) => {
        const id = newId('board')
        dispatch({ type: 'create-board', id, name, at })
        return id
      },
      openBoard: (id) => dispatch({ type: 'open-board', id }),
      ensureEditing: () => dispatch({ type: 'ensure-editing', id: newId('board'), at }),
      renameBoard: (id, name) => dispatch({ type: 'rename-board', id, name, at }),
      deleteBoard: (id) => dispatch({ type: 'delete-board', id }),
      publishBoard: (id) => dispatch({ type: 'set-status', id, status: 'published', at }),
      unpublishBoard: (id) => dispatch({ type: 'set-status', id, status: 'draft', at }),

      addWidget: (boardId, widget) =>
        dispatch({ type: 'add-widget', boardId, widget: { ...widget, id: newId('w') }, at }),
      updateWidget: (boardId, widget) => dispatch({ type: 'update-widget', boardId, widget, at }),
      removeWidget: (boardId, widgetId) =>
        dispatch({ type: 'remove-widget', boardId, widgetId, at }),
      duplicateWidget: (boardId, widgetId) =>
        dispatch({ type: 'duplicate-widget', boardId, widgetId, newId: newId('w'), at }),
      resizeWidget: (boardId, widgetId, size) =>
        dispatch({ type: 'resize-widget', boardId, widgetId, ...size, at }),
      moveWidget: (boardId, from, to) => dispatch({ type: 'move-widget', boardId, from, to, at }),
    }
  }, [state])

  return <BoardsContext.Provider value={value}>{children}</BoardsContext.Provider>
}

export function useBoards(): BoardsContextValue {
  const value = useContext(BoardsContext)
  if (!value) throw new Error('useBoards must be used inside <BoardsProvider>')
  return value
}
