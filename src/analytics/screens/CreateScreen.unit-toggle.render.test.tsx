/**
 * The currency toggle, offered from the live composer — not only the script.
 *
 * `unitOptions` was only ever set by the one-off script that built Peniremit's
 * four original boards. A Widget composed by hand in the product itself never
 * got one, however many currencies its Dataset published — nothing in that
 * path computed it. This drives the real composer end to end, through
 * `CreateScreen.commit`, and checks what actually lands on the stored Widget.
 */

import { describe, expect, test } from 'bun:test'
import { mount } from '../../test/mount'
import { AnalyticsDataProvider } from '../data/AnalyticsData'
import { BoardsProvider, useBoards } from '../builder/useBoards'
import { ComposeIntentProvider } from '../builder/useComposeIntent'
import { CreateScreen } from './CreateScreen'
import type { Board, BoardsState } from '../builder/boards'
import type { BoardStorePort } from '../builder/store'
import type { CataloguePort, DatasetSummary } from '../../catalogue/port'
import type { Dataset } from '../../domain/dataset'
import type { TaxonomyEntry } from '../../catalogue/port'

const MONEY: Dataset = {
  id: 'money',
  name: 'Money',
  description: 'A figure published in two currencies.',
  sourceSystem: 'fixture',
  classification: 'internal',
  exposesPersonalData: false,
  fields: [
    { key: 'usd', label: 'USD', filterable: false, sortable: false, role: 'measure', aggregations: ['sum'] },
    { key: 'ngn', label: 'NGN', filterable: false, sortable: false, role: 'measure', aggregations: ['sum'] },
  ],
}

const SUMMARY: DatasetSummary = {
  id: MONEY.id,
  name: MONEY.name,
  description: MONEY.description,
  sourceSystem: MONEY.sourceSystem,
  classification: MONEY.classification,
  exposesPersonalData: MONEY.exposesPersonalData,
  dimensionCount: 0,
  timeDimensionCount: 0,
  measureCount: MONEY.fields.length,
}

const catalogue: CataloguePort = {
  browse: async () => [SUMMARY],
  describe: async (id) => (id === MONEY.id ? MONEY : null),
  visualizations: async (): Promise<TaxonomyEntry[]> => [
    { family: 'single-value', types: ['stat-card'], requirement: 'at least one Measure' },
  ],
}

const board = (over: Partial<Board> = {}): Board => ({
  id: 'b-1',
  name: 'Board',
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

const storeOf = (state: BoardsState): BoardStorePort => ({
  load: async () => state,
  save: async () => {},
  mintId: (prefix) => `${prefix}-test`,
  now: () => '2026-10-15',
})

/** Reads the board back out from the same provider tree, after the commit. */
function Probe({ seen }: { seen: (board: Board | undefined) => void }) {
  const boards = useBoards()
  seen(boards.editing)
  return null
}

describe('a Widget built through the composer is offered the currencies its Dataset has', () => {
  test('a stat card over Money gets unitOptions, without any script involved', async () => {
    let current: Board | undefined
    const screen = await mount(
      <AnalyticsDataProvider catalogue={catalogue}>
        <ComposeIntentProvider>
          <BoardsProvider store={storeOf({ boards: [board()], editingId: 'b-1' })}>
            <CreateScreen onNavigate={() => {}} />
            <Probe seen={(b) => (current = b)} />
          </BoardsProvider>
        </ComposeIntentProvider>
      </AnalyticsDataProvider>,
    )

    await screen.press('Add the first widget')
    await screen.pressStarting('Money')
    await screen.pressStarting('Stat card')
    await screen.press('Add to Board')

    const widget = Object.values(current?.widgets ?? {})[0]
    expect(widget?.unitOptions).toEqual(['usd', 'ngn'])
    screen.unmount()
  })
})
