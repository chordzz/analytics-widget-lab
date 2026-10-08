/**
 * The retrieving Widget, mounted.
 *
 * `WidgetView` is pure — rows in, picture out — and is well covered by static
 * rendering. `Widget` is the wrapper that fetches, and everything interesting
 * about it happens after an effect: the Dataset is described by a port, rows
 * arrive from another, and the Viewer's own choices re-run the second one.
 *
 * Three behaviours here, each a bug that was fixed without a test because none
 * could be written: a unit toggle that must not re-query, a query key that
 * must not re-query on a re-render, and a board range that must clear only
 * what it governs.
 */

import { describe, expect, test } from 'bun:test'
import { mount } from '../../test/mount'
import { AnalyticsDataProvider } from '../data/AnalyticsData'
import { Widget } from './Widget'
import { datasetFrom } from '../../catalogue/api-dataset'
import type { CataloguePort } from '../../catalogue/port'
import type { DatasetRetrievalPort, RetrievalOutcome } from '../../retrieval/port'
import type { WidgetSpec } from './Widget'

const DATASET = datasetFrom({
  id: 'peniremit.revenue',
  name: 'Revenue',
  source_system_id: 'peniremit',
  time_dimension_field: 'date',
  fields: [
    { key: 'date', label: 'Date', type: 'date', role: 'dimension', filterable: true, orderable: true },
    { key: 'usd', label: 'USD', type: 'number', role: 'measure', aggregations: ['sum'], filterable: false, orderable: true },
    { key: 'ngn', label: 'NGN', type: 'number', role: 'measure', aggregations: ['sum'], filterable: false, orderable: true },
    { key: 'status', label: 'Status', type: 'category', role: 'dimension', filterable: true, orderable: true },
  ],
  filter_parameters: [
    { name: 'from', type: 'date', required: true },
    { name: 'to', type: 'date', required: true },
    { name: 'status', type: 'category', required: false, allowed_values: ['success', 'failed'] },
  ],
} as Parameters<typeof datasetFrom>[0])

const ROWS = [{ date: '2026-09-01', usd: 31, ngn: 47000, status: 'success' }]

/** Both ports, counting what they were asked. */
const ports = () => {
  const retrievals: unknown[] = []
  const catalogue: CataloguePort = {
    browse: async () => [],
    describe: async () => DATASET,
    visualizations: async () => [],
  }
  const retrieval: DatasetRetrievalPort = {
    retrieve: async (_id, query): Promise<RetrievalOutcome> => {
      retrievals.push(query)
      return { kind: 'rows', rows: ROWS, totalCount: 1 }
    },
    listFilterValues: async () => ['success', 'failed'],
  }
  return { catalogue, retrieval, retrievals }
}

const SPEC: WidgetSpec = {
  id: 'w-1',
  typeId: 'stat-card',
  datasetId: DATASET.id,
  title: 'Revenue',
  mapping: { value: 'usd' },
  unitOptions: ['usd', 'ngn'],
}

const show = async (spec: WidgetSpec = SPEC) => {
  const p = ports()
  const tree = (current: WidgetSpec) => (
    <AnalyticsDataProvider catalogue={p.catalogue} retrieval={p.retrieval}>
      <Widget spec={current} />
    </AnalyticsDataProvider>
  )
  const screen = await mount(tree(spec))
  return { screen, ...p, rerenderWith: (next: WidgetSpec) => screen.rerender(tree(next)) }
}

describe('the unit toggle draws a different column, it does not ask again', () => {
  test('both units are offered, labelled by their Fields', async () => {
    const { screen } = await show()
    expect(screen.buttons()).toContain('USD')
    expect(screen.buttons()).toContain('NGN')
    screen.unmount()
  })

  test('switching changes the figure', async () => {
    const { screen } = await show()
    const before = screen.text()

    await screen.press('NGN')

    expect(screen.text()).not.toBe(before)
    screen.unmount()
  })

  test('and costs no retrieval, because the column already came back', async () => {
    /*
     * The distinction the two controls sit either side of: a filter narrows
     * what is *asked for*, a unit changes which column is *drawn* from what
     * arrived. Re-querying here would put a network round trip behind a
     * toggle that needs none, on every card that offers one.
     */
    const { screen, retrievals } = await show()
    const asked = retrievals.length

    await screen.press('NGN')

    expect(retrievals.length).toBe(asked)
    screen.unmount()
  })
})

describe('a re-render is not a new question', () => {
  test('an equal-by-value spec does not re-query', async () => {
    /*
     * `placedWidgets` rebuilds every Widget object on every call, so the spec
     * is a new reference and value-equal each time. Keyed by identity, any
     * re-render of the screen above re-queried every card — invisible against
     * fixtures, and a board-wide flicker against HTTP, continuously while a
     * window is being resized.
     */
    const { screen, retrievals, rerenderWith } = await show()
    const asked = retrievals.length
    expect(asked).toBeGreaterThan(0)

    await rerenderWith({ ...SPEC, mapping: { ...SPEC.mapping } })

    expect(retrievals.length).toBe(asked)
    screen.unmount()
  })

  test('but a real change does', async () => {
    // The guard above is only worth having if it still notices an edit.
    const { screen, retrievals, rerenderWith } = await show()
    const asked = retrievals.length

    await rerenderWith({ ...SPEC, mapping: { value: 'ngn' } })

    expect(retrievals.length).toBeGreaterThan(asked)
    screen.unmount()
  })
})
