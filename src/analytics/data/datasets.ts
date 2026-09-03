/**
 * The mock data library.
 *
 * Thirteen datasets, each shaped so a particular family of widget renders
 * *honestly* rather than merely without error. A histogram over six points and
 * a calendar heatmap over twelve months are both technically correct and
 * completely useless for judging a design, so the volumes and grains here are
 * chosen to match what each visualisation actually needs.
 *
 * Every row is generated from a fixed seed — see generate.ts.
 */

import { between, daysEndingAt, intBetween, monthsEndingAt, pick, seeded, trendingSeries } from './generate'
import type { Dataset, Row } from './types'

const TODAY = '2026-08-07'

// --- 1. Revenue, daily ------------------------------------------------------
// 365 points: enough for a calendar heatmap to fill a year and for a
// distribution to have a real shape.

const revenueDaily = (): Dataset => {
  const random = seeded(1001)
  const dates = daysEndingAt(TODAY, 365)
  const revenue = trendingSeries(random, {
    length: 365,
    start: 42_000,
    driftPerStep: 38,
    noise: 0.14,
    weekly: 0.22,
    spikeChance: 0.02,
  })
  const orders = trendingSeries(random, { length: 365, start: 640, driftPerStep: 0.4, noise: 0.16, weekly: 0.2 })

  return {
    id: 'revenue-daily',
    suits: ['calendar-heatmap', 'area-chart', 'line-chart'],
    name: 'Revenue, daily',
    description: 'Daily revenue, orders and refunds over the last year.',
    source: 'Billing',
    fields: [
      { key: 'date', label: 'Date', kind: 'time' },
      { key: 'revenue', label: 'Revenue', kind: 'measure', format: 'currency' },
      { key: 'orders', label: 'Orders', kind: 'measure', format: 'number' },
      { key: 'refunds', label: 'Refunds', kind: 'measure', format: 'currency' },
    ],
    rows: dates.map((date, index) => ({
      date,
      revenue: Math.round(revenue[index]),
      orders: Math.round(orders[index]),
      refunds: Math.round(revenue[index] * between(random, 0.01, 0.05)),
    })),
  }
}

// --- 2. Revenue, monthly ----------------------------------------------------
// Carries a target so gauges and progress trackers have something to measure
// against without inventing one.

const revenueMonthly = (): Dataset => {
  const random = seeded(1002)
  const months = monthsEndingAt('2026-08', 24)
  const revenue = trendingSeries(random, { length: 24, start: 1_180_000, driftPerStep: 26_000, noise: 0.09 })

  return {
    id: 'revenue-monthly',
    suits: ['line-chart', 'stat-card', 'gauge', 'progress-tracker'],
    name: 'Revenue, monthly',
    description: 'Monthly revenue against target, two years.',
    source: 'Billing',
    fields: [
      { key: 'month', label: 'Month', kind: 'time' },
      { key: 'revenue', label: 'Revenue', kind: 'measure', format: 'currency' },
      { key: 'target', label: 'Target', kind: 'measure', format: 'currency' },
      { key: 'customers', label: 'Customers', kind: 'measure', format: 'number' },
    ],
    rows: months.map((month, index) => ({
      month,
      revenue: Math.round(revenue[index]),
      target: 1_250_000 + index * 25_000,
      customers: Math.round(between(random, 8_400, 12_600)),
    })),
  }
}

// --- 3. Sales by region -----------------------------------------------------
// Six slices. Composition falls apart past about seven, so this is sized to
// what a pie can actually carry.

const salesByRegion = (): Dataset => {
  const random = seeded(1003)
  const regions = ['West Africa', 'East Africa', 'Europe', 'North America', 'Middle East', 'Asia Pacific']

  return {
    id: 'sales-by-region',
    suits: ['donut-chart', 'pie-chart', 'bar-chart-vertical'],
    name: 'Sales by region',
    description: 'Revenue and order volume across six regions.',
    source: 'Billing',
    fields: [
      { key: 'region', label: 'Region', kind: 'dimension' },
      { key: 'revenue', label: 'Revenue', kind: 'measure', format: 'currency' },
      { key: 'orders', label: 'Orders', kind: 'measure', format: 'number' },
      { key: 'growth', label: 'Growth', kind: 'measure', format: 'percent' },
    ],
    rows: regions.map((region) => ({
      region,
      revenue: Math.round(between(random, 180_000, 920_000)),
      orders: intBetween(random, 1_200, 9_800),
      growth: Number(between(random, -0.12, 0.34).toFixed(3)),
    })),
  }
}

