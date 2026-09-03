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

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  boardsReducer,
  boardById,
  draftBoards,
  publishedBoards,
  type Board,
  type BoardsAction,
  type BoardsState,
  type LayoutEntry,
} from './boards'
import { seedBoards } from './seed'
import { LocalBoardStore, type BoardStorePort } from './store'
import type { WidgetSpec } from '../widgets/Widget'

/**
 * How long to sit on changes before writing them.
 *
 * `GridBoard` already commits once per gesture rather than once per frame; this
 * is the same idea one layer out. Against localStorage it barely matters, and
 * against a network it is the difference between one request per drag and one
 * per keystroke in the rename field.
 */
const WRITE_DEBOUNCE_MS = 400

interface BoardsContextValue {
  state: BoardsState
  /** True until the store has answered. Nothing below it is meaningful yet. */
  loading: boolean
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
  /**
   * Adds a widget. `size` is what the composer chose; anything it leaves out
   * comes from the widget type, and the board decides where it goes.
   */
  addWidget: (boardId: string, widget: Omit<WidgetSpec, 'id'>, size?: { w?: number; h?: number }) => void
  updateWidget: (boardId: string, widget: WidgetSpec, w?: number) => void
  removeWidget: (boardId: string, widgetId: string) => void
  duplicateWidget: (boardId: string, widgetId: string) => void
  resizeWidget: (boardId: string, widgetId: string, size: { w?: number; h?: number }) => void
  /** One gesture, every widget it moved. The grid reports the whole layout. */
  applyLayout: (boardId: string, placements: readonly LayoutEntry[]) => void
}

const BoardsContext = createContext<BoardsContextValue | null>(null)

export function BoardsProvider({
  children,
  store,
}: {
  children: ReactNode
  /** Supplied by a host with a real store. Omit to persist locally. */
  store?: BoardStorePort
}) {
  const backing = useMemo(() => store ?? new LocalBoardStore(), [store])

  /*
   * An empty board list is the honest starting point, not the seed.
   *
   * Seeding here and replacing on load would show a board that is not yours for
   * a frame, and — worse — the persist effect below would race the load and
   * write the seed over your saved session. `loading` is what callers render
   * against instead.
   */
  const [state, dispatch] = useReducer(boardsReducer, { boards: [], editingId: null })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    backing
      .load(seedBoards)
      .then((loaded) => {
        if (!live) return
        dispatch({ type: 'replace-all', boards: loaded.boards })
        if (loaded.editingId) dispatch({ type: 'open-board', id: loaded.editingId })
        setLoading(false)
      })
      .catch(() => live && setLoading(false))

    return () => {
      live = false
    }
  }, [backing])

  /*
   * Persist after the load, never during it, and never on the first render.
   *
   * Without the guard the empty initial state is written the moment the provider
   * mounts, which erases the saved session before the load that would have
   * restored it has even resolved.
   */
  const settled = useRef(false)

  useEffect(() => {
    if (loading) return
    if (!settled.current) {
      settled.current = true
      return
    }

    const timer = setTimeout(() => void backing.save(state), WRITE_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [backing, state, loading])

  const value = useMemo<BoardsContextValue>(() => {
    const at = backing.now()
    const newId = (prefix: string) => backing.mintId(prefix)

    return {
      state,
      loading,
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

      addWidget: (boardId, widget, size) =>
        dispatch({
          type: 'add-widget',
          boardId,
          widget: { ...widget, id: newId('w') },
          ...size,
          at,
        }),
      updateWidget: (boardId, widget, w) =>
        dispatch({ type: 'update-widget', boardId, widget, w, at }),
      removeWidget: (boardId, widgetId) =>
        dispatch({ type: 'remove-widget', boardId, widgetId, at }),
      duplicateWidget: (boardId, widgetId) =>
        dispatch({ type: 'duplicate-widget', boardId, widgetId, newId: newId('w'), at }),
      resizeWidget: (boardId, widgetId, size) =>
        dispatch({ type: 'resize-widget', boardId, widgetId, ...size, at }),
      applyLayout: (boardId, placements) =>
        dispatch({ type: 'apply-layout', boardId, placements, at }),
    }
  }, [state, loading, backing])

  return <BoardsContext.Provider value={value}>{children}</BoardsContext.Provider>
}

export function useBoards(): BoardsContextValue {
  const value = useContext(BoardsContext)
  if (!value) throw new Error('useBoards must be used inside <BoardsProvider>')
  return value
}
