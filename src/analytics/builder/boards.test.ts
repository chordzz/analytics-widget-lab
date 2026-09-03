/**
 * Board operations.
 *
 * Placement and duplication are the two that are easy to get subtly wrong and
 * hard to spot by eye — a widget that lands one cell off looks like the drop
 * target was slightly out rather than like a bug in the arithmetic.
 *
 * The grid arithmetic itself is tested in `grid.test.ts`. What is tested here is
 * that the reducer reaches for it: that adding a widget finds a gap, that a
 * resize cannot push a widget off the board, and that a board saved in the
 * one-dimensional format comes back looking like the board you left.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import {
  boardsReducer,
  draftBoards,
  placedWidgets,
  loadState,
  publishedBoards,
  saveState,
  type Board,
  type BoardsState,
  type PlacedWidget,
} from './boards'
import { MAX_H, MAX_W, MIN_H, MIN_W, collides, flowLayout, rowsForPx } from './grid'
import { RENAMED_TYPES, widgetType } from '../widgets/catalog'
import { heightForType } from '../widgets/layout'
import type { WidgetSpec } from '../widgets/Widget'

const AUTHOR = 'local'

const AT = '2026-08-12'

/** A spec, with no placement — what the composer hands over. */
const spec = (id: string): WidgetSpec => ({
  id,
  typeId: 'stat-card',
  datasetId: 'revenue-monthly',
  mapping: { value: 'revenue' },
})

const widget = (id: string, w = 4, h = 4): PlacedWidget => ({ ...spec(id), x: 0, y: 0, w, h })

/** Placed left to right, so the default board has no two widgets in one cell. */
const placed = (...ids: string[]): PlacedWidget[] => flowLayout(ids.map((id) => widget(id)))

/**
 * Boards are authored here as a flat list of placed widgets and stored as the
 * two halves a Dashboard keeps them in — a keyed record and a placement list.
 * Every test below reads through `widgetOn` and `ids`, which join them back, so
 * what a test asserts is what a person sees rather than how it is filed.
 */
const split = (widgets: PlacedWidget[]): Pick<Board, 'widgets' | 'placements'> => ({
  widgets: Object.fromEntries(
    widgets.map(({ x, y, w, h, ...rest }) => {
      void x, y, w, h
      return [rest.id, rest as WidgetSpec]
    }),
  ),
  placements: widgets.map(({ id, x, y, w, h }) => ({ widgetId: id, x, y, w, h })),
})

const board = (
  overrides: Partial<Board> & { placed?: PlacedWidget[] } = {},
): Board => {
  const { placed: given, ...rest } = overrides
  return {
    id: 'b1',
    name: 'Board one',
    description: '',
    authorId: AUTHOR,
    scope: { kind: 'personal' },
    shareGrants: [],
    status: 'draft',
    updated: '2026-01-01',
    ...split(given ?? placed('a', 'b', 'c')),
    ...rest,
  }
}

const boardOf = (state: BoardsState, boardId = 'b1'): Board =>
  state.boards.find((entry) => entry.id === boardId)!

const widgetOn = (state: BoardsState, id: string, boardId = 'b1'): PlacedWidget =>
  placedWidgets(boardOf(state, boardId)).find((entry) => entry.id === id)!

const stateWith = (...boards: Board[]): BoardsState => ({ boards, editingId: null })

const ids = (state: BoardsState, boardId = 'b1') =>
  placedWidgets(boardOf(state, boardId)).map((entry) => entry.id)

describe('boards', () => {
  test('a new board is a draft, empty, and opened for editing', () => {
    const next = boardsReducer(stateWith(), { type: 'create-board', id: 'new', authorId: AUTHOR, at: AT })
    expect(next.boards[0]).toMatchObject({ id: 'new', status: 'draft', placements: [] })
    expect(placedWidgets(next.boards[0])).toEqual([])
    expect(next.editingId).toBe('new')
  })

  test('a new board goes to the top of the list', () => {
    const next = boardsReducer(stateWith(board()), { type: 'create-board', id: 'new', authorId: AUTHOR, at: AT })
    expect(next.boards.map((entry) => entry.id)).toEqual(['new', 'b1'])
  })

  test('an unnamed board still has a name', () => {
    const next = boardsReducer(stateWith(), { type: 'create-board', id: 'new', name: '  ', authorId: AUTHOR, at: AT })
    expect(next.boards[0].name).toBe('Untitled dashboard')
  })

  test('renaming to blank keeps a usable name', () => {
    const next = boardsReducer(stateWith(board()), {
      type: 'rename-board',
      id: 'b1',
      name: '   ',
      at: AT,
    })
    expect(next.boards[0].name).toBe('Untitled dashboard')
  })

  test('deleting the board being edited clears the selection', () => {
    const next = boardsReducer(
      { boards: [board()], editingId: 'b1' },
      { type: 'delete-board', id: 'b1' },
    )
    expect(next.boards).toEqual([])
    expect(next.editingId).toBeNull()
  })

  test('publishing moves a board between the two lists', () => {
    const drafted = stateWith(board())
    expect(draftBoards(drafted).map((entry) => entry.id)).toEqual(['b1'])

    const next = boardsReducer(drafted, {
      type: 'set-status',
      id: 'b1',
      status: 'published',
      at: AT,
    })
    expect(draftBoards(next)).toEqual([])
    expect(publishedBoards(next).map((entry) => entry.id)).toEqual(['b1'])
    expect(next.boards[0].updated).toBe(AT)
  })
})

