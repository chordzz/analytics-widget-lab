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
const place = (widgets: (WidgetSpec & { w: number })[]): PlacedWidget[] =>
  flowLayout(widgets.map((widget) => ({ ...widget, h: rowsForPx(heightForType(widget.typeId)) })))

export const revenueOverview: Board = {
  id: 'revenue-overview',
  name: 'Revenue overview',
  description: 'Trading performance across regions and products.',
  status: 'published',
  updated: '2026-08-06',
  widgets: place([
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
  widgets: place([
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
