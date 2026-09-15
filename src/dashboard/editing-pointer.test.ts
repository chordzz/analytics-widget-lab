/**
 * Which board you had open, across a reload.
 *
 * This exists because removing it was not neutral. `LocalBoardStore` persisted
 * `editingId` as part of whole state; the HTTP store cannot, because the API has
 * no field for it and should not — it is a property of this browser, not of the
 * Dashboard. Dropping it meant a reload mid-build landed on an empty canvas and
 * left a stray draft behind, with the real work safe but nowhere the Author
 * would think to look.
 *
 * Two properties carry the weight: the pointer holds the id the *server* knows,
 * and it is validated against what actually came back.
 */

import { describe, expect, test } from 'bun:test'
import { httpBoardStore } from './http-board-store'
import { browserEditingPointer, memoryEditingPointer } from './editing-pointer'
import { createApiClient } from '../api/client'
import type { Board } from '../analytics/builder/boards'

const board = (id: string, name = 'Finance daily'): Board => ({
  id,
  name,
  description: '',
  authorId: 'u1',
  scope: { kind: 'personal' },
  shareGrants: [],
  status: 'draft',
  updated: '2026-09-15',
  widgets: {},
  placements: [],
  controls: [],
  sections: [],
})

/** Replies with `listed` to a GET, and assigns `assignedId` to a POST. */
function storeWith(listed: unknown[], pointer = memoryEditingPointer(), assignedId = 'srv-9') {
  const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET'
    const data = method === 'POST' ? { id: assignedId } : listed
    return Promise.resolve(
      new Response(JSON.stringify({ status: true, message: 'OK', data }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
  }) as typeof globalThis.fetch

  const api = createApiClient({
    baseUrl: 'https://api.example.test',
    fetch: fetchImpl,
    onDiagnostic: () => {},
  })

  return { store: httpBoardStore(api, { editingPointer: pointer }), pointer }
}

const listedBoard = (id: string) => ({
  id,
  name: 'Finance daily',
  status: 'draft',
  scope_level: 'personal',
  widgets: [],
})

describe('the board you had open comes back', () => {
  test('a remembered board is reopened on load', async () => {
    const { store } = storeWith([listedBoard('srv-1')], memoryEditingPointer('srv-1'))
    expect((await store.load([], 'u1')).editingId).toBe('srv-1')
  })

  test('opening one writes the pointer', async () => {
    // Loaded first, so the board is one the server already holds. Saving a board
    // the store has never seen is a create, and a create is the next group.
    const { store, pointer } = storeWith([listedBoard('srv-1')])
    await store.load([], 'u1')
    await store.save({ boards: [board('srv-1')], editingId: 'srv-1' })
    expect(pointer.read()).toBe('srv-1')
  })

  test('closing one clears it', async () => {
    const { store, pointer } = storeWith([listedBoard('srv-1')], memoryEditingPointer('srv-1'))
    await store.load([], 'u1')
    await store.save({ boards: [board('srv-1')], editingId: null })
    expect(pointer.read()).toBeNull()
  })
})

describe('it holds the id the server knows', () => {
  test('a board created this session is remembered under its assigned id', async () => {
    /*
     * The subtle one. A new board is called `local:board-xyz` until the POST
     * answers, and the map between the two names is held for the session only.
     * A pointer written under the local name would be stale the moment the page
     * reloaded — which is the one moment it is read.
     */
    const { store, pointer } = storeWith([], memoryEditingPointer(), 'srv-42')
    await store.save({ boards: [board('local:board-xyz')], editingId: 'local:board-xyz' })
    expect(pointer.read()).toBe('srv-42')
  })

  test('and that id is what the next load matches against', async () => {
    const { store } = storeWith([listedBoard('srv-42')], memoryEditingPointer('srv-42'))
    expect((await store.load([], 'u1')).editingId).toBe('srv-42')
  })
})

describe('a pointer is validated, never trusted', () => {
  test('one naming a board that did not come back is ignored', async () => {
    /*
     * It outlives the session that wrote it, so it can name a board since
     * deleted, one belonging to whoever used this browser last, or one this
     * viewer may no longer see. All three look the same from here: absent.
     */
    const { store } = storeWith([listedBoard('srv-1')], memoryEditingPointer('srv-gone'))
    expect((await store.load([], 'u1')).editingId).toBeNull()
  })

  test('and it is cleared rather than left to fail again', async () => {
    const pointer = memoryEditingPointer('srv-gone')
    const { store } = storeWith([listedBoard('srv-1')], pointer)
    await store.load([], 'u1')
    expect(pointer.read()).toBeNull()
  })

  test('a valid pointer is left alone', async () => {
    const pointer = memoryEditingPointer('srv-1')
    const { store } = storeWith([listedBoard('srv-1')], pointer)
    await store.load([], 'u1')
    expect(pointer.read()).toBe('srv-1')
  })

  test('no pointer means no board open', async () => {
    const { store } = storeWith([listedBoard('srv-1')])
    expect((await store.load([], 'u1')).editingId).toBeNull()
  })
})

describe('storage that is unavailable is not a crash', () => {
  /** A `Storage`-shaped object; bun has no DOM. */
  const fakeStorage = (seed: Record<string, string> = {}) => {
    const held = new Map(Object.entries(seed))
    return {
      storage: {
        getItem: (key: string) => held.get(key) ?? null,
        setItem: (key: string, value: string) => void held.set(key, value),
        removeItem: (key: string) => void held.delete(key),
      } as unknown as Storage,
      held,
    }
  }

  test('it round-trips through real storage', () => {
    const { storage, held } = fakeStorage()
    const pointer = browserEditingPointer(storage)
    pointer.write('srv-1')
    expect(pointer.read()).toBe('srv-1')
    expect([...held.keys()]).toEqual(['smc.analytics.editing.v1'])
  })

  test('null removes the key rather than storing "null"', () => {
    // Otherwise the string would read back as a board id and never match.
    const { storage, held } = fakeStorage({ 'smc.analytics.editing.v1': 'srv-1' })
    browserEditingPointer(storage).write(null)
    expect(held.size).toBe(0)
  })

  test('an empty string is not a board id', () => {
    const { storage } = fakeStorage({ 'smc.analytics.editing.v1': '' })
    expect(browserEditingPointer(storage).read()).toBeNull()
  })

  test('no storage at all degrades to nothing open', () => {
    // Private mode, blocked site data, some webviews. Landing on the dashboard
    // list is a smaller cost than interrupting the session.
    const pointer = browserEditingPointer(null)
    expect(() => pointer.write('srv-1')).not.toThrow()
    expect(pointer.read()).toBeNull()
  })

  test('storage that throws is treated the same way', () => {
    const hostile = {
      getItem() {
        throw new Error('denied')
      },
      setItem() {
        throw new Error('denied')
      },
      removeItem() {
        throw new Error('denied')
      },
    } as unknown as Storage

    const pointer = browserEditingPointer(hostile)
    expect(pointer.read()).toBeNull()
    expect(() => pointer.write('srv-1')).not.toThrow()
    expect(() => pointer.write(null)).not.toThrow()
  })
})