describe('ensure-editing', () => {
  const ensure = (state: BoardsState) =>
    boardsReducer(state, { type: 'ensure-editing', id: 'made', authorId: AUTHOR, at: AT })

  test('makes a board when there is nothing to adopt', () => {
    const next = ensure(stateWith(board({ id: 'full' })))
    expect(next.editingId).toBe('made')
    expect(next.boards.length).toBe(2)
  })

  test('is idempotent — dispatching twice does not make two boards', () => {
    // React's development double-invoke calls the arrival effect twice against
    // the same state. This is the guard that makes that harmless.
    const once = ensure(stateWith())
    const twice = boardsReducer(once, { type: 'ensure-editing', id: 'another', authorId: AUTHOR, at: AT })
    expect(twice.boards.length).toBe(1)
    expect(twice.editingId).toBe('made')
  })

  test('adopts an existing blank draft rather than adding one', () => {
    const blank = board({ id: 'blank', placed: [] })
    const next = ensure(stateWith(board({ id: 'full' }), blank))
    expect(next.editingId).toBe('blank')
    expect(next.boards.length).toBe(2)
  })

  test('never hijacks a board that has widgets on it', () => {
    const next = ensure(stateWith(board({ id: 'full' })))
    expect(next.editingId).not.toBe('full')
  })

  test('never adopts a published board, even an empty one', () => {
    const next = ensure(stateWith(board({ id: 'live', status: 'published', placed: [] })))
    expect(next.editingId).toBe('made')
  })

  test('leaves an already-open board alone', () => {
    const state = { boards: [board()], editingId: 'b1' }
    expect(ensure(state)).toBe(state)
  })
})

describe('widgets on a board', () => {
  test('adding appends and stamps the board', () => {
    const next = boardsReducer(stateWith(board()), {
      type: 'add-widget',
      boardId: 'b1',
      widget: spec('d'),
      at: AT,
    })
    expect(ids(next)).toEqual(['a', 'b', 'c', 'd'])
    expect(next.boards[0].updated).toBe(AT)
  })

  test('a duplicate lands beside its original, not at the end', () => {
    const next = boardsReducer(stateWith(board()), {
      type: 'duplicate-widget',
      boardId: 'b1',
      widgetId: 'a',
      newId: 'a-copy',
      at: AT,
    })
    expect(ids(next)).toEqual(['a', 'a-copy', 'b', 'c'])
  })

  test('duplicating an unknown widget changes nothing', () => {
    const before = stateWith(board())
    const next = boardsReducer(before, {
      type: 'duplicate-widget',
      boardId: 'b1',
      widgetId: 'nope',
      newId: 'x',
      at: AT,
    })
    expect(next.boards[0]).toBe(before.boards[0])
  })

  test('removing takes only the one named', () => {
    const next = boardsReducer(stateWith(board()), {
      type: 'remove-widget',
      boardId: 'b1',
      widgetId: 'b',
      at: AT,
    })
    expect(ids(next)).toEqual(['a', 'c'])
  })

  test('a widget only changes on its own board', () => {
    const other = board({ id: 'b2', placed: placed('a') })
    const next = boardsReducer(stateWith(board(), other), {
      type: 'remove-widget',
      boardId: 'b2',
      widgetId: 'a',
      at: AT,
    })
    expect(ids(next, 'b1')).toEqual(['a', 'b', 'c'])
    expect(ids(next, 'b2')).toEqual([])
  })
})

