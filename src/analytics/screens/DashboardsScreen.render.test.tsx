/**
 * Who is offered the edit affordances, asked of the screen itself.
 *
 * `dashboards-editing.test.tsx` states the rule and checks the statement:
 *
 *     const mayEdit = (permissions, authorId, viewerId) =>
 *       decide(permissions, 'dashboard.update') !== 'denied' && authorId === viewerId
 *
 * That is a copy of the line in `DashboardsScreen`, and a copy is what it
 * tests. Change the screen's gate and every assertion there still passes,
 * because nothing in that file renders the screen. The codebase already names
 * this trap, in `stateForWidget`: "left inline it could only be checked by a
 * test that restated it, which proves the copy and not the code."
 *
 * So these mount the real screen against a real store. The rule is worth the
 * care: the two gates fail differently on purpose — an unknown permission
 * *offers* the affordance, because the API enforces regardless and a hidden
 * button explains nothing, while authorship *withholds* it, because a board
 * reaches a reader through a Share Grant and a button that always ends in a
 * refusal is a button that does not work.
 */

import { describe, expect, test } from 'bun:test'
import { mount } from '../../test/mount'
import { AnalyticsDataProvider } from '../data/AnalyticsData'
import { BoardsProvider } from '../builder/useBoards'
import { DashboardsScreen } from './DashboardsScreen'
import type { Board, BoardsState } from '../builder/boards'
import type { BoardStorePort } from '../builder/store'

const ME = 'local'

const board = (over: Partial<Board> = {}): Board => ({
  id: 'b-1',
  name: 'Finance daily',
  description: '',
  authorId: ME,
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

const storeOf = (state: BoardsState, delayMs = 0): BoardStorePort => ({
  load: async () => {
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs))
    return state
  },
  save: async () => {},
  mintId: (prefix) => `${prefix}-test`,
  now: () => '2026-09-27',
})

const open = async (
  state: BoardsState,
  permissions?: Record<string, boolean>,
  delayMs = 0,
) => {
  const screen = await mount(
    <AnalyticsDataProvider permissions={permissions}>
      <BoardsProvider store={storeOf(state, delayMs)}>
        <DashboardsScreen onNavigate={() => {}} />
      </BoardsProvider>
    </AnalyticsDataProvider>,
  )
  return screen
}

const HELD = { 'dashboard.update': true }
const REFUSED = { 'dashboard.update': false }

const mine = { boards: [board()], editingId: null }
const theirs = { boards: [board({ authorId: 'someone-else' })], editingId: null }

describe('the Author is offered the affordances', () => {
  test('when the permission is held', async () => {
    const screen = await open(mine, HELD)
    expect(screen.buttons()).toContain('Edit widgets')
    expect(screen.buttons()).toContain('Board settings')
    screen.unmount()
  })

  test('and when the permission map is unknown', async () => {
    // IAM degraded must not read as a caller who may do nothing. The API
    // enforces on PATCH regardless, so the cost of being wrong here is one
    // refusal — against a feature silently missing with nothing to explain it.
    const screen = await open(mine, undefined)
    expect(screen.buttons()).toContain('Edit widgets')
    screen.unmount()
  })

  test('but not when it is explicitly refused', async () => {
    const screen = await open(mine, REFUSED)
    expect(screen.buttons()).not.toContain('Edit widgets')
    screen.unmount()
  })
})

describe('a reader of somebody else’s board is not', () => {
  test('however the permission reads', async () => {
    /*
     * Both directions, because this is the gate that does *not* fall back to
     * offering. A board arrives on a reader's screen through a Grant or a
     * Scope; the API is creator-only, so the button could only ever fail.
     */
    for (const permissions of [HELD, REFUSED, undefined]) {
      const screen = await open(theirs, permissions)
      expect(screen.buttons()).not.toContain('Edit widgets')
      expect(screen.buttons()).not.toContain('Board settings')
      screen.unmount()
    }
  })

  test('though the board itself is still there to read', async () => {
    // Withholding the affordance is not withholding the board.
    const screen = await open(theirs, HELD)
    expect(screen.buttons()).toContain('Finance daily')
    screen.unmount()
  })
})

describe('before the store has answered', () => {
  test('it says it is loading rather than that there is nothing', async () => {
    /*
     * "No dashboards yet" while the answer is in flight is a different and
     * more alarming claim than "not yet" — and it comes with a button to
     * create one, inviting a second board beside the one about to arrive.
     */
    const screen = await open({ boards: [], editingId: null }, HELD, 400)
    expect(screen.text()).toContain('Loading your boards')
    expect(screen.text()).not.toContain('No dashboards yet')
    screen.unmount()
  })

  test('and says there are none only once it knows', async () => {
    const screen = await open({ boards: [], editingId: null }, HELD)
    expect(screen.text()).toContain('No dashboards yet')
    screen.unmount()
  })
})
