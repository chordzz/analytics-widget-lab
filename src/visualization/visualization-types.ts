/**
 * The Visualization Types of §4.2, each classified into exactly one
 * Visualization Family (FR-VZ-01).
 *
 * This manifest is data, not code: adding a Type, or a Family, or changing a
 * Data Shape requires no change to application logic (FR-VZ-03). Note the
 * limitation recorded in Finding 3 — a genuinely new visual *form* still needs
 * a renderer, which arrives in Phase 2. `renderer` is deliberately absent here
 * so classification stays independent of whether anything can draw it yet.
 *
 * Descriptions are taken from the widget breakdown that accompanies the FRD;
 * they define what each Type presents, which drives its configuration schema.
 */

export interface VisualizationType {
  id: string
  name: string
  familyId: string
  description: string
}

export const visualizationTypes: VisualizationType[] = [
  // Tabular
  {
    id: 'data-table',
    name: 'Data table',
    familyId: 'tabular',
    description:
      'Sortable and filterable rows with pagination, column configuration (visibility, width, pinning), row selection and expandable rows.',
  },
  {
    id: 'pivot-table',
    name: 'Pivot table',
    familyId: 'tabular',
    description: 'Grouped rows and columns with aggregation.',
  },
  {
    id: 'comparison-table',
    name: 'Comparison table',
    familyId: 'tabular',
    description: 'Side-by-side entities across fixed metrics.',
  },

  // Trend
  { id: 'line-chart', name: 'Line chart', familyId: 'trend', description: 'Values joined over time.' },
  { id: 'area-chart', name: 'Area chart', familyId: 'trend', description: 'Line chart with the area beneath filled.' },
  { id: 'spline-chart', name: 'Spline chart', familyId: 'trend', description: 'Curve-smoothed line over time.' },
  { id: 'step-chart', name: 'Step chart', familyId: 'trend', description: 'Discrete level changes over time.' },

  // Categorical Comparison
  {
    id: 'bar-chart-vertical',
    name: 'Bar chart (vertical)',
    familyId: 'categorical-comparison',
    description: 'One bar per category, measured on the vertical axis.',
  },
  {
    id: 'bar-chart-horizontal',
    name: 'Bar chart (horizontal)',
    familyId: 'categorical-comparison',
    description: 'One bar per category, measured on the horizontal axis. Suits long category labels.',
  },
  {
    id: 'grouped-bar-chart',
    name: 'Grouped bar chart',
    familyId: 'categorical-comparison',
    description: 'Several Measures shown side by side within each category.',
  },
  {
    id: 'stacked-bar-chart',
    name: 'Stacked bar chart',
    familyId: 'categorical-comparison',
    description: 'Several Measures stacked within each category.',
  },

  // Composition
  { id: 'pie-chart', name: 'Pie chart', familyId: 'composition', description: 'Shares of a whole as circular segments.' },
  { id: 'donut-chart', name: 'Donut chart', familyId: 'composition', description: 'Pie chart with a hollow centre, often carrying the total.' },
  {
    id: 'stacked-100-bar',
    name: 'Stacked 100% bar',
    familyId: 'composition',
    description: 'Shares of a whole as proportions of a full-width bar.',
  },
  { id: 'treemap', name: 'Treemap', familyId: 'composition', description: 'Shares of a whole as nested rectangles sized by value.' },

  // Distribution
  { id: 'histogram', name: 'Histogram', familyId: 'distribution', description: 'Record counts bucketed by value range.' },
  { id: 'box-plot', name: 'Box plot', familyId: 'distribution', description: 'Quartiles, median and outliers.' },
  { id: 'violin-plot', name: 'Violin plot', familyId: 'distribution', description: 'Density of values across the range.' },

  // Correlation
  { id: 'scatter-plot', name: 'Scatter plot', familyId: 'correlation', description: 'One point per record against two Measures.' },
  {
    id: 'bubble-chart',
    name: 'Bubble chart',
    familyId: 'correlation',
    description: 'Scatter plot with a third Measure encoded as point size.',
  },
  {
    id: 'heatmap-matrix',
    name: 'Heatmap matrix',
    familyId: 'correlation',
    description: 'Pairwise Measure relationships encoded as colour intensity.',
  },

  // Ranking & Flow
  { id: 'ranked-list', name: 'Top-N / ranked list', familyId: 'ranking-and-flow', description: 'Categories ordered by a Measure, truncated to the top N.' },
  {
    id: 'leaderboard',
    name: 'Leaderboard',
    familyId: 'ranking-and-flow',
    description: 'Rank, score and movement indicator against the previous period.',
  },
  { id: 'funnel', name: 'Funnel', familyId: 'ranking-and-flow', description: 'Drop-off across sequential stages.' },
  { id: 'sankey', name: 'Sankey', familyId: 'ranking-and-flow', description: 'Flow volume between stages or categories.' },
  { id: 'bar-chart-race', name: 'Bar chart race', familyId: 'ranking-and-flow', description: 'Ranking animated across time periods.' },

  // Geospatial
  {
    id: 'choropleth-map',
    name: 'Choropleth map',
    familyId: 'geospatial',
    description: 'Regions shaded by a Measure.',
  },
  { id: 'point-map', name: 'Point / pin map', familyId: 'geospatial', description: 'Individual locations plotted as points.' },

  // Radial
  { id: 'radar-chart', name: 'Radar / spider chart', familyId: 'radial', description: 'Several Measures on radial axes from a shared centre.' },
  { id: 'gauge', name: 'Gauge / speedometer', familyId: 'radial', description: 'A single Measure against a range, usually with a target.' },

  // Single Value
  {
    id: 'stat-card',
    name: 'Stat card',
    familyId: 'single-value',
    description: 'Large number with a label and a trend arrow or percentage.',
  },
  {
    id: 'sparkline-card',
    name: 'Sparkline card',
    familyId: 'single-value',
    description: 'Stat card with an embedded mini line or bar chart. Needs a Time Dimension for the spark.',
  },
  {
    id: 'progress-tracker',
    name: 'Progress / goal tracker',
    familyId: 'single-value',
    description: 'Value against a target, as a bar or a ring.',
  },
  {
    id: 'delta-card',
    name: 'Delta card',
    familyId: 'single-value',
    description: 'Current period against the previous one. Needs a Time Dimension.',
  },

  // Temporal Pattern
  {
    id: 'calendar-heatmap',
    name: 'Calendar heatmap',
    familyId: 'temporal-pattern',
    description: 'Contribution-grid style: one cell per day, shaded by a Measure.',
  },
  { id: 'cohort-grid', name: 'Cohort / retention grid', familyId: 'temporal-pattern', description: 'Cohorts down, elapsed periods across.' },
  { id: 'timeline-chart', name: 'Gantt / timeline chart', familyId: 'temporal-pattern', description: 'Spans positioned and sized along a time axis.' },

  // Chronological
  { id: 'activity-feed', name: 'Activity feed / timeline', familyId: 'chronological', description: 'Chronological events, most recent first.' },
  { id: 'event-log-view', name: 'Log / event viewer', familyId: 'chronological', description: 'Raw or structured event stream.' },

  // Status
  {
    id: 'status-indicator',
    name: 'Status badge / indicator',
    familyId: 'status',
    description: 'Health, uptime or pass/fail state.',
  },
  {
    id: 'threshold-indicator',
    name: 'Threshold indicator',
    familyId: 'status',
    description: 'Traffic-light presentation of a Measure against configured thresholds.',
  },
  { id: 'alert-banner', name: 'Alert / notification banner', familyId: 'status', description: 'Prominent banner when a state warrants attention. Display only — Analytics does not alert (§10).' },
]

export function typesInFamily(familyId: string): VisualizationType[] {
  return visualizationTypes.filter((t) => t.familyId === familyId)
}

export function getVisualizationType(id: string): VisualizationType | undefined {
  return visualizationTypes.find((t) => t.id === id)
}