describe('placing a new widget', () => {
  test('it lands in the first gap, not below the board', () => {
    // The reducer's job is to reach for `firstFit`; where the gap is is
    // `grid.test.ts`'s problem.
    const next = boardsReducer(stateWith(board({ placed: [widget('a', 8)] })), {
      type: 'add-widget',
      boardId: 'b1',
      widget: spec('d'),
      w: 4,
      at: AT,
    })
    expect(widgetOn(next, 'd')).toMatchObject({ x: 8, y: 0, w: 4 })
  })

  test('a width the composer did not choose comes from the widget type', () => {
    // `stat-card` asks for 3 columns and 132px, which is 4 rows.
    const next = boardsReducer(stateWith(board({ placed: [] })), {
      type: 'add-widget',
      boardId: 'b1',
      widget: spec('d'),
      at: AT,
    })
    expect(widgetOn(next, 'd')).toMatchObject({ x: 0, y: 0, w: 3, h: 4 })
  })

  test('a size outside the grid is clamped on the way in', () => {
    const next = boardsReducer(stateWith(board({ placed: [] })), {
      type: 'add-widget',
      boardId: 'b1',
      widget: spec('d'),
      w: 99,
      h: 1,
      at: AT,
    })
    expect(widgetOn(next, 'd')).toMatchObject({ w: MAX_W, h: MIN_H })
  })

  test('a duplicate gets a cell of its own', () => {
    // Copying the original's placement too would stack the two exactly and only
    // one of them would ever be visible.
    const next = boardsReducer(stateWith(board()), {
      type: 'duplicate-widget',
      boardId: 'b1',
      widgetId: 'a',
      newId: 'a-copy',
      at: AT,
    })
    expect(collides(widgetOn(next, 'a'), widgetOn(next, 'a-copy'))).toBe(false)
  })
})

describe('resizing', () => {
  const resized = (size: { w?: number; h?: number }, widgets = placed('a', 'b', 'c')) =>
    widgetOn(
      boardsReducer(stateWith(board({ placed: widgets })), {
        type: 'resize-widget',
        boardId: 'b1',
        widgetId: 'a',
        ...size,
        at: AT,
      }),
      'a',
    )

  test('a size within range is kept', () => {
    expect(resized({ w: 6 })).toMatchObject({ w: 6 })
    expect(resized({ h: 9 })).toMatchObject({ h: 9 })
  })

  test('a size outside the grid is clamped', () => {
    expect(resized({ w: 0 }).w).toBe(MIN_W)
    expect(resized({ w: 40 }).w).toBe(MAX_W)
    expect(resized({ h: 0 }).h).toBe(MIN_H)
    expect(resized({ h: 999 }).h).toBe(MAX_H)
  })

  test('resizing one dimension leaves the other alone', () => {
    // The grip sends whichever axis moved; an omitted axis must not be read as
    // "set this to undefined" and silently reset the widget.
    const widened = resized({ w: 8 }, [widget('a', 4, 9)])
    expect(widened.w).toBe(8)
    expect(widened.h).toBe(9)
  })

  test('a resize does not move the widget', () => {
    const moved = resized({ w: 3 }, [{ ...widget('a'), x: 5, y: 7 }])
    expect(moved).toMatchObject({ x: 5, y: 7 })
  })

  test('widening at the right edge slides the widget left', () => {
    // Otherwise the widget hangs off the board, which the grid then has to
    // rescue on the next render — visibly, one frame late.
    const widened = resized({ w: 6 }, [{ ...widget('a'), x: 8, y: 0 }])
    expect(widened).toMatchObject({ x: 6, w: 6 })
  })
})

describe('applying a whole layout', () => {
  const entries = [
    { id: 'a', x: 0, y: 0, w: 6, h: 5 },
    { id: 'b', x: 6, y: 0, w: 6, h: 5 },
    { id: 'c', x: 0, y: 5, w: 12, h: 7 },
  ]

  const applied = (placements: typeof entries) =>
    boardsReducer(stateWith(board()), { type: 'apply-layout', boardId: 'b1', placements, at: AT })

  test('every widget named gets its new placement', () => {
    const next = applied(entries)
    expect(widgetOn(next, 'a')).toMatchObject({ x: 0, y: 0, w: 6, h: 5 })
    expect(widgetOn(next, 'c')).toMatchObject({ x: 0, y: 5, w: 12, h: 7 })
  })

  test('a widget the layout does not mention is left where it was', () => {
    const next = applied([entries[0]])
    expect(widgetOn(next, 'b')).toMatchObject({ x: 4, y: 0, w: 4 })
  })

  test('an id that is not on the board is ignored rather than added', () => {
    const next = applied([{ id: 'ghost', x: 0, y: 0, w: 4, h: 4 }])
    expect(ids(next)).toEqual(['a', 'b', 'c'])
  })

  test('placements are clamped, however the grid reports them', () => {
    const next = applied([{ id: 'a', x: -3, y: -9, w: 99, h: 1 }])
    expect(widgetOn(next, 'a')).toMatchObject({ x: 0, y: 0, w: MAX_W, h: MIN_H })
  })

  test('an unchanged layout returns the very same board', () => {
    /*
     * Not merely an equal one — the same object.
     *
     * The grid reports a layout on mount and after every compaction. Treating
     * those as edits would redate every board just by opening it, and the
     * persist effect watching this state would write on every render.
     */
    const before = stateWith(board())
    const unchanged = placedWidgets(before.boards[0]).map(({ id, x, y, w, h }) => ({ id, x, y, w, h }))
    const next = boardsReducer(before, {
      type: 'apply-layout',
      boardId: 'b1',
      placements: unchanged,
      at: AT,
    })
    expect(next.boards[0]).toBe(before.boards[0])
  })
})