// --- 4. Sales by country ----------------------------------------------------
// ISO codes so a choropleth has something to join on when maps arrive.

const salesByCountry = (): Dataset => {
  const random = seeded(1004)
  // Centroids, so a point map can plot without boundary data. A choropleth
  // would need GeoJSON; this does not.
  const countries: [string, string, number, number][] = [
    ['NG', 'Nigeria', 9.1, 8.7], ['GH', 'Ghana', 7.9, -1.0], ['KE', 'Kenya', 0.2, 37.9],
    ['ZA', 'South Africa', -30.6, 22.9], ['EG', 'Egypt', 26.8, 30.8],
    ['GB', 'United Kingdom', 55.4, -3.4], ['FR', 'France', 46.2, 2.2],
    ['DE', 'Germany', 51.2, 10.5], ['ES', 'Spain', 40.5, -3.7], ['IT', 'Italy', 41.9, 12.6],
    ['US', 'United States', 37.1, -95.7], ['CA', 'Canada', 56.1, -106.3],
    ['BR', 'Brazil', -14.2, -51.9], ['MX', 'Mexico', 23.6, -102.6],
    ['AE', 'United Arab Emirates', 23.4, 53.8], ['SA', 'Saudi Arabia', 23.9, 45.1],
    ['IN', 'India', 20.6, 79.0], ['SG', 'Singapore', 1.35, 103.8],
    ['AU', 'Australia', -25.3, 133.8], ['JP', 'Japan', 36.2, 138.3],
  ]

  return {
    id: 'sales-by-country',
    suits: ['point-map', 'ranked-list'],
    name: 'Sales by country',
    description: 'Revenue and customer count for twenty countries, with ISO codes.',
    source: 'Billing',
    fields: [
      { key: 'code', label: 'Country code', kind: 'dimension', geo: 'country' },
      { key: 'country', label: 'Country', kind: 'dimension' },
      { key: 'lat', label: 'Latitude', kind: 'measure', format: 'number', geo: 'lat' },
      { key: 'lng', label: 'Longitude', kind: 'measure', format: 'number', geo: 'lng' },
      { key: 'revenue', label: 'Revenue', kind: 'measure', format: 'currency' },
      { key: 'customers', label: 'Customers', kind: 'measure', format: 'number' },
    ],
    rows: countries.map(([code, country, lat, lng]) => ({
      code,
      country,
      lat,
      lng,
      revenue: Math.round(between(random, 24_000, 780_000)),
      customers: intBetween(random, 180, 9_400),
    })),
  }
}

// --- 5. Product performance -------------------------------------------------
// Five measures so radar has enough axes and bubble has a third channel.

const productPerformance = (): Dataset => {
  const random = seeded(1005)
  const products = [
    'Transfers', 'Cards', 'Wallets', 'Payouts', 'Invoicing', 'Lending',
    'FX', 'Escrow', 'Payroll', 'Subscriptions', 'Terminals', 'Checkout',
  ]

  return {
    id: 'product-performance',
    suits: ['radar-chart', 'treemap', 'leaderboard', 'scatter-plot', 'bubble-chart'],
    name: 'Product performance',
    description: 'Twelve products scored across five measures.',
    source: 'Product analytics',
    fields: [
      { key: 'product', label: 'Product', kind: 'dimension' },
      { key: 'revenue', label: 'Revenue', kind: 'measure', format: 'currency' },
      { key: 'adoption', label: 'Adoption', kind: 'measure', format: 'percent' },
      { key: 'retention', label: 'Retention', kind: 'measure', format: 'percent' },
      { key: 'satisfaction', label: 'Satisfaction', kind: 'measure', format: 'number' },
      { key: 'tickets', label: 'Support tickets', kind: 'measure', format: 'number' },
    ],
    rows: products.map((product) => ({
      product,
      revenue: Math.round(between(random, 60_000, 840_000)),
      adoption: Number(between(random, 0.12, 0.86).toFixed(3)),
      retention: Number(between(random, 0.55, 0.97).toFixed(3)),
      satisfaction: Number(between(random, 3.1, 4.9).toFixed(2)),
      tickets: intBetween(random, 12, 480),
    })),
  }
}

