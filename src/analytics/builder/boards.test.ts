/**
 * Board operations.
 *
 * Reordering and duplication are the two that are easy to get subtly wrong and
 * hard to spot by eye — a drag that lands one position off looks like the drop
 * target was slightly out rather than like a bug in the splice.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import {
  boardsReducer,
  clampSpan,
  draftBoards,
  loadState,
  publishedBoards,
  saveState,
  MAX_SPAN,
  MIN_SPAN,
  type Board,
  type BoardsState,
} from './boards'
import { MAX_HEIGHT, MIN_HEIGHT } from './resize'
import type { WidgetSpec } from '../widgets/Widget'

const AT = '2026-08-12'

const widget = (id: string, span = 4): WidgetSpec => ({
  id,
  typeId: 'stat-card',
  datasetId: 'revenue-monthly',
  mapping: { value: 'revenue' },
  span,
})

const board = (overrides: Partial<Board> = {}): Board => ({
  id: 'b1',
  name: 'Board one',
  description: '',
  status: 'draft',
  updated: '2026-01-01',
  widgets: [widget('a'), widget('b'), widget('c')],
  ...overrides,
})

const stateWith = (...boards: Board[]): BoardsState => ({ boards, editingId: null })

const ids = (state: BoardsState, boardId = 'b1') =>
  state.boards.find((entry) => entry.id === boardId)!.widgets.map((entry) => entry.id)

describe('boards', () => {
  test('a new board is a draft, empty, and opened for editing', () => {
    const next = boardsReducer(stateWith(), { type: 'create-board', id: 'new', at: AT })
    expect(next.boards[0]).toMatchObject({ id: 'new', status: 'draft', widgets: [] })
    expect(next.editingId).toBe('new')
  })

  test('a new board goes to the top of the list', () => {
    const next = boardsReducer(stateWith(board()), { type: 'create-board', id: 'new', at: AT })
    expect(next.boards.map((entry) => entry.id)).toEqual(['new', 'b1'])
  })

  test('an unnamed board still has a name', () => {
    const next = boardsReducer(stateWith(), { type: 'create-board', id: 'new', name: '  ', at: AT })
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
    boardsReducer(state, { type: 'ensure-editing', id: 'made', at: AT })

  test('makes a board when there is nothing to adopt', () => {
    const next = ensure(stateWith(board({ id: 'full' })))
    expect(next.editingId).toBe('made')
    expect(next.boards.length).toBe(2)
  })

  test('is idempotent — dispatching twice does not make two boards', () => {
    // React's development double-invoke calls the arrival effect twice against
    // the same state. This is the guard that makes that harmless.
    const once = ensure(stateWith())
    const twice = boardsReducer(once, { type: 'ensure-editing', id: 'another', at: AT })
    expect(twice.boards.length).toBe(1)
    expect(twice.editingId).toBe('made')
  })

  test('adopts an existing blank draft rather than adding one', () => {
    const blank = board({ id: 'blank', widgets: [] })
    const next = ensure(stateWith(board({ id: 'full' }), blank))
    expect(next.editingId).toBe('blank')
    expect(next.boards.length).toBe(2)
  })

  test('never hijacks a board that has widgets on it', () => {
    const next = ensure(stateWith(board({ id: 'full' })))
    expect(next.editingId).not.toBe('full')
  })

  test('never adopts a published board, even an empty one', () => {
    const next = ensure(stateWith(board({ id: 'live', status: 'published', widgets: [] })))
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
      widget: widget('d'),
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
    const other = board({ id: 'b2', widgets: [widget('a')] })
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

describe('reordering', () => {
  const move = (from: number, to: number) =>
    ids(boardsReducer(stateWith(board()), { type: 'move-widget', boardId: 'b1', from, to, at: AT }))

  test('moving forwards lands at the target index', () => {
    expect(move(0, 2)).toEqual(['b', 'c', 'a'])
  })

  test('moving backwards lands at the target index', () => {
    expect(move(2, 0)).toEqual(['c', 'a', 'b'])
  })

  test('a one-step swap is a swap', () => {
    expect(move(0, 1)).toEqual(['b', 'a', 'c'])
  })

  test('moving onto itself changes nothing', () => {
    expect(move(1, 1)).toEqual(['a', 'b', 'c'])
  })

  test('an out-of-range source is ignored', () => {
    expect(move(9, 0)).toEqual(['a', 'b', 'c'])
    expect(move(-1, 0)).toEqual(['a', 'b', 'c'])
  })

  test('an over-far target clamps to the end rather than dropping the widget', () => {
    expect(move(0, 99)).toEqual(['b', 'c', 'a'])
  })
})

describe('resizing', () => {
  const spanOf = (span: number) =>
    boardsReducer(stateWith(board()), {
      type: 'resize-widget',
      boardId: 'b1',
      widgetId: 'a',
      span,
      at: AT,
    }).boards[0].widgets[0].span

  test('a span within range is kept', () => {
    expect(spanOf(6)).toBe(6)
  })

  test('a span outside the grid is clamped', () => {
    expect(spanOf(0)).toBe(MIN_SPAN)
    expect(spanOf(40)).toBe(MAX_SPAN)
  })

  test('clampSpan rounds to whole columns', () => {
    expect(clampSpan(4.4)).toBe(4)
    expect(clampSpan(4.6)).toBe(5)
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
  const KEY = 'analytics.boards.v1'
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

describe('resizing height', () => {
  const sized = (action: Partial<{ span: number; height: number }>) =>
    boardsReducer(stateWith(board()), {
      type: 'resize-widget',
      boardId: 'b1',
      widgetId: 'a',
      ...action,
      at: AT,
    }).boards[0].widgets[0]

  test('a height is stored on the widget', () => {
    expect(sized({ height: 300 }).height).toBe(300)
  })

  test('height is clamped to what a card can usefully be', () => {
    expect(sized({ height: 5 }).height).toBe(MIN_HEIGHT)
    expect(sized({ height: 5000 }).height).toBe(MAX_HEIGHT)
  })

  test('resizing one dimension leaves the other alone', () => {
    // The grip sends whichever axis moved; an omitted axis must not be read as
    // "set this to undefined" and silently reset the widget.
    const widened = boardsReducer(
      stateWith(board({ widgets: [{ ...widget('a'), span: 6, height: 300 }] })),
      { type: 'resize-widget', boardId: 'b1', widgetId: 'a', span: 8, at: AT },
    ).boards[0].widgets[0]

    expect(widened.span).toBe(8)
    expect(widened.height).toBe(300)
  })

  test('a widget with no stored height keeps having none', () => {
    // Absent means "use the type default", which is not the same as a number.
    expect(sized({ span: 6 }).height).toBeUndefined()
  })
})