/**
 * The test runner has no DOM, so persistence gets a stub.
 *
 * Worth the few lines rather than skipping these: the fallback paths — bad
 * JSON, an unknown board id, the older storage format — are exactly the ones
 * that never get exercised by hand, and a throw in any of them would blank the
 * whole module on load.
 */
function stubStorage() {
  const entries = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
      removeItem: (key: string) => void entries.delete(key),
      clear: () => entries.clear(),
    },
  })
}

describe('persistence', () => {
  const KEY = 'analytics.boards.v4'
  const seed = [board({ id: 'seeded' })]

  beforeEach(stubStorage)

  test('an empty store falls back to the seed', () => {
    localStorage.removeItem(KEY)
    expect(loadState(seed).boards.map((entry) => entry.id)).toEqual(['seeded'])
  })

  test('a saved session round-trips, including which board is open', () => {
    saveState({ boards: [board({ id: 'saved' })], editingId: 'saved' })
    const restored = loadState(seed)
    expect(restored.boards.map((entry) => entry.id)).toEqual(['saved'])
    expect(restored.editingId).toBe('saved')
  })

  test('placement survives the round trip untouched', () => {
    // The load path normalises every board it reads. A valid placement must come
    // back exactly as it went in, or opening a board would nudge it.
    const put = { ...widget('a'), x: 5, y: 9, w: 6, h: 11 }
    saveState({ boards: [board({ id: 'saved', placed: [put] })], editingId: null })
    expect(widgetOn(loadState(seed), 'a', 'saved')).toMatchObject({ x: 5, y: 9, w: 6, h: 11 })
  })

  test('a pointer to a board that no longer exists is dropped', () => {
    localStorage.setItem(KEY, JSON.stringify({ boards: [board({ id: 'saved' })], editingId: 'gone' }))
    expect(loadState(seed).editingId).toBeNull()
  })

  test('the older bare-array format still loads', () => {
    localStorage.setItem(KEY, JSON.stringify([board({ id: 'legacy' })]))
    const restored = loadState(seed)
    expect(restored.boards.map((entry) => entry.id)).toEqual(['legacy'])
    expect(restored.editingId).toBeNull()
  })

  test('unparseable storage falls back rather than throwing', () => {
    localStorage.setItem(KEY, '{oh no')
    expect(loadState(seed).boards.map((entry) => entry.id)).toEqual(['seeded'])
  })

  test('storage holding no valid board falls back to the seed', () => {
    localStorage.setItem(KEY, JSON.stringify({ boards: [{ nope: true }], editingId: null }))
    expect(loadState(seed).boards.map((entry) => entry.id)).toEqual(['seeded'])
  })
})

/**
 * Migrating the one-dimensional format.
 *
 * A v1 board stored a `span`, an array order and sometimes a pixel height. It
 * never stored a position, because CSS grid supplied one by flowing the widgets
 * left to right. Reading it is therefore not a translation so much as writing
 * down what the browser was already doing — which is what makes "the board looks
 * like the board you left" a testable claim rather than a hope.
 */
