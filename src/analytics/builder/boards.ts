/**
 * Boards, and the operations that change them.
 *
 * A pure reducer with the React parts kept out, for two reasons. It is the only
 * way to test placement and publishing without mounting anything; and a host
 * portal that already has state management can drive these functions directly
 * instead of adopting the module's hook.
 *
 * Persistence is localStorage under a versioned key. That is honest for a UI
 * module with mock data — there is no server on this track — and it is one
 * function to replace when there is.
 */

import {
  clampH,
  clampPlacement,
  clampW,
  firstFit,
  flowLayout,
  rowsForPx,
  type Placement,
} from './grid'
import { widgetType } from '../widgets/catalog'
import { heightForType } from '../widgets/layout'
import type { WidgetSpec } from '../widgets/Widget'

export type BoardStatus = 'draft' | 'published'

/**
 * A widget on a board: what to draw, plus where it sits.
 *
 * Placement is required here and absent from `WidgetSpec`, which is the whole
 * point of the split. A spec can be rendered anywhere — a detail page, a report,
 * the gallery — and none of those have columns. A widget *on a board* always has
 * a position, so there is no such thing as a placed widget whose position has to
 * be guessed at render time.
 *
 * That is a change from the one-dimensional board, where `span` and `height`
 * were optional and absent meant "whatever this type is worth". Free placement
 * cannot keep that: two widgets can occupy the same cell, so the answer has to
 * be decided when the widget is added rather than every time it is drawn. The
 * type's `defaultSpan` and `heightForType` are now seed values for that one
 * decision — see `add-widget`.
 */
export interface PlacedWidget extends WidgetSpec, Placement {}

export interface Board {
  id: string
  name: string
  description: string
  status: BoardStatus
  /** ISO date, as a string, because that is all it is ever displayed as. */
  updated: string
  widgets: PlacedWidget[]
}

export interface BoardsState {
  boards: Board[]
  /** The board the builder is editing. */
  editingId: string | null
}

/** One widget's new placement, as `apply-layout` receives it. */
export interface LayoutEntry extends Placement {
  id: string
}

export type BoardsAction =
  | { type: 'create-board'; id: string; name?: string; at: string }
  | { type: 'ensure-editing'; id: string; at: string }
  | { type: 'open-board'; id: string }
  | { type: 'rename-board'; id: string; name: string; at: string }
  | { type: 'describe-board'; id: string; description: string; at: string }
  | { type: 'delete-board'; id: string }
  | { type: 'set-status'; id: string; status: BoardStatus; at: string }
  | {
      type: 'add-widget'
      boardId: string
      widget: WidgetSpec
      /** Both optional: the type's own defaults are used when they are absent. */
      w?: number
      h?: number
      at: string
    }
  | {
      type: 'update-widget'
      boardId: string
      widget: WidgetSpec
      /** The composer can change the width while editing. */
      w?: number
      at: string
    }
  | { type: 'remove-widget'; boardId: string; widgetId: string; at: string }
  | { type: 'duplicate-widget'; boardId: string; widgetId: string; newId: string; at: string }
  | {
      type: 'resize-widget'
      boardId: string
      widgetId: string
      /** Either dimension may be left alone. */
      w?: number
      h?: number
      at: string
    }
  | { type: 'apply-layout'; boardId: string; placements: readonly LayoutEntry[]; at: string }
  | { type: 'replace-all'; boards: Board[] }

/** How wide a freshly placed widget of this type wants to be. */
const defaultWidthFor = (typeId: string): number => clampW(widgetType(typeId)?.defaultSpan ?? 4)

