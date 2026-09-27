/**
 * `published` is the authorized list, not the published-status list.
 *
 * `visibleDashboards` has its own tests and passes them; what had none is the
 * wiring — that `useBoards` actually routes `published` through the pass, and
 * that a board the Viewer may not see therefore cannot become the one
 * `DashboardsScreen` opens on. Derivation is asynchronous (authorization is a
 * port, and resolving a group Grant is a lookup), so a static render sees the
 * empty list it starts as and nothing after it.
 *
 * The consequence is worth the test rather than the reasoning. `published[0]`
 * is the default board on the Dashboards screen. Filtered by status alone, the
 * screen would open on somebody else's board — published, in a Scope this
 * Viewer is outside — as its first impression of the product.
 */

import { describe, expect, test } from 'bun:test'
import { mount } from '../../test/mount'
import { AnalyticsDataProvider } from '../data/AnalyticsData'
import { BoardsProvider, useBoards } from './useBoards'
import { DashboardsScreen } from '../screens/DashboardsScreen'
import type { Board, BoardsState } from './boards'
import type { BoardStorePort } from './store'
import type { AuthorizationPort } from '../../access/port'

const ME = 'local'

const board = (over: Partial<Board>): Board => ({
  id: 'b',
  name: 'Board',
  description: '',
  authorId: 'someone-else',
  status: 'published',
  scope: { kind: 'organization-wide' },
  shareGrants: [],
  updated: '2026-09-20',
  widgets: {},
  placements: [],
  controls: [],
  sections: [],
  ...over,
})

/** Outside one Scope, inside the other — the only decision these tests need. */
const authorization: AuthorizationPort = {
  mayConsumeDataset: async () => true,
  satisfiesScope: async (scope) => scope.kind !== 'organizational-scope',
  resolveRecipient: async () => [],
  mayAdministerCatalogue: async () => false,
  directory: async () => ({ individuals: [], groups: [] }),
}

const OUTSIDE = board({
  id: 'b-hidden',
  name: 'Not for me',
  scope: { kind: 'organizational-scope', scopeId: 'finance', label: 'Finance' },
})
const INSIDE = board({ id: 'b-open', name: 'Everyone can read this' })

/** Hidden first, so an unfiltered list would put it at `published[0]`. */
const STATE: BoardsState = { boards: [OUTSIDE, INSIDE], editingId: null }

const storeOf = (state: BoardsState): BoardStorePort => ({
  load: async () => state,
  save: async () => {},
  mintId: (prefix) => `${prefix}-test`,
  now: () => '2026-09-27',
})

function Probe({ seen }: { seen: (lists: { published: string[]; all: string[] }) => void }) {
  const boards = useBoards()
  seen({
    published: boards.published.map((entry) => entry.name),
    all: boards.boards.map((entry) => entry.name),
  })
  return null
}

describe('the list a Viewer is offered', () => {
  test('excludes a published board whose Scope they are outside', async () => {
    let lists = { published: [] as string[], all: [] as string[] }
    const screen = await mount(
      <AnalyticsDataProvider authorization={authorization} viewer={{ id: ME, displayName: 'Me' }}>
        <BoardsProvider store={storeOf(STATE)}>
          <Probe seen={(next) => (lists = next)} />
        </BoardsProvider>
      </AnalyticsDataProvider>,
    )

    expect(lists.published).toEqual(['Everyone can read this'])
    screen.unmount()
  })

  test('while the board itself is still in state, which is a different question', async () => {
    /*
     * `boards` is what the store returned; `published` is what this Viewer may
     * be shown. Conflating them would make the pass look redundant — it is
     * not, it is the only thing standing between the two.
     */
    let lists = { published: [] as string[], all: [] as string[] }
    const screen = await mount(
      <AnalyticsDataProvider authorization={authorization} viewer={{ id: ME, displayName: 'Me' }}>
        <BoardsProvider store={storeOf(STATE)}>
          <Probe seen={(next) => (lists = next)} />
        </BoardsProvider>
      </AnalyticsDataProvider>,
    )

    expect(lists.all).toEqual(['Not for me', 'Everyone can read this'])
    screen.unmount()
  })
})

describe('the board the Dashboards screen opens on', () => {
  test('is never one the Viewer may not see', async () => {
    /*
     * The consequence. `published[0]` is the default, and the hidden board is
     * first in state — so a `published` filtered by status alone would open
     * the product on a board in a Scope this Viewer is outside.
     */
    const screen = await mount(
      <AnalyticsDataProvider authorization={authorization} viewer={{ id: ME, displayName: 'Me' }}>
        <BoardsProvider store={storeOf(STATE)}>
          <DashboardsScreen onNavigate={() => {}} />
        </BoardsProvider>
      </AnalyticsDataProvider>,
    )

    const selected = [...screen.container.querySelectorAll('button.a-button--primary')].map(
      (button) => (button.textContent ?? '').trim(),
    )
    expect(selected).toEqual(['Everyone can read this'])
    screen.unmount()
  })
})