// --- 6. Signup funnel -------------------------------------------------------
// Monotonically decreasing, because a funnel that widens is a bug not a design.

const signupFunnel = (): Dataset => {
  const stages = [
    ['Visited', 48_200],
    ['Started signup', 21_400],
    ['Verified email', 16_950],
    ['Completed KYC', 9_780],
    ['Funded account', 6_240],
    ['First transaction', 4_110],
  ] as const

  return {
    id: 'signup-funnel',
    suits: ['funnel'],
    name: 'Signup funnel',
    description: 'Six ordered onboarding stages with drop-off.',
    source: 'Product analytics',
    fields: [
      { key: 'stage', label: 'Stage', kind: 'dimension' },
      { key: 'users', label: 'Users', kind: 'measure', format: 'number' },
      { key: 'position', label: 'Position', kind: 'measure', format: 'number' },
    ],
    rows: stages.map(([stage, users], index) => ({ stage, users, position: index })),
  }
}

// --- 7. Traffic flow --------------------------------------------------------

const trafficFlow = (): Dataset => {
  const random = seeded(1007)
  const links: [string, string][] = [
    ['Organic search', 'Landing page'], ['Paid ads', 'Landing page'], ['Referral', 'Landing page'],
    ['Direct', 'Product page'], ['Landing page', 'Product page'], ['Landing page', 'Signup'],
    ['Product page', 'Signup'], ['Product page', 'Exit'], ['Signup', 'Activated'], ['Signup', 'Abandoned'],
  ]

  return {
    id: 'traffic-flow',
    suits: ['sankey'],
    name: 'Traffic flow',
    description: 'Source-to-target session volume across the acquisition path.',
    source: 'Product analytics',
    fields: [
      { key: 'from', label: 'From', kind: 'dimension' },
      { key: 'to', label: 'To', kind: 'dimension' },
      { key: 'sessions', label: 'Sessions', kind: 'measure', format: 'number' },
    ],
    rows: links.map(([from, to]) => ({ from, to, sessions: intBetween(random, 1_200, 28_000) })),
  }
}

// --- 8. Transactions --------------------------------------------------------
// 2,000 rows with a deliberate long right tail, so a histogram shows a shape
// and a box plot has outliers to draw.

const transactions = (): Dataset => {
  const random = seeded(1008)
  const channels = ['Card', 'Bank transfer', 'Wallet', 'Direct debit']

  const rows: Row[] = Array.from({ length: 2_000 }, (_, index) => {
    const heavyTail = random() < 0.06
    const amount = heavyTail ? between(random, 4_000, 42_000) : between(random, 8, 3_200)
    return {
      id: `TX-${String(index + 1).padStart(5, '0')}`,
      amount: Number(amount.toFixed(2)),
      channel: pick(random, channels),
      duration: Number(between(random, 0.4, 9.6).toFixed(2)),
    }
  })

  return {
    id: 'transactions',
    suits: ['histogram', 'box-plot'],
    name: 'Transactions',
    description: 'Two thousand individual transactions with a long-tailed amount.',
    source: 'Payments',
    fields: [
      { key: 'id', label: 'Transaction', kind: 'dimension' },
      { key: 'channel', label: 'Channel', kind: 'dimension' },
      { key: 'amount', label: 'Amount', kind: 'measure', format: 'currency' },
      { key: 'duration', label: 'Settlement time', kind: 'measure', format: 'duration' },
    ],
    rows,
  }
}