/** How tall, in rows. `heightForType` still speaks pixels, so convert. */
const defaultHeightFor = (typeId: string): number => rowsForPx(heightForType(typeId))

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

  const touched = (widgets: PlacedWidget[]): Board => ({
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

    /*
     * A new widget goes in the first place it fits, scanning left to right and
     * top to bottom — not below everything else. Appending is one line shorter
     * and always strands the widget under a half-empty row, which reads as the
     * builder having missed the obvious gap.
     */
    case 'add-widget': {
      const w = action.w === undefined ? defaultWidthFor(action.widget.typeId) : clampW(action.w)
      const h = action.h === undefined ? defaultHeightFor(action.widget.typeId) : clampH(action.h)
      const { x, y } = firstFit(board.widgets, w, h)
      return touched([...board.widgets, { ...action.widget, x, y, w, h }])
    }

    /*
     * Editing a widget must not move it. The composer deals in specs and knows
     * nothing about placement, so the existing one is kept and only the width
     * can be changed — through `clampPlacement`, so a widget widened at the
     * right edge slides left instead of hanging off the board.
     */
    case 'update-widget':
      return touched(
        board.widgets.map((widget) => {
          if (widget.id !== action.widget.id) return widget
          const w = action.w === undefined ? widget.w : action.w
          return { ...widget, ...action.widget, ...clampPlacement({ ...widget, w }) }
        }),
      )

    case 'remove-widget':
      return touched(board.widgets.filter((widget) => widget.id !== action.widgetId))

    case 'duplicate-widget': {
      const index = board.widgets.findIndex((widget) => widget.id === action.widgetId)
      if (index === -1) return board
      const original = board.widgets[index]
      // The copy needs a cell of its own, or it would sit exactly under the
      // original and only one of them would be visible.
      const spot = firstFit(board.widgets, original.w, original.h)
      const widgets = [...board.widgets]
      widgets.splice(index + 1, 0, { ...original, id: action.newId, ...spot })
      return touched(widgets)
    }

    case 'resize-widget':
      return touched(
        board.widgets.map((widget) => {
          if (widget.id !== action.widgetId) return widget
          return {
            ...widget,
            ...clampPlacement({
              ...widget,
              w: action.w === undefined ? widget.w : action.w,
              h: action.h === undefined ? widget.h : action.h,
            }),
          }
        }),
      )

    /*
     * One drag moves several widgets — the grid pushes the occupants of the
     * target cell down and compacts what is left — so the whole layout arrives
     * at once rather than one widget at a time.
     *
     * A layout identical to the stored one returns the *same board object*, not
     * an equal one. The grid reports a layout on mount and after every
     * compaction, and stamping `updated` for those would redate every board
     * merely by opening it, and re-persist on every render.
     */
    case 'apply-layout': {
      const wanted = new Map(action.placements.map((entry) => [entry.id, clampPlacement(entry)]))
      let changed = false

      const widgets = board.widgets.map((widget) => {
        const next = wanted.get(widget.id)
        if (!next) return widget
        if (
          next.x === widget.x &&
          next.y === widget.y &&
          next.w === widget.w &&
          next.h === widget.h
        ) {
          return widget
        }
        changed = true
        return { ...widget, ...next }
      })

      return changed ? touched(widgets) : board
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

const STORAGE_KEY = 'analytics.boards.v2'

/**
 * The one-dimensional format: a `span`, an array order, and no position.
 *
 * Still read, never written. It is left in place after a migration rather than
 * cleared — it costs a few kilobytes and it is the only way back if a board
 * comes through wrong.
 */
const LEGACY_KEY = 'analytics.boards.v1'

/** A widget as storage might hold it: either format, or something in between. */
type StoredWidget = WidgetSpec &
  Partial<Placement> & {
    /** v1: columns. */
    span?: number
    /** v1: pixels. */
    height?: number
  }

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

/**
 * Give a stored widget a width and a height in grid units.
 *
 * Every source is handled by the same expression, which is why migration is not
 * a separate code path: a v2 widget has `w`/`h` already, a v1 widget has `span`
 * and maybe a pixel `height`, and a v1 widget that never got dragged has
 * neither and falls back to what its type asks for.
 */
function sized(stored: StoredWidget): StoredWidget & { w: number; h: number } {
  const { span, height, ...spec } = stored

  return {
    ...spec,
    w: clampW(isNumber(stored.w) ? stored.w : isNumber(span) ? span : defaultWidthFor(stored.typeId)),
    h: isNumber(stored.h)
      ? clampH(stored.h)
      : isNumber(height)
        ? rowsForPx(height)
        : defaultHeightFor(stored.typeId),
  }
}

/**
 * Bring a stored board up to the current model.
 *
 * Positions are all-or-nothing. A v1 board has none, so the whole board is
 * flowed left to right — which is exactly how CSS grid was already drawing it,
 * so a migrated board looks like the board you left. A v2 board missing even one
 * position gets the same treatment: a layout with a hole in it is not a layout
 * worth half-trusting, and a flowed board is at least a readable one.
 *
 * Nothing is compacted upward here. The grid does that on mount and reports the
 * result, and a second implementation would only be a chance for the two to
 * disagree.
 */
function normalizeBoard(board: Board): Board {
  const widgets = (board.widgets as StoredWidget[]).map(sized)
  const positioned = widgets.every((widget) => isNumber(widget.x) && isNumber(widget.y))

  return {
    ...board,
    widgets: positioned
      ? widgets.map((widget) => ({ ...widget, ...clampPlacement(widget as Placement) }))
      : flowLayout(widgets),
  }
}

/**
 * Reads one storage key, in either format.
 *
 * Anything unparseable returns `null` rather than being repaired, so the caller
 * can fall through to the next key or to the seed. A half-restored board would
 * render as a wall of error cards, which is a worse failure than starting over.
 */
function readBoards(raw: string | null): BoardsState | null {
  if (!raw) return null

  const parsed = JSON.parse(raw)

  const boards: unknown = Array.isArray(parsed) ? parsed : parsed?.boards
  if (!Array.isArray(boards) || boards.length === 0) return null

  const kept = boards.filter(isBoard).map(normalizeBoard)
  if (kept.length === 0) return null

  const editingId =
    !Array.isArray(parsed) && typeof parsed?.editingId === 'string' ? parsed.editingId : null

  // A pointer to a board that did not survive the filter is worse than none.
  return { boards: kept, editingId: kept.some((b) => b.id === editingId) ? editingId : null }
}

/**
 * Reads the saved session, falling back through v1 and then to the seed.
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
    return (
      readBoards(localStorage.getItem(STORAGE_KEY)) ??
      readBoards(localStorage.getItem(LEGACY_KEY)) ??
      fallback
    )
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
