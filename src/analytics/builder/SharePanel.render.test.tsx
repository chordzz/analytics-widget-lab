/**
 * The Share panel, mounted — the half that `renderToStaticMarkup` cannot reach.
 *
 * The department list is filled by an effect: `groups` starts empty, a
 * `directory()` call resolves, `setGroups` runs, and only then does the block
 * render. Under static rendering none of that happens, so the list is absent
 * from the markup whatever the component does — an assertion that it appears
 * always fails, and one that it is absent always passes. Neither is a test,
 * and the second is worse because it stays green with the feature deleted.
 *
 * So these mount for real. What they pin is the behaviour that matters and was
 * previously unreachable: a department can be granted, it is granted *as a
 * group*, and a refused people search does not read as nobody.
 */

import { describe, expect, test } from 'bun:test'
import { mount } from '../../test/mount'
import { AnalyticsDataProvider } from '../data/AnalyticsData'
import { BoardsProvider, useBoards } from './useBoards'
import { SharePanel } from './SharePanel'
import type { AuthorizationPort, Directory } from '../../access/port'
import type { Board } from './boards'

const DEPARTMENTS = [
  { scopeId: 'dept-eng', label: 'Engineering' },
  { scopeId: 'dept-fin', label: 'Finance' },
]

/**
 * The live shape on an account that holds every Analytics permission:
 * departments come back, and a people search is refused by the directory.
 */
const asObserved = (over: Partial<Directory> = {}): AuthorizationPort => ({
  mayConsumeDataset: async () => true,
  satisfiesScope: async () => true,
  resolveRecipient: async () => [],
  mayAdministerCatalogue: async () => false,
  directory: async (query?: string) =>
    query === undefined || query.trim() === ''
      ? { individuals: [], groups: DEPARTMENTS }
      : { individuals: [], groups: [], peopleRefused: true, ...over },
})

/** Renders the panel against a board held by the provider, so edits are visible. */
function Harness({ seen }: { seen: (board: Board | undefined) => void }) {
  const boards = useBoards()
  const board = boards.published[0] ?? boards.drafts[0]
  seen(board)
  if (!board) return null
  return <SharePanel board={board} />
}

const open = async (authorization: AuthorizationPort) => {
  let current: Board | undefined
  const screen = await mount(
    <AnalyticsDataProvider authorization={authorization} permissions={{ 'dashboard.share': true }}>
      <BoardsProvider>
        <Harness seen={(board) => (current = board)} />
      </BoardsProvider>
    </AnalyticsDataProvider>,
  )
  return { screen, board: () => current }
}

describe('the department half of the picker', () => {
  test('departments are offered, because the directory serves them', async () => {
    const { screen } = await open(asObserved())
    expect(screen.rows()).toContain('Engineering')
    expect(screen.rows()).toContain('Finance')
    screen.unmount()
  })

  test('ticking one grants to the group, not to an individual', async () => {
    /*
     * The distinction the API cares about: `grantInputFrom` maps a `group`
     * recipient to `target_type: department`, and an `individual` to `user`.
     * Sending the department's id as a user would be accepted by our own code
     * and refused — or worse, silently misapplied — upstream.
     */
    const { screen, board } = await open(asObserved())
    await screen.click('Engineering')

    expect(board()?.shareGrants).toEqual([
      expect.objectContaining({
        recipientKind: 'group',
        recipientId: 'dept-eng',
        recipientLabel: 'Engineering',
      }),
    ])
    screen.unmount()
  })

  test('a department already granted is not offered again', async () => {
    const { screen } = await open(asObserved())
    await screen.click('Engineering')

    // Still listed once, as a granted row that can be unticked — never twice,
    // which would let an Author create a duplicate Grant for the same target.
    expect(screen.rows().filter((row) => row === 'Engineering')).toHaveLength(1)
    screen.unmount()
  })

  test('unticking it removes the Grant', async () => {
    const { screen, board } = await open(asObserved())
    await screen.click('Engineering')
    expect(board()?.shareGrants).toHaveLength(1)

    await screen.click('Engineering')
    expect(board()?.shareGrants).toEqual([])
    screen.unmount()
  })
})

describe('a refused people search', () => {
  /*
   * The bug this pins: the panel drew a 403 as "Nobody matching Ada", telling
   * an Author their colleague does not exist. Unreachable statically — the
   * message only appears after a search resolves, and a static render never
   * runs one.
   */
  test('says the search was refused, not that nobody matched', async () => {
    const { screen } = await open(asObserved())
    await screen.type('input[type="search"]', 'ada')
    await screen.settle()

    expect(screen.text()).toContain('do not have permission to search for people')
    expect(screen.text()).not.toContain('Nobody matching')
    screen.unmount()
  })

  test('and still offers the departments, which is what works today', async () => {
    const { screen } = await open(asObserved())
    await screen.type('input[type="search"]', 'ada')
    await screen.settle()

    expect(screen.rows()).toContain('Engineering')
    screen.unmount()
  })

  test('a search that genuinely matches nobody reads differently', async () => {
    const empty = asObserved()
    const authorization: AuthorizationPort = {
      ...empty,
      directory: async (query?: string) =>
        query === undefined || query.trim() === ''
          ? { individuals: [], groups: DEPARTMENTS }
          : { individuals: [], groups: [] },
    }
    const { screen } = await open(authorization)
    await screen.type('input[type="search"]', 'zzz')
    await screen.settle()

    expect(screen.text()).toContain('Nobody matching')
    expect(screen.text()).not.toContain('do not have permission to search')
    screen.unmount()
  })
})
