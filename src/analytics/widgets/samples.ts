/**
 * One representative spec per widget type.
 *
 * Reference data, not screen data — which is why it lives here rather than in
 * the gallery that first needed it. The gallery renders these to compare
 * treatments; the render tests use the same set to prove every type still draws.
 * A type whose sample is wrong is a type nobody is really checking.
 *
 * "Representative" means the dataset that shows the widget *honestly*: a long
 * tail for the histogram, ordered stages for the funnel, a year of days for the
 * calendar. Bound to flatter, they would hide exactly the cases the design has
 * to survive.
 */

import type { WidgetSpec } from './Widget'

export type WidgetSample = Omit<WidgetSpec, 'id' | 'typeId'>

export const SAMPLES: Record<string, WidgetSample> = {
  'stat-card': { datasetId: 'revenue-monthly', title: 'Revenue', mapping: { value: 'revenue' }, options: { comparisonLabel: 'vs. last month' } },
  'sparkline-card': { datasetId: 'revenue-daily', title: 'Orders', mapping: { value: 'orders', x: 'date' }, options: { comparisonLabel: 'vs. yesterday' } },
  'delta-card': { datasetId: 'revenue-monthly', title: 'Customers', mapping: { value: 'customers', x: 'month' }, options: { comparisonLabel: 'vs. last month' } },
  'progress-tracker': { datasetId: 'revenue-monthly', title: 'Target', mapping: { value: 'revenue', target: 'target' } },

  'line-chart': { datasetId: 'revenue-monthly', title: 'Revenue vs target', mapping: { x: 'month', series: ['revenue', 'target'] } },
  'area-chart': { datasetId: 'revenue-daily', title: 'Daily revenue', mapping: { x: 'date', series: ['revenue'] } },
  'spline-chart': { datasetId: 'revenue-monthly', title: 'Customers', mapping: { x: 'month', series: ['customers'] } },
  'step-chart': { datasetId: 'revenue-monthly', title: 'Target steps', mapping: { x: 'month', series: ['target'] } },

  'bar-chart-vertical': { datasetId: 'sales-by-region', title: 'Revenue by region', mapping: { x: 'region', series: ['revenue'] }, options: { colorByCategory: true } },
  'bar-chart-horizontal': { datasetId: 'product-performance', title: 'Revenue by product', mapping: { x: 'product', series: ['revenue'] } },
  'grouped-bar-chart': { datasetId: 'sales-by-region', title: 'Revenue and orders', mapping: { x: 'region', series: ['revenue', 'orders'] } },
  'stacked-bar-chart': { datasetId: 'sales-by-region', title: 'Composition by region', mapping: { x: 'region', series: ['revenue', 'orders'] } },

  'pie-chart': { datasetId: 'sales-by-region', title: 'Share by region', mapping: { x: 'region', value: 'revenue' } },
  'donut-chart': { datasetId: 'sales-by-region', title: 'Share by region', mapping: { x: 'region', value: 'revenue' }, options: { centerLabel: 'All regions' } },

  'ranked-list': { datasetId: 'sales-by-country', title: 'Top countries', mapping: { x: 'country', value: 'revenue' } },
  leaderboard: { datasetId: 'product-performance', title: 'Product leaderboard', mapping: { x: 'product', value: 'revenue' } },

  'status-list': { datasetId: 'service-health', title: 'Service health', mapping: { x: 'service', state: 'state', value: 'uptime' } },
  'status-indicator': { datasetId: 'service-health', title: 'Worst service', mapping: { x: 'service', state: 'state' }, options: { detail: 'Highest severity right now' } },

  gauge: { datasetId: 'revenue-monthly', title: 'Against target', mapping: { value: 'revenue', target: 'target' } },

  'data-table': { datasetId: 'support-tickets', title: 'Support tickets', mapping: { columns: ['ref', 'status', 'priority', 'team', 'ageDays'] } },
  'pivot-table': { datasetId: 'support-tickets', title: 'Tickets by team and status', mapping: { x: 'team', secondary: 'status' }, options: { aggregation: 'count' } },

  treemap: { datasetId: 'product-performance', title: 'Revenue by product', mapping: { x: 'product', value: 'revenue' } },

  funnel: { datasetId: 'signup-funnel', title: 'Signup funnel', mapping: { x: 'stage', value: 'users' } },
  sankey: { datasetId: 'traffic-flow', title: 'Acquisition flow', mapping: { x: 'from', secondary: 'to', value: 'sessions' } },

  'radar-chart': { datasetId: 'product-performance', title: 'Product profile', mapping: { x: 'product', series: ['revenue', 'adoption', 'retention', 'satisfaction', 'tickets'] } },

  histogram: { datasetId: 'transactions', title: 'Transaction amounts', mapping: { value: 'amount' } },
  'box-plot': { datasetId: 'transactions', title: 'Amount by channel', mapping: { x: 'channel', value: 'amount' } },

  'scatter-plot': { datasetId: 'product-performance', title: 'Adoption vs retention', mapping: { series: ['adoption', 'retention'] } },
  'bubble-chart': { datasetId: 'product-performance', title: 'Adoption, retention, revenue', mapping: { series: ['adoption', 'retention', 'revenue'] } },

  'calendar-heatmap': { datasetId: 'revenue-daily', title: 'Daily revenue', mapping: { x: 'date', value: 'revenue' } },
  'cohort-grid': { datasetId: 'cohort-retention', title: 'Retention by cohort', mapping: { x: 'cohort', secondary: 'period', value: 'retention' } },
  'timeline-chart': { datasetId: 'project-timeline', title: 'Delivery plan', mapping: { x: 'task', series: ['start', 'end'], secondary: 'phase', value: 'progress' } },

  'activity-feed': { datasetId: 'activity-events', title: 'Recent activity', mapping: { x: 'at', secondary: 'actor', value: 'action' }, options: { severityKey: 'severity' } },

  'point-map': { datasetId: 'sales-by-country', title: 'Revenue by country', mapping: { x: 'country', value: 'revenue', lat: 'lat', lng: 'lng' } },
}


/** The sample for a type, if one is defined. */
export const sampleFor = (typeId: string): WidgetSample | undefined => SAMPLES[typeId]
