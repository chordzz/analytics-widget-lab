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

import type { Board } from './boards'

export const revenueOverview: Board = {
  id: 'revenue-overview',
  name: 'Revenue overview',
  description: 'Trading performance across regions and products.',
  status: 'published',
  updated: '2026-08-06',
  widgets: [
    {
      id: 'w-revenue-total',
      typeId: 'stat-card',
      datasetId: 'revenue-monthly',
      title: 'Revenue',
      mapping: { value: 'revenue' },
      options: { comparisonLabel: 'vs. last month' },
      span: 3,
    },
    {
      id: 'w-customers',
      typeId: 'sparkline-card',
      datasetId: 'revenue-monthly',
      title: 'Customers',
      mapping: { value: 'customers', x: 'month' },
      options: { comparisonLabel: 'vs. last month' },
      span: 3,
    },
    {
      id: 'w-refunds',
      typeId: 'sparkline-card',
      datasetId: 'revenue-daily',
      title: 'Refunds',
      mapping: { value: 'refunds', x: 'date' },
      options: { direction: 'down-is-good', comparisonLabel: 'vs. yesterday' },
      span: 3,
    },
    {
      id: 'w-target',
      typeId: 'gauge',
      datasetId: 'revenue-monthly',
      title: 'Against target',
      mapping: { value: 'revenue', target: 'target' },
      span: 3,
    },

    {
      id: 'w-revenue-trend',
      typeId: 'area-chart',
      datasetId: 'revenue-daily',
      title: 'Revenue and refunds',
      subtitle: 'Daily, last 365 days',
      mapping: { x: 'date', series: ['revenue', 'refunds'] },
      span: 8,
    },
    {
      id: 'w-region-mix',
      typeId: 'donut-chart',
      datasetId: 'sales-by-region',
      title: 'Revenue by region',
      mapping: { x: 'region', value: 'revenue' },
      options: { centerLabel: 'All regions' },
      span: 4,
    },

    {
      id: 'w-products',
      typeId: 'bar-horizontal',
      datasetId: 'product-performance',
      title: 'Revenue by product',
      mapping: { x: 'product', series: ['revenue'] },
      span: 5,
    },
    {
      id: 'w-top-countries',
      typeId: 'ranked-list',
      datasetId: 'sales-by-country',
      title: 'Top countries',
      subtitle: 'By revenue',
      mapping: { x: 'country', value: 'revenue' },
      span: 3,
    },
    {
      id: 'w-health',
      typeId: 'status-list',
      datasetId: 'service-health',
      title: 'Service health',
      mapping: { x: 'service', state: 'state', value: 'uptime' },
      span: 4,
    },

    {
      id: 'w-tickets',
      typeId: 'data-table',
      datasetId: 'support-tickets',
      title: 'Recent support tickets',
      mapping: { columns: ['ref', 'opened', 'status', 'priority', 'team', 'ageDays', 'replies'] },
      span: 12,
    },
  ],
}

export const onboardingFunnel: Board = {
  id: 'onboarding',
  name: 'Onboarding',
  description: 'Signup conversion and drop-off.',
  status: 'draft',
  updated: '2026-08-07',
  widgets: [
    {
      id: 'w-signups',
      typeId: 'stat-card',
      datasetId: 'signup-funnel',
      title: 'Visitors',
      mapping: { value: 'users' },
      span: 3,
    },
    {
      id: 'w-funnel-bars',
      typeId: 'bar-horizontal',
      datasetId: 'signup-funnel',
      title: 'Stage volume',
      mapping: { x: 'stage', series: ['users'] },
      options: { colorByCategory: true },
      span: 9,
    },
  ],
}

export const seedBoards: Board[] = [revenueOverview, onboardingFunnel]
