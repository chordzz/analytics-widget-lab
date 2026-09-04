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
import { currentTypeId, widgetType } from '../widgets/catalog'
import { heightForType } from '../widgets/layout'
import type { WidgetSpec } from '../widgets/Widget'
import type { Dashboard, DashboardScope, DashboardStatus, ShareGrant } from '../../domain/dashboard'
import type { Control, Section } from '../../domain/composition'
import type { Placement as DashboardPlacement } from '../../domain/composition'

export type { Control, DashboardScope, Section, ShareGrant }

export type BoardStatus = DashboardStatus

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

/**
 * A board is a Dashboard.
 *
 * Merge Plan Stage 6.2. It used to be the module's own shape — a name, a status
 * and a list of widgets — with no notion of who wrote it or who may see it. That
 * was honest while the module was a parallel track and is not now: FR-DA-01
 * gives every Dashboard a Scope, and a model that cannot express one cannot be
 * wrong about visibility so much as silent about it.
 *
 * **Widgets are referenced, not embedded** — Finding 4, and D10 ends here. A
 * Widget saved to the Widget Library and reused across Dashboards (FR-VZ-09) has
 * identity independent of any one of them, which is impossible if a Dashboard
 * owns its widgets by value. Storing ids costs nothing today and avoids a
 * migration later; `placedWidgets` joins the two back together for rendering,
 * because a *renderer* wants them joined even though storage must not.
 *
 * Two fields are the module's and are kept: `description`, which the drafts list
 * shows, and `updated`, which it sorts by. Neither is in the FRD's `Dashboard`
 * and neither contradicts it.
 */
export interface Board extends Omit<Dashboard, 'widgets'> {
  description: string
  /** ISO date, as a string, because that is all it is ever displayed as. */
  updated: string
  /**
   * D17 — keyed `WidgetSpec`, not the model's `Widget`.
   *
   * The two are the same record with two differences that both trace to D1: the
   * module's `WidgetMapping` has ten slot roles where `FieldMapping` has four
   * (a point map needs latitude *and* longitude; a gauge needs a target), and it
   * says `typeId` where the model says `visualizationTypeId`. Converging the
   * name is trivial and converging the mapping is F14. Until that lands, keying
   * the module's own spec is the honest shape.
   */
  widgets: Record<string, WidgetSpec>
}

/**
 * A widget joined back to where it sits.
 *
 * Storage keeps them apart — a Widget has identity independent of any Dashboard
 * (Finding 4) — and every renderer wants them together. This is the join, and it
 * is the only place the two halves meet, so a placement pointing at a widget
 * that is no longer there drops out here rather than rendering as an error card.
 */
export function placedWidgets(board: Board): PlacedWidget[] {
  return board.placements
    .map((placement) => {
      const spec = board.widgets[placement.widgetId]
      return spec ? { ...spec, x: placement.x, y: placement.y, w: placement.w, h: placement.h } : null
    })
    .filter((entry): entry is PlacedWidget => entry !== null)
}

