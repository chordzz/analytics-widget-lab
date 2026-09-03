/**
 * What the boards store starts with.
 *
 * Exists so the module opens on something that looks like a real board rather
 * than an empty state — you cannot judge widget design from a blank canvas. The
 * composition is deliberately ordinary: a KPI row, a wide trend, a comparison
 * pair, and a supporting row. That is what most dashboards actually look like,
 * and it is the layout the widgets have to survive.
 *
 * Used only on a first run. Once anything is saved, the stored boards win — a
 * seed that reappeared over your own work would be a bug, not a convenience.
 */

import { flowLayout, rowsForPx } from './grid'
import { dateRangeControl } from '../../domain/composition'
import { heightForType } from '../widgets/layout'
import type { Board, PlacedWidget } from './boards'
import type { WidgetSpec } from '../widgets/Widget'

/**
 * The seed is authored as widths in reading order, and placed from that.
 *
 * Writing `x` and `y` out by hand would be twelve pairs of numbers nobody can
 * check by eye, and every edit to one widget's width would silently break the
 * row below it. `flowLayout` is the same function the migration uses, so the
 * seed and a board restored from the old format go through identical code.
 *
 * Height comes from the type rather than being authored at all — a KPI row is
 * short and a table is tall, and that is the catalogue's opinion to hold.
 */
/**
 * Authored as widths in reading order; split into the two halves a Dashboard
 * actually stores.
 *
 * The seed stays a flat readable list because that is what makes it reviewable —
 * a keyed record and a parallel placement array would be correct and unreadable.
 * `flowLayout` derives the positions, exactly as it does for a migrated board.
 */
const place = (
  widgets: (WidgetSpec & { w: number })[],
): Pick<Board, 'widgets' | 'placements'> => {
  const flowed: PlacedWidget[] = flowLayout(
    widgets.map((widget) => ({ ...widget, h: rowsForPx(heightForType(widget.typeId)) })),
  )

  return {
    widgets: Object.fromEntries(
      flowed.map(({ x, y, w, h, ...spec }) => {
        void x, y, w, h
        return [spec.id, spec as WidgetSpec]
      }),
    ),
    placements: flowed.map(({ id, x, y, w, h }) => ({ widgetId: id, x, y, w, h })),
  }
}

/** Every seeded board belongs to whoever is running the module. */
const SEED_AUTHOR = 'local'

export const revenueOverview: Board = {
  id: 'revenue-overview',
  name: 'Revenue overview',
  description: 'Trading performance across regions and products.',
  status: 'published',
  updated: '2026-08-06',
  authorId: SEED_AUTHOR,
  scope: { kind: 'organization-wide' },
  shareGrants: [],
  /*
   * One Control, so FR-CO-06 is reachable by opening the module rather than by
   * building a board first. It also happens to be the interesting case: this
   * board mixes time-series widgets with `sales-by-region` and
   * `service-health`, neither of which has a Time Dimension — so the Control
   * visibly reaches some widgets and says why it leaves the others alone.
   */
  controls: [dateRangeControl('c-period', 'Period')],
  ...place([
    {
      id: 'w-revenue-total',
      typeId: 'stat-card',
      datasetId: 'revenue-monthly',
      title: 'Revenue',
      mapping: { value: 'revenue' },
      options: { comparisonLabel: 'vs. last month' },
      w: 3,
    },
    {
      id: 'w-customers',
      typeId: 'sparkline-card',
      datasetId: 'revenue-monthly',
      title: 'Customers',
      mapping: { value: 'customers', x: 'month' },
      options: { comparisonLabel: 'vs. last month' },
      w: 3,
    },
    {
      id: 'w-refunds',
      typeId: 'sparkline-card',
      datasetId: 'revenue-daily',
      title: 'Refunds',
      mapping: { value: 'refunds', x: 'date' },
      options: { direction: 'down-is-good', comparisonLabel: 'vs. yesterday' },
      w: 3,
    },
    {
      id: 'w-target',
      typeId: 'gauge',
      datasetId: 'revenue-monthly',
      title: 'Against target',
      mapping: { value: 'revenue', target: 'target' },
      w: 3,
    },

    {
      id: 'w-revenue-trend',
      typeId: 'area-chart',
      datasetId: 'revenue-daily',
      title: 'Revenue and refunds',
      subtitle: 'Daily, last 365 days',
      mapping: { x: 'date', series: ['revenue', 'refunds'] },
      w: 8,
    },
    {
      id: 'w-region-mix',
      typeId: 'donut-chart',
      datasetId: 'sales-by-region',
      title: 'Revenue by region',
      mapping: { x: 'region', value: 'revenue' },
      options: { centerLabel: 'All regions' },
      w: 4,
    },

    {
      id: 'w-products',
      typeId: 'bar-chart-horizontal',
      datasetId: 'product-performance',
      title: 'Revenue by product',
      mapping: { x: 'product', series: ['revenue'] },
      w: 5,
    },
    {
      id: 'w-top-countries',
      typeId: 'ranked-list',
      datasetId: 'sales-by-country',
      title: 'Top countries',
      subtitle: 'By revenue',
      mapping: { x: 'country', value: 'revenue' },
      w: 3,
    },
    {
      id: 'w-health',
      typeId: 'status-list',
      datasetId: 'service-health',
      title: 'Service health',
      mapping: { x: 'service', state: 'state', value: 'uptime' },
      w: 4,
    },

    {
      id: 'w-tickets',
      typeId: 'data-table',
      datasetId: 'support-tickets',
      title: 'Recent support tickets',
      mapping: { columns: ['ref', 'opened', 'status', 'priority', 'team', 'ageDays', 'replies'] },
      w: 12,
    },
  ]),
}

export const onboardingFunnel: Board = {
  id: 'onboarding',
  name: 'Onboarding',
  description: 'Signup conversion and drop-off.',
  status: 'draft',
  updated: '2026-08-07',
  authorId: SEED_AUTHOR,
  scope: { kind: 'organization-wide' },
  shareGrants: [],
  controls: [],
  ...place([
    {
      id: 'w-signups',
      typeId: 'stat-card',
      datasetId: 'signup-funnel',
      title: 'Visitors',
      mapping: { value: 'users' },
      w: 3,
    },
    {
      id: 'w-funnel-bars',
      typeId: 'bar-chart-horizontal',
      datasetId: 'signup-funnel',
      title: 'Stage volume',
      mapping: { x: 'stage', series: ['users'] },
      options: { colorByCategory: true },
      w: 9,
    },
  ]),
}

export const seedBoards: Board[] = [revenueOverview, onboardingFunnel]