describe('migration from v1', () => {
  const LEGACY_KEY = 'analytics.boards.v1'
  const KEY = 'analytics.boards.v4'
  const seed = [board({ id: 'seeded' })]

  /** Exactly the old shape: spans, an order, and no x or y anywhere. */
  const legacy = (widgets: unknown[]) => ({
    boards: [
      {
        id: 'old',
        name: 'Old board',
        description: '',
        status: 'published',
        updated: '2026-01-01',
        widgets,
      },
    ],
    editingId: 'old',
  })

  const migrate = (widgets: unknown[]) => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy(widgets)))
    return loadState(seed)
  }

  beforeEach(stubStorage)

  test('a span becomes a width and the order becomes a position', () => {
    const state = migrate([
      { ...spec('a'), span: 3 },
      { ...spec('b'), span: 9 },
      { ...spec('c'), span: 12 },
    ])

    // Two widgets filling a row, then one that cannot fit beside them.
    expect(widgetOn(state, 'a', 'old')).toMatchObject({ x: 0, y: 0, w: 3 })
    expect(widgetOn(state, 'b', 'old')).toMatchObject({ x: 3, y: 0, w: 9 })
    expect(widgetOn(state, 'c', 'old')).toMatchObject({ x: 0, w: 12 })
    expect(widgetOn(state, 'c', 'old').y).toBeGreaterThan(0)
  })

  test('a dragged pixel height becomes rows', () => {
    // 300px is 8 rows at this pitch. Dividing by ROW_HEIGHT alone would say 13.
    const state = migrate([{ ...spec('a'), span: 8, height: 300 }])
    expect(widgetOn(state, 'a', 'old').h).toBe(8)
  })

  test('a widget that was never resized takes its type default', () => {
    /*
     * This is the property the old model had and the new one cannot: `span` and
     * `height` were optional, and absent meant "whatever this type is worth".
     * Migration is the last moment that indirection exists, so it has to be
     * resolved here rather than left as a hole.
     */
    const state = migrate([{ ...spec('a'), typeId: 'data-table' }])
    expect(widgetOn(state, 'a', 'old')).toMatchObject({ w: 8, h: 8 })
  })

  test('nothing overlaps after a migration', () => {
    const state = migrate(
      [3, 3, 3, 3, 8, 4, 5, 3, 4, 12].map((span, index) => ({ ...spec(`w${index}`), span })),
    )
    const widgets = placedWidgets(state.boards[0])
    for (const [i, item] of widgets.entries()) {
      for (const other of widgets.slice(i + 1)) expect(collides(item, other)).toBe(false)
    }
  })

  test('the old keys do not survive', () => {
    const state = migrate([{ ...spec('a'), span: 3, height: 300 }])
    const migrated = widgetOn(state, 'a', 'old') as unknown as Record<string, unknown>
    expect('span' in migrated).toBe(false)
    expect('height' in migrated).toBe(false)
  })

  test('which board was open survives', () => {
    expect(migrate([{ ...spec('a'), span: 3 }]).editingId).toBe('old')
  })

  test('a current session wins over the legacy one', () => {
    // Both keys exist after a migration: v1 is left in place as the way back.
    // Reading it in preference to the current key would silently discard
    // every later edit.
    localStorage.setItem(LEGACY_KEY, JSON.stringify(legacy([{ ...spec('a'), span: 3 }])))
    saveState({ boards: [board({ id: 'current' })], editingId: null })
    expect(loadState(seed).boards.map((entry) => entry.id)).toEqual(['current'])
  })

  test('the legacy key is left alone rather than cleared', () => {
    const raw = JSON.stringify(legacy([{ ...spec('a'), span: 3 }]))
    localStorage.setItem(LEGACY_KEY, raw)
    loadState(seed)
    expect(localStorage.getItem(LEGACY_KEY)).toBe(raw)
  })

  test('a board missing one position is reflowed entirely', () => {
    /*
     * All-or-nothing, deliberately. A layout with a hole in it is not a layout
     * worth half-trusting: keeping the positions that survived would leave the
     * repaired widget overlapping one of them.
     */
    localStorage.setItem(
      KEY,
      JSON.stringify({
        boards: [
          board({
            id: 'holed',
            placed: [
              { ...widget('a'), x: 9, y: 4 },
              { ...widget('b'), y: undefined as unknown as number },
            ],
          }),
        ],
        editingId: null,
      }),
    )

    const state = loadState(seed)
    expect(widgetOn(state, 'a', 'holed')).toMatchObject({ x: 0, y: 0 })
    expect(widgetOn(state, 'b', 'holed')).toMatchObject({ x: 4, y: 0 })
  })
})

/**
 * Migrating v2 — same shape, renamed vocabulary.
 *
 * Nothing about a v2 board's structure changed: it already had free placement.
 * What changed is that adopting the FRD's Visualization Type ids renamed seven
 * of them, and `typeId` is *persisted*. Without translation every bar chart,
 * gauge, Gantt and status tile on every saved board becomes an error card
 * reading "No widget type 'bar-vertical'" — a silent break that would only show
 * up on somebody's own saved work, which is the worst place to find it.
 */