// --- 9. Cohort retention ----------------------------------------------------
// Decays along each row and slightly across cohorts, which is what real
// retention does and what makes the grid readable as a gradient.

const cohortRetention = (): Dataset => {
  const random = seeded(1009)
  const cohorts = monthsEndingAt('2026-08', 12)
  const rows: Row[] = []

  cohorts.forEach((cohort, cohortIndex) => {
    const periods = cohorts.length - cohortIndex
    let retained = 1
    for (let period = 0; period < periods; period += 1) {
      if (period > 0) retained *= between(random, 0.74, 0.94)
      rows.push({
        cohort,
        period,
        retention: Number(retained.toFixed(4)),
        users: Math.round(between(random, 800, 2_400) * retained),
      })
    }
  })

  return {
    id: 'cohort-retention',
    suits: ['cohort-grid'],
    name: 'Cohort retention',
    description: 'Monthly signup cohorts tracked across subsequent periods.',
    source: 'Product analytics',
    fields: [
      { key: 'cohort', label: 'Cohort', kind: 'time' },
      { key: 'period', label: 'Period', kind: 'dimension' },
      { key: 'retention', label: 'Retention', kind: 'measure', format: 'percent' },
      { key: 'users', label: 'Users', kind: 'measure', format: 'number' },
    ],
    rows,
  }
}

// --- 10. Project timeline ---------------------------------------------------

const projectTimeline = (): Dataset => {
  const random = seeded(1010)
  const tasks = [
    ['Discovery', 'Research', 0, 18], ['Requirements', 'Research', 12, 34],
    ['Domain model', 'Design', 30, 52], ['Visual design', 'Design', 44, 78],
    ['Widget library', 'Build', 60, 128], ['Dashboard builder', 'Build', 96, 156],
    ['Integration', 'Build', 140, 182], ['QA', 'Release', 168, 196],
    ['Pilot', 'Release', 188, 214],
  ] as const

  return {
    id: 'project-timeline',
    suits: ['timeline-chart'],
    name: 'Project timeline',
    description: 'Nine workstreams with start and end offsets, grouped by phase.',
    source: 'Delivery',
    fields: [
      { key: 'task', label: 'Task', kind: 'dimension' },
      { key: 'phase', label: 'Phase', kind: 'dimension' },
      { key: 'start', label: 'Start day', kind: 'measure', format: 'number' },
      { key: 'end', label: 'End day', kind: 'measure', format: 'number' },
      { key: 'progress', label: 'Progress', kind: 'measure', format: 'percent' },
    ],
    rows: tasks.map(([task, phase, start, end]) => ({
      task,
      phase,
      start,
      end,
      progress: Number(between(random, 0.15, 1).toFixed(2)),
    })),
  }
}

// --- 11. Activity events ----------------------------------------------------

const activityEvents = (): Dataset => {
  const random = seeded(1011)
  const actors = ['A. Okafor', 'B. Mensah', 'C. Adeyemi', 'D. Ncube', 'E. Wanjiru', 'System']
  const actions = [
    'published a dashboard', 'withdrew a dataset', 'created a widget',
    'shared a dashboard', 'updated a threshold', 'archived a draft',
    'approved a publication', 'rejected a duplicate',
  ]
  const days = daysEndingAt(TODAY, 60)

  return {
    id: 'activity-events',
    suits: ['activity-feed'],
    name: 'Activity events',
    description: 'Sixty timestamped platform events with actor and severity.',
    source: 'Audit',
    fields: [
      { key: 'at', label: 'When', kind: 'time' },
      { key: 'actor', label: 'Actor', kind: 'dimension' },
      { key: 'action', label: 'Action', kind: 'dimension' },
      { key: 'severity', label: 'Severity', kind: 'dimension' },
    ],
    rows: days.map((at) => ({
      at,
      actor: pick(random, actors),
      action: pick(random, actions),
      severity: pick(random, ['info', 'info', 'info', 'warning', 'critical']),
    })),
  }
}

// --- 12. Service health -----------------------------------------------------
// Deliberately mixed states, so every branch of a status widget is reachable
// from one dataset rather than needing three.

