/**
 * The board store, asynchronously.
 *
 * Merge Plan Stage 5. The interesting failures here are all ordering failures,
 * and they are invisible against a store that answers instantly — which is
 * exactly why the port is `async` over localStorage rather than waiting for a
 * network to make them real.
 */

import { beforeEach, describe, expect, test } from 'bun:test'
import { LocalBoardStore } from './store'
import type { Board, BoardsState } from './boards'

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

const AUTHOR = 'local'

const board = (id: string): Board => ({
  id,
  name: id,
  description: '',
  authorId: AUTHOR,
  scope: { kind: 'personal' },
  shareGrants: [],
  status: 'draft',
  updated: '2026-01-01',
  widgets: {},
  placements: [],
  controls: [],
})

const state = (id: string): BoardsState => ({ boards: [board(id)], editingId: id })

describe('the store answers, rather than returning', () => {
  beforeEach(stubStorage)

  test('an empty store falls back to the seed', async () => {
    const store = new LocalBoardStore()
    const loaded = await store.load([board('seeded')], AUTHOR)
    expect(loaded.boards.map((entry) => entry.id)).toEqual(['seeded'])
  })

  test('a saved session round-trips', async () => {
    const store = new LocalBoardStore()
    await store.save(state('saved'))
    const loaded = await store.load([board('seeded')], AUTHOR)
    expect(loaded.boards.map((entry) => entry.id)).toEqual(['saved'])
    expect(loaded.editingId).toBe('saved')
  })

  test('a slow load still answers with what was saved', async () => {
    /*
     * The ordering failure this stands in for: a provider that seeds its state
     * and persists on change will write the seed over the saved session while
     * the load is still in flight. The provider guards against it by starting
     * empty and not persisting until the load has settled; this asserts the
     * store itself is not the thing losing the data.
     */
    const store = new LocalBoardStore(25)
    await store.save(state('saved'))

    const loading = store.load([board('seeded')], AUTHOR)
    expect(await loading).toMatchObject({ editingId: 'saved' })
  })
})

describe('identity and the clock belong to the store', () => {
  beforeEach(stubStorage)
  const store = new LocalBoardStore()

  test('ids are prefixed and unique', () => {
    const ids = new Set(Array.from({ length: 200 }, () => store.mintId('board')))
    expect(ids.size).toBe(200)
    for (const id of ids) expect(id.startsWith('board-')).toBe(true)
  })

  test('two prefixes never collide', () => {
    expect(store.mintId('w').startsWith('w-')).toBe(true)
    expect(store.mintId('board').startsWith('board-')).toBe(true)
  })

  test('the clock is a plain ISO date', () => {
    // `updated` is only ever displayed as a date, and a full timestamp would
    // invite comparisons across machines that nothing here can honour.
    expect(store.now()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
