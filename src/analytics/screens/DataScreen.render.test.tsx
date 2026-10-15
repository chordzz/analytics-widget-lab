/**
 * Searching the Data sources screen.
 *
 * The static-markup tests in `data-screen.test.tsx` cannot drive typing into a
 * field, so this is the one place the search box itself — narrowing the list,
 * clearing it, and the no-match state — gets exercised against a real render.
 */

import { describe, expect, test } from 'bun:test'
import { mount } from '../../test/mount'
import { AnalyticsDataProvider } from '../data/AnalyticsData'
import { BoardsProvider } from '../builder/useBoards'
import { ComposeIntentProvider } from '../builder/useComposeIntent'
import { DataScreen } from './DataScreen'

const open = async () => mount(
  <AnalyticsDataProvider>
    <ComposeIntentProvider>
      <BoardsProvider>
        <DataScreen onNavigate={() => {}} />
      </BoardsProvider>
    </ComposeIntentProvider>
  </AnalyticsDataProvider>,
)

describe('searching data sources', () => {
  test('narrows the list to datasets whose name or description matches', async () => {
    const screen = await open()
    const search = screen.container.querySelector('input.a-input') as HTMLInputElement
    await screen.typeInto(search, 'country')

    expect(screen.text()).toContain('Sales by country')
    expect(screen.text()).not.toContain('Revenue, monthly')
    screen.unmount()
  })

  test('clearing the search restores the full list', async () => {
    const screen = await open()
    const search = screen.container.querySelector('input.a-input') as HTMLInputElement
    await screen.typeInto(search, 'country')
    await screen.typeInto(search, '')

    expect(screen.text()).toContain('Sales by country')
    expect(screen.text()).toContain('Revenue, monthly')
    screen.unmount()
  })

  test('a term nothing matches says so, rather than showing an empty list', async () => {
    const screen = await open()
    const search = screen.container.querySelector('input.a-input') as HTMLInputElement
    await screen.typeInto(search, 'nonexistent-source')

    expect(screen.text()).toContain('Nothing matches')
    screen.unmount()
  })
})
