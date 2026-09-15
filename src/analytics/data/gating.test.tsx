/**
 * The affordances, as someone with a partial permission set sees them.
 *
 * `permissions.test.ts` proves the *decision*; this proves the **chrome obeys
 * it** — different claims, and only the second is what anyone experiences. A
 * resolver that answers `denied` into a button nobody disabled has satisfied its
 * tests and changed nothing.
 *
 * The asymmetry under test throughout: an unknown permission set offers
 * everything. The API enforces regardless, so a wrongly offered button costs one
 * `403`, and a wrongly hidden one costs somebody the product with nothing on
 * screen to explain why.
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ModuleShell } from '../shell/ModuleShell'
import { AnalyticsDataProvider } from './AnalyticsData'
import { BoardsProvider } from '../builder/useBoards'
import { SharePanel } from '../builder/SharePanel'

/*
 * Through `data`, not through a provider wrapped around the shell. `ModuleShell`
 * builds its own `AnalyticsDataProvider`, so an outer one is shadowed and a test
 * written that way passes for the wrong reason — it renders the default,
 * permissive context and proves nothing. This is the path `SessionGate`
 * actually uses.
 */
const shellWith = (permissions?: Record<string, boolean>) =>
  renderToStaticMarkup(
    <ModuleShell
      data={{ permissions }}
      screen="dashboards"
      onNavigate={() => {}}
      theme="light"
      onToggleTheme={() => {}}
    />,
  )

/** The New dashboard button's own tag, whatever else the shell renders. */
const newDashboardButton = (markup: string): string => {
  const end = markup.indexOf('New dashboard')
  expect(end).toBeGreaterThan(-1)
  return markup.slice(markup.lastIndexOf('<button', end), end)
}

describe('creating a dashboard', () => {
  test('is offered when the permission is held', () => {
    expect(newDashboardButton(shellWith({ 'dashboard.create': true }))).not.toContain('disabled')
  })

  test('is offered when the permission set is unknown', () => {
    // IAM's lookup failed, or local-auth mode. The button is the whole product's
    // entry point and hiding it over a degraded lookup is the worse error.
    expect(newDashboardButton(shellWith(undefined))).not.toContain('disabled')
    expect(newDashboardButton(shellWith({}))).not.toContain('disabled')
  })

  test('is disabled when the map is populated and the key is not in it', () => {
    const button = newDashboardButton(shellWith({ 'dashboard.read': true }))
    expect(button).toContain('disabled')
  })

  test('and says why rather than simply refusing', () => {
    /*
     * The same rule the unavailable widget types follow. A control that is off
     * without a reason is indistinguishable from one that is broken, and the
     * person it happens to has no way to find out which.
     */
    const button = newDashboardButton(shellWith({ 'dashboard.read': true }))
    expect(button).toContain('permission')
  })

  test('the button is still present, not removed', () => {
    // Vanishing leaves someone wondering whether they misremembered where it
    // was. Disabled-and-explained answers the question they would have asked.
    expect(shellWith({ 'dashboard.read': true })).toContain('New dashboard')
  })
})

describe('a coarse write permission is enough', () => {
  test('`dashboard.write` offers creation', () => {
    // It appears in the API's own `/v1/me` example and matches no documented
    // route. Refusing to act on it would hide the product from whoever holds it.
    expect(newDashboardButton(shellWith({ 'dashboard.write': true }))).not.toContain('disabled')
  })
})

describe('changing who can see a board', () => {
  const board = {
    id: 'b1',
    name: 'Finance daily',
    description: '',
    authorId: 'someone-else',
    scope: { kind: 'organization-wide' } as const,
    shareGrants: [],
    status: 'published' as const,
    updated: '2026-09-15',
    widgets: {},
    placements: [],
    controls: [],
    sections: [],
  }

  const panelWith = (permissions?: Record<string, boolean>) =>
    renderToStaticMarkup(
      <AnalyticsDataProvider permissions={permissions}>
        <BoardsProvider>
          <SharePanel board={board} />
        </BoardsProvider>
      </AnalyticsDataProvider>,
    )

  test('the scope control is live when the permission is held', () => {
    expect(panelWith({ 'dashboard.share': true })).not.toContain('disabled')
  })

  test('and when the permission set is unknown', () => {
    expect(panelWith(undefined)).not.toContain('disabled')
  })

  test('the scope control is disabled when sharing is denied', () => {
    expect(panelWith({ 'dashboard.read': true })).toContain('disabled')
  })

  test('and the reason is said once, not on every control', () => {
    /*
     * Sharing is a single decision expressed through a select and a list of
     * names. The same sentence repeated on each row would bury it, so it sits
     * above them — the opposite treatment from the New dashboard button, which
     * is one control and carries its own.
     */
    const said = panelWith({ 'dashboard.read': true })
    const occurrences = said.split('do not have permission').length - 1
    expect(occurrences).toBe(1)
  })

  test('`dashboard.write` does not grant sharing', () => {
    // It changes who can see something rather than what it says, and the API
    // gives it a separate permission for that reason.
    expect(panelWith({ 'dashboard.write': true })).toContain('disabled')
  })
})