describe('migration from v2', () => {
  const V2_KEY = 'analytics.boards.v2'
  const KEY = 'analytics.boards.v4'
  const seed = [board({ id: 'seeded' })]

  /** A v2 board: positioned already, but speaking the module's old vocabulary. */
  const v2 = (widgets: unknown[]) => ({
    boards: [
      {
        id: 'old',
        name: 'Old board',
        description: '',
        status: 'published',
        updated: '2026-01-01',
        widgets,
      },
    ],
    editingId: 'old',
  })

  const migrate = (widgets: unknown[]) => {
    localStorage.setItem(V2_KEY, JSON.stringify(v2(widgets)))
    return loadState(seed)
  }

  const placed = (id: string, typeId: string, extra: Record<string, unknown> = {}) => ({
    ...spec(id),
    typeId,
    x: 0,
    y: 0,
    w: 4,
    h: 7,
    ...extra,
  })

  beforeEach(stubStorage)

  test('every renamed id becomes the one the catalogue knows', () => {
    const state = migrate(
      Object.keys(RENAMED_TYPES).map((old, index) =>
        placed(`w${index}`, old, { x: 0, y: index * 7 }),
      ),
    )

    const got = placedWidgets(state.boards[0]).map((entry) => entry.typeId)
    expect(got).toEqual(Object.values(RENAMED_TYPES))
    // The point of the exercise: all of them resolve to a real widget type.
    for (const typeId of got) expect(widgetType(typeId)).toBeDefined()
  })

  test('a renamed widget keeps the placement it was saved with', () => {
    // The rename must not disturb the layout. Falling back to the type's
    // defaults here would quietly re-lay-out a board somebody had arranged.
    const state = migrate([placed('a', 'bar-vertical', { x: 5, y: 3, w: 6, h: 9 })])
    expect(widgetOn(state, 'a', 'old')).toMatchObject({
      typeId: 'bar-chart-vertical',
      x: 5,
      y: 3,
      w: 6,
      h: 9,
    })
  })

  test('an id that was never renamed is untouched', () => {
    const state = migrate([placed('a', 'line-chart', { x: 2, y: 1 })])
    expect(widgetOn(state, 'a', 'old')).toMatchObject({ typeId: 'line-chart', x: 2, y: 1 })
  })

  test('a renamed widget with no size falls back to its *new* type, not the generic default', () => {
    /*
     * This is why `renamed` runs before `sized`. A widget still carrying
     * `status-tile` misses the catalogue, so it would take the 4-column, 268px
     * generic default instead of the 3-column, 132px a status indicator asks
     * for — the board would come back subtly wrong rather than obviously broken.
     */
    const state = migrate([{ ...spec('a'), typeId: 'status-tile', x: 0, y: 0 }])
    const widget = widgetOn(state, 'a', 'old')!
    expect(widget.typeId).toBe('status-indicator')
    expect(widget.w).toBe(widgetType('status-indicator')!.defaultSpan)
    expect(widget.h).toBe(rowsForPx(heightForType('status-indicator')))
  })

  test('a current session wins over the v2 one', () => {
    localStorage.setItem(V2_KEY, JSON.stringify(v2([placed('a', 'bar-vertical')])))
    saveState({ boards: [board({ id: 'current' })], editingId: null })
    expect(loadState(seed).boards.map((entry) => entry.id)).toEqual(['current'])
  })

  test('the v2 key is left alone rather than cleared', () => {
    // Same rule as v1: the previous key is the way back, and it costs kilobytes.
    const raw = JSON.stringify(v2([placed('a', 'bar-vertical')]))
    localStorage.setItem(V2_KEY, raw)
    loadState(seed)
    expect(localStorage.getItem(V2_KEY)).toBe(raw)
  })

  test('a v1 board carrying old type ids is renamed as well as reflowed', () => {
    // The two migrations compose: v1 boards predate the rename by definition, so
    // one that flows through `flowLayout` must still come out speaking v3.
    localStorage.setItem(
      'analytics.boards.v1',
      JSON.stringify({
        boards: [
          {
            id: 'ancient',
            name: 'Ancient',
            description: '',
            status: 'published',
            updated: '2026-01-01',
            widgets: [{ ...spec('a'), typeId: 'gantt-chart', span: 6 }],
          },
        ],
        editingId: null,
      }),
    )

    const state = loadState(seed)
    expect(widgetOn(state, 'a', 'ancient')).toMatchObject({
      typeId: 'timeline-chart',
      x: 0,
      y: 0,
      w: 6,
    })
  })

  test('saving writes the current key, never the old one', () => {
    saveState({ boards: [board({ id: 'x' })], editingId: null })
    expect(localStorage.getItem(KEY)).not.toBeNull()
    expect(localStorage.getItem(V2_KEY)).toBeNull()
  })
})

