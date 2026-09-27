/**
 * The builder screen, mounted.
 *
 * This file exists because of a test that was deleted. The authorship guard
 * had one, it passed, and it kept passing with the guard removed — a static
 * render never resolves the store's load, so `editing` is always undefined and
 * the screen returns before reaching any guard at all. Fake coverage of the
 * one rule on this screen that decides whether somebody else's dashboard can
 * be edited.
 *
 * The board now arrives from a port, which is the whole point: authorship is a
 * property of loaded state, so a test that never loads cannot see it.
 */

import { describe, expect, test } from 'bun:test'
import { mount } from '../../test/mount'
import { AnalyticsDataProvider } from '../data/AnalyticsData'
import { BoardsProvider } from '../builder/useBoards'
import { ComposeIntentProvider } from '../builder/useComposeIntent'
import { CreateScreen } from './CreateScreen'
import type { Board, BoardsState } from '../builder/boards'
import type { BoardStorePort } from '../builder/store'

const MINE = 'local'

const board = (over: Partial<Board> = {}): Board => ({
  id: 'b-1',
  name: 'Finance daily',
  description: '',
  authorId: MINE,
  status: 'draft',
  scope: { kind: 'personal' },
  shareGrants: [],
  updated: '2026-09-20',
  widgets: {},
  placements: [],
  controls: [],
  sections: [],
  ...over,
})

/** A store that answers with exactly this state, after an optional delay. */
const storeOf = (state: BoardsState, delayMs = 0) => {
  const saved: BoardsState[] = []
  const port: BoardStorePort = {
    load: async () => {
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
      return state
    },
    save: async (next) => {
      saved.push(next)
    },
    mintId: (prefix) => `${prefix}-test`,
    now: () => '2026-09-27',
  }
  return Object.assign(port, { saved })
}

const open = async (store: BoardStorePort) => {
  const navigated: string[] = []
  const screen = await mount(
    <AnalyticsDataProvider>
      <ComposeIntentProvider>
        <BoardsProvider store={store}>
          <CreateScreen onNavigate={(where) => navigated.push(where)} />
        </BoardsProvider>
      </ComposeIntentProvider>
    </AnalyticsDataProvider>,
  )
  return { screen, navigated }
}

describe('the builder belongs to the Author', () => {
  test("someone else's board is refused, and says so", async () => {
    /*
     * The rule this screen had no guard for. `editingId` is persisted, so a
     * board opened before the rule existed — or reached by typing the hash —
     * arrives with someone else's board loaded, and every affordance works
     * right up until `PATCH` refuses it. The save was always going to fail;
     * what was wrong is composing for ten minutes first.
     */
    const theirs = board({ id: 'b-2', authorId: 'someone-else', name: 'Not mine' })
    const { screen } = await open(storeOf({ boards: [theirs], editingId: 'b-2' }))

    expect(screen.text()).toContain('belongs to someone else')
    screen.unmount()
  })

  test('and the builder is not rendered behind the message', async () => {
    // Blanking the screen would be indistinguishable from one that broke, and
    // leaving the controls up would invite work that cannot be saved.
    const theirs = board({ id: 'b-2', authorId: 'someone-else', name: 'Not mine' })
    const { screen } = await open(storeOf({ boards: [theirs], editingId: 'b-2' }))

    expect(screen.text()).not.toContain('Add a widget')
    expect(screen.buttons()).toContain('Back to dashboards')
    screen.unmount()
  })

  test('it offers a way out rather than a dead end', async () => {
    const theirs = board({ id: 'b-2', authorId: 'someone-else' })
    const { screen, navigated } = await open(storeOf({ boards: [theirs], editingId: 'b-2' }))

    await screen.press('Back to dashboards')

    expect(navigated).toEqual(['dashboards'])
    screen.unmount()
  })

  test('my own board opens in the builder', async () => {
    const { screen } = await open(storeOf({ boards: [board()], editingId: 'b-1' }))

    expect(screen.text()).not.toContain('belongs to someone else')
    // The name is an editable field, and `textContent` does not include an
    // input's value — so the builder is confirmed by its own affordances.
    expect(screen.text()).toContain('Add widget')
    expect(
      (screen.container.querySelector('input') as HTMLInputElement | null)?.value,
    ).toBe('Finance daily')
    screen.unmount()
  })
})

describe('while the store is still answering', () => {
  test('it says so rather than showing an empty builder', async () => {
    const { screen } = await open(storeOf({ boards: [], editingId: null }, 400))
    expect(screen.text()).toContain('Loading your boards')
    screen.unmount()
  })

  /*
   * Deliberately not tested here: that CreateScreen refuses to create a board
   * while the store is still answering.
   *
   * Three attempts at it were green with the guard removed, and the third
   * explained why. `BoardsProvider` already refuses to write while loading,
   * and skips the first state change after it with a `settled` ref — so no
   * write reaches a store during a load whatever this screen does, and the
   * board created in the meantime is discarded when the load replaces local
   * state. The screen's own guard saves a wasted dispatch, which nothing
   * outside it can see.
   *
   * The bug it exists for — "a blank draft on every single visit" — needs a
   * store that round-trips across two mounts, which is a store test rather
   * than a screen one.
   */
})
