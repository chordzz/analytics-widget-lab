/**
 * Every widget actually renders.
 *
 * The other tests check the rules that decide what to draw. This one draws it.
 * Rendering to a string catches the class of failure no amount of domain testing
 * will: an empty array reaching `Math.max(...values)` and producing `-Infinity`,
 * a `reduce` with no initial value on a filtered-empty list, a `[0]` on nothing.
 *
 * Two passes matter, and the second is the one that finds bugs:
 *
 *   - **With data.** Proves the sample bindings in `samples.ts` are still valid
 *     and every built type has a working path from spec to pixels.
 *   - **With no rows.** `Widget` guards this — it shows the card's empty state
 *     rather than calling the primitive. But the primitives are exported for use
 *     anywhere in a host portal, where nothing guards them, so "renders nothing"
 *     has to be a promise they keep on their own.
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactElement } from 'react'

import { WidgetView } from './Widget'
import { SAMPLES } from './samples'
import { WIDGET_TYPES } from './catalog'
import { datasets, requireDataset, rowsFor } from '../data/datasets'
import { rowsForWidget } from '../data/query'
import type { Field, Row } from '../data/types'
import * as P from './primitives'

const builtTypes = WIDGET_TYPES.filter((type) => type.built)

/** Renders, returning the markup, and failing loudly with the widget's name. */
function render(what: string, element: ReactElement): string {
  try {
    return renderToStaticMarkup(element)
  } catch (error) {
    throw new Error(`${what} threw while rendering: ${(error as Error).message}`)
  }
}

describe('every built widget type', () => {
  test('has a sample binding', () => {
    const missing = builtTypes.filter((type) => !SAMPLES[type.id])
    expect(missing.map((type) => type.id)).toEqual([])
  })

  test('renders from its sample', () => {
    for (const type of builtTypes) {
      const markup = render(
        type.id,
        <WidgetView
          spec={{ id: 'test', typeId: type.id, ...SAMPLES[type.id] }}
          dataset={requireDataset(SAMPLES[type.id].datasetId)}
          rows={rowsForWidget(
            { id: 'test', typeId: type.id, ...SAMPLES[type.id] },
            requireDataset(SAMPLES[type.id].datasetId),
          )}
        />,
      )
      expect(markup.length).toBeGreaterThan(0)
    }
  })

  test('never renders the wiring-error card from a valid sample', () => {
    // `Widget` falls back to an error card for an unknown type or dataset. A
    // sample that drifted would show up here rather than as a blank in the UI.
    for (const type of builtTypes) {
      const markup = render(
        type.id,
        <WidgetView
          spec={{ id: 'test', typeId: type.id, ...SAMPLES[type.id] }}
          dataset={requireDataset(SAMPLES[type.id].datasetId)}
          rows={rowsForWidget(
            { id: 'test', typeId: type.id, ...SAMPLES[type.id] },
            requireDataset(SAMPLES[type.id].datasetId),
          )}
        />,
      )
      expect({ type: type.id, broken: markup.includes('No widget type') }).toEqual({
        type: type.id,
        broken: false,
      })
    }
  })

  test('shows the empty state rather than a chart when the data has no rows', () => {
    for (const type of builtTypes) {
      const sample = SAMPLES[type.id]
      // A Dataset no longer carries rows, so "empty" is a property of the
      // retrieval and not of the description. The description still has to exist
      // — a spec pointed at a missing dataset is a wiring error, not emptiness —
      // and the no-rows behaviour itself is asserted by the primitive tests below.
      const described = requireDataset(sample.datasetId)
      const markup = render(
        `${type.id} (empty)`,
        <WidgetView
          spec={{ id: 'test', typeId: type.id, ...sample }}
          dataset={described}
          rows={[]}
          state="empty"
        />,
      )
      expect(markup).toContain('No data')
      expect(described.fields.length).toBeGreaterThan(0)
    }
  })

  test('renders loading and error states for every type', () => {
    for (const type of builtTypes) {
      const sample = SAMPLES[type.id]
      for (const state of ['loading', 'denied', 'withdrawn', 'failed'] as const) {
        const markup = render(
          `${type.id} (${state})`,
          <WidgetView
            spec={{ id: 'test', typeId: type.id, ...sample }}
            dataset={requireDataset(sample.datasetId)}
            state={state}
          />,
        )
        expect(markup.length).toBeGreaterThan(0)
      }
    }
  })
})

/**
 * Every primitive, called directly with no rows.
 *
 * The props are spelled out rather than derived, because this doubles as the
 * worked example of each primitive's public shape — if a signature changes, this
 * file is the first thing that has to change with it.
 *
 * Series and columns are deliberately *not* empty. An empty series makes the
 * test pass for the wrong reason: the loop that would compute `Math.max()` of
 * nothing never runs, so `-Infinity` never reaches an SVG coordinate. The
 * dangerous shape is a real series over no rows, so that is what is passed.
 */
const NO_ROWS: readonly Row[] = []
const SERIES = [{ key: 'v', label: 'Value' }, { key: 'w', label: 'Other' }]
const COLUMNS: Field[] = [
  { key: 'x', label: 'Category', role: 'dimension', filterable: true, sortable: true },
  { key: 'v', label: 'Value', role: 'measure', filterable: false, sortable: true, aggregations: ['sum'] },
]