/**
 * Scope and Share Grants — FR-DA-01 to FR-DA-07.
 *
 * Merge Plan Stage 6.2. The access *rules* are `access/dashboard-access.ts` and
 * have their own tests; these are about the board carrying the right thing, and
 * about the two decisions that are easy to get backwards.
 */
describe('scope', () => {
  test('a new board is Personal', () => {
    // FR-DA-02. A new board is empty and half-thought-through; defaulting it to
    // anything wider makes sharing the thing you have to remember to switch off.
    const next = boardsReducer(stateWith(), {
      type: 'create-board',
      id: 'new',
      authorId: AUTHOR,
      at: AT,
    })
    expect(next.boards[0].scope).toEqual({ kind: 'personal' })
  })

  test('a new board records who wrote it', () => {
    const next = boardsReducer(stateWith(), {
      type: 'create-board',
      id: 'new',
      authorId: 'someone-else',
      at: AT,
    })
    expect(next.boards[0].authorId).toBe('someone-else')
  })

  test('setting a Scope does not publish, and publishing does not set a Scope', () => {
    /*
     * Finding 9, which the FRD never states and whose wrong reading is the more
     * intuitive one. Publishing means "I have finished reviewing", not "everyone
     * may see it" — fold them together and a board published at Personal Scope
     * silently breaks FR-DA-02.
     */
    const scoped = boardsReducer(stateWith(board()), {
      type: 'set-scope',
      id: 'b1',
      scope: { kind: 'organization-wide' },
      at: AT,
    })
    expect(scoped.boards[0].status).toBe('draft')
    expect(scoped.boards[0].scope).toEqual({ kind: 'organization-wide' })

    const published = boardsReducer(scoped, {
      type: 'set-status',
      id: 'b1',
      status: 'published',
      at: AT,
    })
    expect(published.boards[0].scope).toEqual({ kind: 'organization-wide' })
  })

  test('an organizational Scope keeps the label it was given', () => {
    // The id is IAM's; the label is what a person reads. Storing only the id
    // would mean the sharing UI could not name the scope without a lookup.
    const next = boardsReducer(stateWith(board()), {
      type: 'set-scope',
      id: 'b1',
      scope: { kind: 'organizational-scope', scopeId: 'ops', label: 'Operations' },
      at: AT,
    })
    expect(next.boards[0].scope).toEqual({
      kind: 'organizational-scope',
      scopeId: 'ops',
      label: 'Operations',
    })
  })
})

describe('share grants', () => {
  const grant = (recipientId: string, id = `g-${recipientId}`) => ({
    id,
    recipientKind: 'individual' as const,
    recipientId,
    recipientLabel: recipientId,
  })

  test('a grant is added to the board', () => {
    const next = boardsReducer(stateWith(board()), {
      type: 'add-grant',
      id: 'b1',
      grant: grant('ada'),
      at: AT,
    })
    expect(next.boards[0].shareGrants.map((entry) => entry.recipientId)).toEqual(['ada'])
  })

  test('granting the same recipient twice changes nothing', () => {
    // Two grants naming one person is not twice the access; it is a list with a
    // duplicate in it, and the sharing UI would show them the same name twice.
    const once = boardsReducer(stateWith(board()), {
      type: 'add-grant',
      id: 'b1',
      grant: grant('ada'),
      at: AT,
    })
    const twice = boardsReducer(once, {
      type: 'add-grant',
      id: 'b1',
      grant: grant('ada', 'g-other'),
      at: AT,
    })
    expect(twice.boards[0].shareGrants).toHaveLength(1)
    expect(twice.boards[0]).toBe(once.boards[0])
  })

  test('removing the last grant restores the whole Scope', () => {
    /*
     * FR-DA-07 — a Grant *refines* who within the Scope sees the board, it never
     * extends beyond it. So no grants means everyone in Scope, not nobody, and
     * removing the last one has to return to that rather than to an empty set.
     * This is the assertion; `canViewDashboard` is where the rule lives.
     */
    const granted = boardsReducer(stateWith(board({ scope: { kind: 'organization-wide' } })), {
      type: 'add-grant',
      id: 'b1',
      grant: grant('ada'),
      at: AT,
    })
    const removed = boardsReducer(granted, {
      type: 'remove-grant',
      id: 'b1',
      grantId: 'g-ada',
      at: AT,
    })

    expect(removed.boards[0].shareGrants).toEqual([])
    expect(removed.boards[0].scope).toEqual({ kind: 'organization-wide' })
  })
})

