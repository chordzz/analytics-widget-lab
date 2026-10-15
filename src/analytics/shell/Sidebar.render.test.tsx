/**
 * "Create dashboard" in the sidebar, as a person actually experiences it.
 *
 * The bug: the item read as an action and behaved as a bookmark. Every other
 * nav item is exactly that — a plain `onNavigate` to a screen that already
 * exists — and this one looked identical to them in the source, so it
 * inherited the same handler. But `create` is not a screen with fixed
 * content; it shows whichever board `editingId` already names, and the first
 * time anyone opens the builder that is whatever they were last editing. A
 * link labelled "Create dashboard" that reopens an old one is the one nav
 * item here where "just navigate" was never the right behaviour — which is
 * exactly why `NewDashboardButton`, elsewhere in this same shell, does not
 * use it either.
 */

import { useState } from 'react'
import { describe, expect, test } from 'bun:test'
import { mount } from '../../test/mount'
import { ModuleShell } from './ModuleShell'
import type { ScreenId } from './nav'
import type { Board, BoardsState } from '../builder/boards'
import type { BoardStorePort } from '../builder/store'

const EXISTING = 'Finance daily'

const board = (over: Partial<Board> = {}): Board => ({
  id: 'b-1',
  name: EXISTING,
  description: '',
  authorId: 'local',
  status: 'draft',
  scope: { kind: 'personal' },
  shareGrants: [],
  updated: '2026-10-15',
  widgets: {},
  placements: [],
  controls: [],
  sections: [],
  ...over,
})

const storeOf = (state: BoardsState): BoardStorePort => {
  let n = 0
  return {
    load: async () => state,
    save: async () => {},
    // Unique per call — `createBoard()` is pressed twice in one test here,
    // and a repeated id would collide in React's reconciliation as much as
    // it would on a real server.
    mintId: (prefix) => `${prefix}-test-${String(n++)}`,
    now: () => '2026-10-15',
  }
}

/** Holds the controlled `screen` prop `ModuleShell` expects from its host. */
function Harness({ store }: { store: BoardStorePort }) {
  const [screen, setScreen] = useState<ScreenId>('dashboards')
  return (
    <ModuleShell
      screen={screen}
      onNavigate={setScreen}
      theme="light"
      onToggleTheme={() => {}}
      boardStore={store}
      data={{ permissions: { 'dashboard.create': true } }}
    />
  )
}

/** The builder's title field, the way `CreateScreen.render.test.tsx` reads it. */
const titleValue = (screen: { container: HTMLElement }) =>
  (screen.container.querySelector('input.a-input') as HTMLInputElement | null)?.value

describe('"Create dashboard" in the sidebar', () => {
  test('opens a new board, not whichever one was last being edited', async () => {
    const store = storeOf({ boards: [board()], editingId: 'b-1' })
    const screen = await mount(<Harness store={store} />)

    await screen.press('Create dashboard')

    expect(titleValue(screen)).not.toBe(EXISTING)
    expect(titleValue(screen)).toBe('Untitled dashboard')
    screen.unmount()
  })

  test('a second click makes a second new board, not the same one again', async () => {
    /*
     * Not obviously desirable, but it is the one property that is cheap to
     * promise and lets the rest of the test suite's behaviour speak for
     * itself: "Create" always creates, the same way `NewDashboardButton`
     * already does, with no special-casing for "but I just made one".
     *
     * `CreateScreen` only ever shows the one board being edited, so the count
     * is read from the Dashboards screen's own tabs instead, after switching
     * to it.
     */
    const store = storeOf({ boards: [board()], editingId: 'b-1' })
    const screen = await mount(<Harness store={store} />)

    await screen.press('Create dashboard')
    await screen.press('Create dashboard')
    await screen.press('Dashboards')

    const untitled = [...screen.container.querySelectorAll('.a-tabs button')].filter((button) =>
      (button.textContent ?? '').includes('Untitled dashboard'),
    )
    expect(untitled).toHaveLength(2)
    screen.unmount()
  })
})