const primitives: { name: string; element: ReactElement }[] = [
  { name: 'ActivityFeed', element: <P.ActivityFeed data={NO_ROWS} timeKey="at" actorKey="actor" actionKey="action" /> },
  { name: 'BarChart', element: <P.BarChart data={NO_ROWS} xKey="x" series={SERIES} /> },
  { name: 'BoxPlot', element: <P.BoxPlot data={NO_ROWS} xKey="x" valueKey="v" /> },
  { name: 'CalendarHeatmap', element: <P.CalendarHeatmap data={NO_ROWS} xKey="date" valueKey="v" /> },
  { name: 'CohortGrid', element: <P.CohortGrid data={NO_ROWS} cohortKey="c" periodKey="p" valueKey="v" /> },
  { name: 'DataTable', element: <P.DataTable data={NO_ROWS} columns={COLUMNS} /> },
  { name: 'DonutChart', element: <P.DonutChart data={NO_ROWS} xKey="x" valueKey="v" /> },
  { name: 'FunnelChart', element: <P.FunnelChart data={NO_ROWS} xKey="x" valueKey="v" /> },
  { name: 'GanttChart', element: <P.GanttChart data={NO_ROWS} xKey="x" startKey="s" endKey="e" /> },
  { name: 'GaugeTile', element: <P.GaugeTile label="Empty" value={0} target={0} /> },
  { name: 'Histogram', element: <P.Histogram data={NO_ROWS} valueKey="v" /> },
  { name: 'PivotTable', element: <P.PivotTable data={NO_ROWS} rowKey="r" columnKey="c" /> },
  { name: 'PointMap', element: <P.PointMap data={NO_ROWS} xKey="x" latKey="lat" lngKey="lng" valueKey="v" /> },
  { name: 'RadarChart', element: <P.RadarChart data={NO_ROWS} xKey="x" series={SERIES} /> },
  { name: 'RankedList', element: <P.RankedList data={NO_ROWS} xKey="x" valueKey="v" /> },
  { name: 'SankeyChart', element: <P.SankeyChart data={NO_ROWS} fromKey="f" toKey="t" valueKey="v" /> },
  { name: 'ScatterChart', element: <P.ScatterChart data={NO_ROWS} xKey="x" yKey="y" /> },
  { name: 'StatTile', element: <P.StatTile label="Empty" value={0} /> },
  { name: 'StatusList', element: <P.StatusList data={NO_ROWS} xKey="x" stateKey="s" /> },
  { name: 'StatusTile', element: <P.StatusTile label="Empty" tone="neutral" /> },
  { name: 'BubbleChart', element: <P.BubbleChart data={NO_ROWS} xKey="x" yKey="y" sizeKey="s" /> },
  { name: 'Legend', element: <P.Legend series={SERIES} /> },
  { name: 'Sparkline', element: <P.Sparkline data={NO_ROWS} seriesKey="v" /> },
  { name: 'Treemap', element: <P.Treemap data={NO_ROWS} xKey="x" valueKey="v" /> },
  { name: 'TrendChart', element: <P.TrendChart data={NO_ROWS} xKey="x" series={SERIES} /> },
  { name: 'EventLog', element: <P.EventLog data={NO_ROWS} timeKey="t" /> },
  { name: 'ViolinPlot', element: <P.ViolinPlot data={NO_ROWS} xKey="x" valueKey="v" /> },
  { name: 'HeatmapMatrix', element: <P.HeatmapMatrix data={NO_ROWS} measures={[]} /> },
  { name: 'BarChartRace', element: <P.BarChartRace data={NO_ROWS} timeKey="t" entityKey="e" valueKey="v" /> },
  { name: 'ComparisonTable', element: <P.ComparisonTable data={NO_ROWS} entityKey="e" metrics={[]} /> },
  /*
   * The threshold pair are tiles, so "no data" for them is no *threshold* — the
   * figure is a bare number that always arrives. An unconfigured tile must not
   * read as healthy, which is asserted properly in `threshold.test.ts`; here we
   * only need it to render and to emit no NaN.
   */
  {
    name: 'ThresholdTile',
    element: <P.ThresholdTile value={Number.NaN} label="Empty" config={{ direction: 'below-is-bad' }} />,
  },
  {
    name: 'AlertBanner',
    element: <P.AlertBanner value={Number.NaN} label="Empty" config={{ direction: 'below-is-bad' }} />,
  },
]

describe('primitives with no data', () => {
  test('the list covers every exported primitive', () => {
    // Otherwise a new primitive quietly opts itself out of this whole file.
    const exported = Object.entries(P)
      .filter(([name, value]) => typeof value === 'function' && /^[A-Z]/.test(name))
      .map(([name]) => name)
    const covered = new Set(primitives.map((entry) => entry.name))
    expect(exported.filter((name) => !covered.has(name))).toEqual([])
  })

  test('render without throwing', () => {
    for (const { name, element } of primitives) {
      expect(() => render(name, element)).not.toThrow()
    }
  })

  test('never emit a non-finite coordinate', () => {
    /*
     * The failure this exists for: `Math.max(...[])` is `-Infinity`, which
     * becomes `NaN` a line later and lands in an SVG path or a width. React
     * renders it happily — no crash, no warning, just a chart that is not there.
     */
    for (const { name, element } of primitives) {
      const markup = render(name, element)
      expect({ name, bad: /NaN|Infinity/.test(markup) }).toEqual({ name, bad: false })
    }
  })

  test('draw nothing rather than an empty frame', () => {
    // A primitive with no data should get out of the way and let whatever wraps
    // it say so. Axes and gridlines around no data read as a broken chart.
    for (const { name, element } of primitives) {
      if (name.endsWith('Tile') || name === 'Legend') continue // These take scalars.
      const markup = render(name, element)
      expect({ name, drewAFrame: markup.includes('<svg') }).toEqual({ name, drewAFrame: false })
    }
  })
})

describe('every dataset', () => {
  test('renders in a data table without throwing', () => {
    for (const dataset of datasets) {
      const markup = render(
        dataset.id,
        <P.DataTable data={rowsFor(dataset.id)} columns={dataset.fields} limit={5} />,
      )
      expect(markup).toContain(dataset.fields[0].label)
    }
  })
})