const serviceHealth = (): Dataset => ({
  id: 'service-health',
    suits: ['status-list', 'status-indicator'],
  name: 'Service health',
  description: 'Nine services with uptime, latency and current state.',
  source: 'Platform',
  fields: [
    { key: 'service', label: 'Service', kind: 'dimension' },
    { key: 'state', label: 'State', kind: 'dimension' },
    { key: 'uptime', label: 'Uptime', kind: 'measure', format: 'percent' },
    { key: 'latency', label: 'p95 latency', kind: 'measure', format: 'duration' },
    { key: 'errorRate', label: 'Error rate', kind: 'measure', format: 'percent' },
  ],
  rows: [
    { service: 'Payments API', state: 'good', uptime: 0.9998, latency: 0.14, errorRate: 0.0004 },
    { service: 'Ledger', state: 'good', uptime: 0.9995, latency: 0.22, errorRate: 0.0011 },
    { service: 'Identity', state: 'good', uptime: 0.9999, latency: 0.09, errorRate: 0.0002 },
    { service: 'Settlements', state: 'warning', uptime: 0.9942, latency: 0.68, errorRate: 0.0089 },
    { service: 'Notifications', state: 'warning', uptime: 0.9918, latency: 0.44, errorRate: 0.0134 },
    { service: 'Reporting', state: 'serious', uptime: 0.9761, latency: 1.92, errorRate: 0.0312 },
    { service: 'FX rates', state: 'critical', uptime: 0.9412, latency: 3.41, errorRate: 0.0904 },
    { service: 'Webhooks', state: 'good', uptime: 0.9987, latency: 0.31, errorRate: 0.0018 },
    { service: 'Search', state: 'good', uptime: 0.9991, latency: 0.19, errorRate: 0.0007 },
  ],
})

// --- 13. Support tickets ----------------------------------------------------
// Wide, so a table has enough columns to need column configuration.

const supportTickets = (): Dataset => {
  const random = seeded(1013)
  const statuses = ['Open', 'In progress', 'Waiting on customer', 'Resolved', 'Closed']
  const priorities = ['Low', 'Medium', 'High', 'Urgent']
  const teams = ['Payments', 'Onboarding', 'Compliance', 'Platform', 'Billing']
  const days = daysEndingAt(TODAY, 120)

  return {
    id: 'support-tickets',
    suits: ['data-table', 'pivot-table'],
    name: 'Support tickets',
    description: 'A hundred and twenty tickets across status, priority and team.',
    source: 'Support',
    fields: [
      { key: 'ref', label: 'Reference', kind: 'dimension' },
      { key: 'opened', label: 'Opened', kind: 'time' },
      { key: 'status', label: 'Status', kind: 'dimension' },
      { key: 'priority', label: 'Priority', kind: 'dimension' },
      { key: 'team', label: 'Team', kind: 'dimension' },
      { key: 'ageDays', label: 'Age', kind: 'measure', format: 'number' },
      { key: 'replies', label: 'Replies', kind: 'measure', format: 'number' },
    ],
    rows: days.map((opened, index) => ({
      ref: `SUP-${4200 + index}`,
      opened,
      status: pick(random, statuses),
      priority: pick(random, priorities),
      team: pick(random, teams),
      ageDays: intBetween(random, 0, 64),
      replies: intBetween(random, 0, 22),
    })),
  }
}

// --- library ----------------------------------------------------------------

export const datasets: Dataset[] = [
  revenueDaily(),
  revenueMonthly(),
  salesByRegion(),
  salesByCountry(),
  productPerformance(),
  signupFunnel(),
  trafficFlow(),
  transactions(),
  cohortRetention(),
  projectTimeline(),
  activityEvents(),
  serviceHealth(),
  supportTickets(),
]

export const datasetById = (id: string): Dataset | undefined =>
  datasets.find((dataset) => dataset.id === id)

/** Throws rather than returning undefined — a widget wired to a missing dataset is a bug. */
export const requireDataset = (id: string): Dataset => {
  const dataset = datasetById(id)
  if (!dataset) throw new Error(`No dataset '${id}' in the library.`)
  return dataset
}