/**
 * Migrating v3 — widgets stop being embedded.
 *
 * Finding 4, and D10 ends here. A v3 board held its widgets in an array; a
 * Dashboard holds a widget record and a placement list, because a Widget saved
 * to the Widget Library has identity independent of any one Dashboard.
 */
describe('migration from v3', () => {
  const V3_KEY = 'analytics.boards.v3'
  const KEY = 'analytics.boards.v4'
  const seed = [board({ id: 'seeded' })]

  const v3 = (widgets: unknown[]) => ({
    boards: [
      {
        id: 'old',
        name: 'Old board',
        description: '',
        status: 'published',
        updated: '2026-01-01',
        widgets,
      },
    ],
    editingId: 'old',
  })

  const migrate = (widgets: unknown[]) => {
    localStorage.setItem(V3_KEY, JSON.stringify(v3(widgets)))
    return loadState(seed, AUTHOR)
  }

  beforeEach(stubStorage)

  test('an embedded array becomes a record and a placement list', () => {
    const state = migrate([widget('a', 4, 7), { ...widget('b', 8, 7), x: 4 }])
    const migrated = state.boards.find((entry) => entry.id === 'old')!

    expect(Object.keys(migrated.widgets).sort()).toEqual(['a', 'b'])
    expect(migrated.placements.map((entry) => entry.widgetId).sort()).toEqual(['a', 'b'])
    // And the widget records carry no placement any more.
    expect('x' in migrated.widgets.a).toBe(false)
  })

  test('the board still looks like the board you left', () => {
    const state = migrate([widget('a', 4, 7), { ...widget('b', 8, 7), x: 4 }])
    expect(widgetOn(state, 'a', 'old')).toMatchObject({ x: 0, y: 0, w: 4, h: 7 })
    expect(widgetOn(state, 'b', 'old')).toMatchObject({ x: 4, y: 0, w: 8, h: 7 })
  })

  test('a migrated board belongs to whoever migrated it', () => {
    // Not a guess: these come out of this browser's own storage, so the only
    // person who has ever had them is the one reading them now.
    const state = migrate([widget('a')])
    expect(state.boards.find((entry) => entry.id === 'old')!.authorId).toBe(AUTHOR)
  })

  test('a migrated board is Personal, never wider', () => {
    /*
     * The decision that matters. Before Scopes existed everyone saw everything,
     * so organization-wide would "preserve behaviour" — by asserting something
     * the migration cannot know. A migration must never widen visibility, and
     * Personal costs the migrating Author nothing, because an Author always sees
     * their own boards whatever the Scope says.
     */
    const state = migrate([widget('a')])
    expect(state.boards.find((entry) => entry.id === 'old')!.scope).toEqual({ kind: 'personal' })
  })

  test('a v3 board that already had a Scope keeps it', () => {
    localStorage.setItem(
      V3_KEY,
      JSON.stringify({
        boards: [
          {
            ...v3([widget('a')]).boards[0],
            scope: { kind: 'organization-wide' },
            authorId: 'ada',
          },
        ],
        editingId: null,
      }),
    )
    const state = loadState(seed, AUTHOR)
    const migrated = state.boards.find((entry) => entry.id === 'old')!
    expect(migrated.scope).toEqual({ kind: 'organization-wide' })
    expect(migrated.authorId).toBe('ada')
  })

  test('the v3 key is left alone rather than cleared', () => {
    const raw = JSON.stringify(v3([widget('a')]))
    localStorage.setItem(V3_KEY, raw)
    loadState(seed, AUTHOR)
    expect(localStorage.getItem(V3_KEY)).toBe(raw)
  })

  test('saving writes v4', () => {
    saveState({ boards: [board({ id: 'x' })], editingId: null })
    expect(localStorage.getItem(KEY)).not.toBeNull()
    expect(localStorage.getItem(V3_KEY)).toBeNull()
  })

  test('a placement pointing at a widget that is gone drops out', () => {
    // Storage can be edited, and a dangling reference is the failure mode a
    // referenced model introduces. It renders as nothing rather than as an
    // error card for a widget nobody can name.
    localStorage.setItem(
      KEY,
      JSON.stringify({
        boards: [
          {
            ...board({ id: 'dangling', placed: [widget('a')] }),
            placements: [
              { widgetId: 'a', x: 0, y: 0, w: 4, h: 4 },
              { widgetId: 'ghost', x: 4, y: 0, w: 4, h: 4 },
            ],
          },
        ],
        editingId: null,
      }),
    )

    const state = loadState(seed, AUTHOR)
    expect(ids(state, 'dangling')).toEqual(['a'])
  })
})