/** How many widgets a board actually shows. */
export const widgetCountOf = (board: Board): number => placedWidgets(board).length

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
  | { type: 'create-board'; id: string; name?: string; authorId: string; at: string }
  | { type: 'ensure-editing'; id: string; authorId: string; at: string }
  | { type: 'open-board'; id: string }
  | { type: 'rename-board'; id: string; name: string; at: string }
  | { type: 'describe-board'; id: string; description: string; at: string }
  | { type: 'delete-board'; id: string }
  | { type: 'set-status'; id: string; status: BoardStatus; at: string }
  | { type: 'set-scope'; id: string; scope: DashboardScope; at: string }
  | { type: 'add-grant'; id: string; grant: ShareGrant; at: string }
  | { type: 'remove-grant'; id: string; grantId: string; at: string }
  | { type: 'add-control'; id: string; control: Control; at: string }
  | { type: 'remove-control'; id: string; controlId: string; at: string }
  | { type: 'add-section'; id: string; section: Section; at: string }
  | { type: 'rename-section'; id: string; sectionId: string; label: string; at: string }
  | { type: 'remove-section'; id: string; sectionId: string; at: string }
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
        authorId: action.authorId,
        /*
         * FR-DA-02 — Personal until the Author decides otherwise. A new board is
         * empty and half-thought-through; defaulting it to anything wider would
         * make sharing the thing you have to remember to switch *off*.
         */
        scope: { kind: 'personal' },
        shareGrants: [],
        status: 'draft',
        updated: action.at,
        widgets: {},
        placements: [],
        controls: [],
        sections: [],
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
        (board) => board.status === 'draft' && board.placements.length === 0,
      )
      if (blank) return { ...state, editingId: blank.id }

      return boardsReducer(state, {
        type: 'create-board',
        id: action.id,
        authorId: action.authorId,
        at: action.at,
      })
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

  const at = 'at' in action ? action.at : board.updated

  /** A board with its widget records and placements replaced, and redated. */
  const touched = (
    next: Partial<Pick<Board, 'widgets' | 'placements'>>,
  ): Board => ({ ...board, ...next, updated: at })

  const placementOf = (widgetId: string) =>
    board.placements.find((entry) => entry.widgetId === widgetId)

  switch (action.type) {
    case 'rename-board':
      // An empty name would leave an unclickable row in the drafts list.
      return { ...board, name: action.name.trim() || 'Untitled dashboard', updated: at }

    case 'describe-board':
      return { ...board, description: action.description, updated: at }

    case 'set-status':
      return { ...board, status: action.status, updated: at }

    /*
     * FR-DA-01 — every Dashboard has a Scope, and changing it is a decision the
     * Author takes rather than a side effect of anything else. Deliberately
     * separate from `set-status`: publishing means "I have finished reviewing",
     * not "everyone may see it", and Finding 9 records what goes wrong when the
     * two are folded together.
     */
    case 'set-scope':
      return { ...board, scope: action.scope, updated: at }

    /*
     * FR-DA-06, FR-DA-07 — a Grant *refines* who within the Scope sees the
     * board. It never reaches beyond it, which is why adding one cannot widen
     * visibility and removing the last one restores the whole Scope rather than
     * hiding the board from everybody.
     */
    case 'add-grant':
      return board.shareGrants.some((grant) => grant.recipientId === action.grant.recipientId)
        ? board
        : { ...board, shareGrants: [...board.shareGrants, action.grant], updated: at }

    case 'remove-grant':
      return {
        ...board,
        shareGrants: board.shareGrants.filter((grant) => grant.id !== action.grantId),
        updated: at,
      }

    /*
     * FR-CO-05 — a Control is a Composition Element, and FR-CO-08 says a
     * Composition Element draws from no Dataset. Nothing here carries a
     * `datasetId`, and the type in `domain/composition.ts` has nowhere to put
     * one, so that holds structurally rather than by care.
     *
     * A Control never names the Widgets it acts on. Correspondence is computed
     * per Widget at render time, so adding a Widget to a board brings it under
     * an existing Control with no reconfiguration — and removes the whole class
     * of bug where a Control's Widget list goes stale.
     */
    case 'add-control':
      return { ...board, controls: [...board.controls, action.control], updated: at }

    case 'remove-control':
      return {
        ...board,
        controls: board.controls.filter((control) => control.id !== action.controlId),
        updated: at,
      }

    /*
     * FR-CO-07 — a Container organizes Widgets spatially and draws no data.
     *
     * A Section owns a starting row and nothing else; which Widgets fall inside
     * it is derived from that (D19, `sections.ts`). So adding one cannot move a
     * Widget and removing one cannot orphan any — the widgets stay exactly where
     * they are and simply fall under a different heading, or none.
     */
    case 'add-section':
      return { ...board, sections: [...board.sections, action.section], updated: at }

    case 'rename-section':
      return {
        ...board,
        sections: board.sections.map((section) =>
          section.id === action.sectionId
            ? { ...section, label: action.label.trim() || 'Untitled section' }
            : section,
        ),
        updated: at,
      }

    case 'remove-section':
      return {
        ...board,
        sections: board.sections.filter((section) => section.id !== action.sectionId),
        updated: at,
      }

    /*
     * A new widget goes in the first place it fits, scanning left to right and
     * top to bottom — not below everything else. Appending is one line shorter
     * and always strands the widget under a half-empty row, which reads as the
     * builder having missed the obvious gap.
     */
    case 'add-widget': {
      const w = action.w === undefined ? defaultWidthFor(action.widget.typeId) : clampW(action.w)
      const h = action.h === undefined ? defaultHeightFor(action.widget.typeId) : clampH(action.h)
      const { x, y } = firstFit(board.placements, w, h)

      return touched({
        widgets: { ...board.widgets, [action.widget.id]: action.widget },
        placements: [...board.placements, { widgetId: action.widget.id, x, y, w, h }],
      })
    }

    /*
     * Editing a widget must not move it. The composer deals in specs and knows
     * nothing about placement, so the existing one is kept and only the width
     * can be changed — through `clampPlacement`, so a widget widened at the
     * right edge slides left instead of hanging off the board.
     */
    case 'update-widget': {
      if (!board.widgets[action.widget.id]) return board
      const current = placementOf(action.widget.id)

      return touched({
        widgets: { ...board.widgets, [action.widget.id]: action.widget },
        placements:
          current && action.w !== undefined
            ? board.placements.map((entry) =>
                entry.widgetId === action.widget.id
                  ? { ...entry, ...clampPlacement({ ...entry, w: action.w! }) }
                  : entry,
              )
            : board.placements,
      })
    }

    case 'remove-widget': {
      if (!board.widgets[action.widgetId]) return board
      const { [action.widgetId]: removed, ...rest } = board.widgets
      void removed

      return touched({
        widgets: rest,
        placements: board.placements.filter((entry) => entry.widgetId !== action.widgetId),
      })
    }

    case 'duplicate-widget': {
      const original = board.widgets[action.widgetId]
      const placement = placementOf(action.widgetId)
      if (!original || !placement) return board

      // The copy needs a cell of its own, or it would sit exactly under the
      // original and only one of them would be visible.
      const spot = firstFit(board.placements, placement.w, placement.h)
      const index = board.placements.findIndex((entry) => entry.widgetId === action.widgetId)
      const placements = [...board.placements]
      placements.splice(index + 1, 0, {
        widgetId: action.newId,
        ...spot,
        w: placement.w,
        h: placement.h,
      })

      return touched({
        widgets: { ...board.widgets, [action.newId]: { ...original, id: action.newId } },
        placements,
      })
    }

    case 'resize-widget':
      return touched({
        placements: board.placements.map((entry) =>
          entry.widgetId === action.widgetId
            ? {
                ...entry,
                ...clampPlacement({
                  ...entry,
                  w: action.w === undefined ? entry.w : action.w,
                  h: action.h === undefined ? entry.h : action.h,
                }),
              }
            : entry,
        ),
      })

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

      const placements = board.placements.map((entry) => {
        const next = wanted.get(entry.widgetId)
        if (!next) return entry
        if (next.x === entry.x && next.y === entry.y && next.w === entry.w && next.h === entry.h) {
          return entry
        }
        changed = true
        return { ...entry, ...next }
      })

      return changed ? touched({ placements }) : board
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

const STORAGE_KEY = 'analytics.boards.v4'

/**
 * v3 — free placement and the FRD's type ids, but the module's own board shape.
 *
 * A v3 board embedded its widgets in an array and said nothing about who wrote
 * it or who may see it. Migrating splits the array into a widget record and a
 * placement list (Finding 4), and gives the board an author and a Scope.
 */
const V3_KEY = 'analytics.boards.v3'

/**
 * v2 — free placement, but the module's own type ids.
 *
 * The shape did not change between v2 and v3; the *vocabulary* did. Adopting
 * the FRD's Visualization Type ids renamed seven of them, and a widget's
 * `typeId` is persisted, so a v2 board read without translation renders an
 * error card per renamed widget. `renamed()` does the translation and
 * `RENAMED_TYPES` is the map.
 */
const V2_KEY = 'analytics.boards.v2'

/**
 * The one-dimensional format: a `span`, an array order, and no position.
 *
 * Still read, never written. It is left in place after a migration rather than
 * cleared — it costs a few kilobytes and it is the only way back if a board
 * comes through wrong.
 */
const LEGACY_KEY = 'analytics.boards.v1'

/** A board as storage might hold it: v3's embedded array, or v4's record. */
type StoredBoard = Omit<Partial<Board>, 'widgets'> & {
  id: string
  name: string
  widgets?: unknown
}

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
/**
 * A stored widget's type id brought up to the current catalogue.
 *
 * Runs before `sized`, because the width and height a widget falls back to are
 * looked up *by type* — a widget still carrying `bar-vertical` would miss the
 * catalogue and take the 4-column, 268px default rather than its own.
 */
const renamed = (stored: StoredWidget): StoredWidget =>
  stored.typeId === currentTypeId(stored.typeId)
    ? stored
    : { ...stored, typeId: currentTypeId(stored.typeId) }

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
function normalizeBoard(board: StoredBoard, authorId: string): Board {
  /*
   * A stored board may be v3 (widgets embedded, no author, no Scope) or v4
   * (widgets keyed, placements listed). Both come through here, and the split is
   * the only structural difference — everything else is a default.
   */
  const embedded = Array.isArray(board.widgets) ? (board.widgets as StoredWidget[]) : null

  const sizedWidgets = (embedded ?? []).map(renamed).map(sized)
  const positioned = sizedWidgets.every((widget) => isNumber(widget.x) && isNumber(widget.y))
  const flowed = positioned
    ? sizedWidgets.map((widget) => ({ ...widget, ...clampPlacement(widget as Placement) }))
    : flowLayout(sizedWidgets)

  const widgets: Record<string, WidgetSpec> = {}
  let placements: DashboardPlacement[]

  if (embedded) {
    placements = flowed.map((widget) => {
      const { x, y, w, h, ...spec } = widget
      widgets[spec.id] = spec as WidgetSpec
      return { widgetId: spec.id, x, y, w, h }
    })
  } else {
    for (const [id, spec] of Object.entries(board.widgets ?? {})) {
      const next = renamed(spec as StoredWidget)
      widgets[id] = { ...(next as WidgetSpec), id }
    }

    const stored = (board.placements ?? []).filter(
      (entry) => widgets[entry.widgetId] !== undefined,
    )

    /*
     * Positions are all-or-nothing here too, for the same reason they are on the
     * way up from v1: a layout with a hole in it is not worth half-trusting, and
     * keeping the placements that survived leaves the repaired one overlapping
     * them. Without this, a missing `y` reaches `clampPlacement` and comes back
     * `NaN`, which renders as a widget that is nowhere.
     */
    const whole = stored.every(
      (entry) =>
        isNumber(entry.x) && isNumber(entry.y) && isNumber(entry.w) && isNumber(entry.h),
    )

    placements = whole
      ? stored.map((entry) => ({ ...entry, ...clampPlacement(entry) }))
      : flowLayout(
          stored.map((entry) => ({
            widgetId: entry.widgetId,
            w: isNumber(entry.w) ? entry.w : defaultWidthFor(widgets[entry.widgetId].typeId),
            h: isNumber(entry.h) ? entry.h : defaultHeightFor(widgets[entry.widgetId].typeId),
          })),
        ).map(({ widgetId, x, y, w, h }) => ({ widgetId, x, y, w, h }))
  }

  return {
    id: board.id,
    name: board.name,
    description: typeof board.description === 'string' ? board.description : '',
    /*
     * A migrated board belongs to whoever is migrating it. That is not a guess:
     * these boards come out of this browser's own storage, so the only person
     * who has ever had them is the one reading them now.
     */
    authorId: typeof board.authorId === 'string' ? board.authorId : authorId,
    /*
     * And it is Personal unless it already said otherwise.
     *
     * A migration must never *widen* visibility. Defaulting to
     * organization-wide would preserve the old behaviour — before Scopes
     * existed everyone saw everything — by asserting something the migration
     * cannot know. Personal is the conservative reading, and it costs the
     * migrating Author nothing, because an Author always sees their own boards
     * whatever the Scope says.
     */
    scope: isScope(board.scope) ? board.scope : { kind: 'personal' },
    shareGrants: Array.isArray(board.shareGrants) ? (board.shareGrants as ShareGrant[]) : [],
    status: board.status === 'published' ? 'published' : 'draft',
    updated: typeof board.updated === 'string' ? board.updated : '',
    widgets,
    placements,
    controls: Array.isArray(board.controls) ? (board.controls as Control[]) : [],
    sections: Array.isArray(board.sections) ? (board.sections as Section[]) : [],
  }
}

const isScope = (value: unknown): value is DashboardScope => {
  if (typeof value !== 'object' || value === null) return false
  const kind = (value as { kind?: unknown }).kind
  return kind === 'personal' || kind === 'organization-wide' || kind === 'organizational-scope'
}

/**
 * Reads one storage key, in either format.
 *
 * Anything unparseable returns `null` rather than being repaired, so the caller
 * can fall through to the next key or to the seed. A half-restored board would
 * render as a wall of error cards, which is a worse failure than starting over.
 */
function readBoards(raw: string | null, authorId: string): BoardsState | null {
  if (!raw) return null

  const parsed = JSON.parse(raw)

  const boards: unknown = Array.isArray(parsed) ? parsed : parsed?.boards
  if (!Array.isArray(boards) || boards.length === 0) return null

  const kept = boards.filter(isBoard).map((board) => normalizeBoard(board as StoredBoard, authorId))
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
export function loadState(seed: Board[], authorId = 'local'): BoardsState {
  const fallback: BoardsState = { boards: seed, editingId: null }
  if (typeof localStorage === 'undefined') return fallback

  try {
    return (
      readBoards(localStorage.getItem(STORAGE_KEY), authorId) ??
      readBoards(localStorage.getItem(V3_KEY), authorId) ??
      readBoards(localStorage.getItem(V2_KEY), authorId) ??
      readBoards(localStorage.getItem(LEGACY_KEY), authorId) ??
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
  const board = value as { id?: unknown; name?: unknown; widgets?: unknown }

  /*
   * `widgets` is an array in v1–v3 and a record in v4, and both are valid input
   * to `normalizeBoard`. Requiring an array here — which this did — rejects
   * every board the current version writes, and the symptom is not an error: it
   * is the seed quietly appearing in place of your own boards.
   */
  const hasWidgets =
    Array.isArray(board.widgets) ||
    (typeof board.widgets === 'object' && board.widgets !== null)

  return typeof board.id === 'string' && typeof board.name === 'string' && hasWidgets
}
