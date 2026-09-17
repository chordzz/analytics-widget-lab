/**
 * The widget catalogue.
 *
 * Metadata only — what a widget is called, which family it belongs to, what it
 * needs from a dataset and how big it wants to be. The drawing lives in the
 * primitives; the picker and the gallery read this.
 *
 * Families follow the FRD's classification so the vocabulary stays consistent
 * with the other track. Types not yet built are listed with `built: false`
 * rather than omitted — a catalogue that silently hides what is missing makes
 * the gap invisible.
 */

export type FamilyId =
  | 'trend'
  | 'categorical-comparison'
  | 'composition'
  | 'distribution'
  | 'correlation'
  | 'ranking-and-flow'
  | 'geospatial'
  | 'radial'
  | 'single-value'
  | 'temporal-pattern'
  | 'chronological'
  | 'status'
  | 'tabular'

export interface Family {
  id: FamilyId
  label: string
  question: string
}

/** Ordered by how often they appear on a real dashboard, not alphabetically. */
export const FAMILIES: Family[] = [
  { id: 'single-value', label: 'Single value', question: 'What is the number right now?' },
  { id: 'trend', label: 'Trend', question: 'How has this changed over time?' },
  { id: 'categorical-comparison', label: 'Categorical comparison', question: 'How do these categories compare?' },
  { id: 'composition', label: 'Composition', question: 'What are the parts of this whole?' },
  { id: 'ranking-and-flow', label: 'Ranking & flow', question: 'What is the order, or where is the drop-off?' },
  { id: 'status', label: 'Status', question: 'Is this healthy?' },
  { id: 'radial', label: 'Radial', question: 'How does this compare against a target?' },
  { id: 'tabular', label: 'Tabular', question: 'What are the individual records?' },
  { id: 'distribution', label: 'Distribution', question: 'How are these values spread?' },
  { id: 'correlation', label: 'Correlation', question: 'Do these move together?' },
  { id: 'temporal-pattern', label: 'Temporal pattern', question: 'What is the pattern across periods?' },
  { id: 'chronological', label: 'Chronological', question: 'What happened, in order?' },
  { id: 'geospatial', label: 'Geospatial', question: 'Where is this happening?' },
]

/** What a widget type needs from a dataset, for the picker to filter on. */
export interface DataNeeds {
  time?: number
  dimensions?: number
  measures?: number
  /** Wants a Dimension flagged geographic. */
  geo?: boolean
  /** Wants a lot of rows to be worth drawing. */
  manyRows?: boolean
}

export interface WidgetType {
  id: string
  label: string
  family: FamilyId
  description: string
  needs: DataNeeds
  /** Columns on a 12-column board. */
  defaultSpan: number
  /** Whether a renderer exists yet. */
  built: boolean
}

export const WIDGET_TYPES: WidgetType[] = [
  // Single value
  { id: 'stat-card', label: 'Stat card', family: 'single-value', description: 'A number with a label and a change indicator.', needs: { measures: 1 }, defaultSpan: 3, built: true },
  { id: 'sparkline-card', label: 'Sparkline card', family: 'single-value', description: 'A stat card with the trend behind the number.', needs: { measures: 1, time: 1 }, defaultSpan: 3, built: true },
  { id: 'delta-card', label: 'Delta card', family: 'single-value', description: 'This period against the last.', needs: { measures: 1, time: 1 }, defaultSpan: 3, built: true },
  { id: 'progress-tracker', label: 'Progress tracker', family: 'single-value', description: 'A value against a target, as a ring.', needs: { measures: 2 }, defaultSpan: 3, built: true },

  // Trend
  { id: 'line-chart', label: 'Line chart', family: 'trend', description: 'Values joined over time.', needs: { time: 1, measures: 1 }, defaultSpan: 8, built: true },
  { id: 'area-chart', label: 'Area chart', family: 'trend', description: 'A line with the area beneath filled.', needs: { time: 1, measures: 1 }, defaultSpan: 8, built: true },
  { id: 'spline-chart', label: 'Spline chart', family: 'trend', description: 'A smoothed curve over time.', needs: { time: 1, measures: 1 }, defaultSpan: 8, built: true },
  { id: 'step-chart', label: 'Step chart', family: 'trend', description: 'Discrete level changes over time.', needs: { time: 1, measures: 1 }, defaultSpan: 8, built: true },

  // Categorical
  { id: 'bar-chart-vertical', label: 'Bar chart', family: 'categorical-comparison', description: 'One bar per category.', needs: { dimensions: 1, measures: 1 }, defaultSpan: 6, built: true },
  { id: 'bar-chart-horizontal', label: 'Horizontal bar', family: 'categorical-comparison', description: 'Bars running sideways. Suits long labels.', needs: { dimensions: 1, measures: 1 }, defaultSpan: 6, built: true },
  { id: 'grouped-bar-chart', label: 'Grouped bar', family: 'categorical-comparison', description: 'Several measures side by side per category.', needs: { dimensions: 1, measures: 2 }, defaultSpan: 6, built: true },
  { id: 'stacked-bar-chart', label: 'Stacked bar', family: 'categorical-comparison', description: 'Several measures stacked per category.', needs: { dimensions: 1, measures: 2 }, defaultSpan: 6, built: true },

  // Composition
  { id: 'pie-chart', label: 'Pie chart', family: 'composition', description: 'Shares of a whole as segments.', needs: { dimensions: 1, measures: 1 }, defaultSpan: 4, built: true },
  { id: 'donut-chart', label: 'Donut chart', family: 'composition', description: 'A pie with the total in the centre.', needs: { dimensions: 1, measures: 1 }, defaultSpan: 4, built: true },
  { id: 'treemap', label: 'Treemap', family: 'composition', description: 'Shares as nested rectangles.', needs: { dimensions: 1, measures: 1 }, defaultSpan: 6, built: true },
  { id: 'stacked-100-bar', label: 'Stacked 100% bar', family: 'composition', description: 'Composition per category, every bar full width.', needs: { dimensions: 1, measures: 2 }, defaultSpan: 6, built: true },

  // Ranking
  { id: 'ranked-list', label: 'Ranked list', family: 'ranking-and-flow', description: 'Top N by a measure.', needs: { dimensions: 1, measures: 1 }, defaultSpan: 4, built: true },
  { id: 'leaderboard', label: 'Leaderboard', family: 'ranking-and-flow', description: 'Ranked, with movement between positions.', needs: { dimensions: 1, measures: 1 }, defaultSpan: 4, built: true },
  { id: 'funnel', label: 'Funnel', family: 'ranking-and-flow', description: 'Drop-off across ordered stages.', needs: { dimensions: 1, measures: 1 }, defaultSpan: 5, built: true },
  { id: 'sankey', label: 'Sankey', family: 'ranking-and-flow', description: 'Flow volume between nodes.', needs: { dimensions: 2, measures: 1 }, defaultSpan: 8, built: true },
  { id: 'bar-chart-race', label: 'Bar chart race', family: 'ranking-and-flow', description: 'How the ranking changed, period by period.', needs: { time: 1, dimensions: 1, measures: 1 }, defaultSpan: 6, built: true },

  // Status
  { id: 'status-list', label: 'Status list', family: 'status', description: 'Several entities and their current state.', needs: { dimensions: 2 }, defaultSpan: 4, built: true },
  { id: 'status-indicator', label: 'Status tile', family: 'status', description: 'One headline state.', needs: { dimensions: 2 }, defaultSpan: 3, built: true },
  { id: 'threshold-indicator', label: 'Threshold indicator', family: 'status', description: 'One figure against a line the author drew.', needs: { measures: 1 }, defaultSpan: 3, built: true },
  { id: 'alert-banner', label: 'Alert banner', family: 'status', description: 'A threshold breach as a strip across the board.', needs: { measures: 1 }, defaultSpan: 6, built: true },

  // Radial
  { id: 'gauge', label: 'Gauge', family: 'radial', description: 'A value against a target, as an arc.', needs: { measures: 2 }, defaultSpan: 3, built: true },
  { id: 'radar-chart', label: 'Radar chart', family: 'radial', description: 'Several measures on radial axes.', needs: { measures: 3 }, defaultSpan: 4, built: true },

  // Tabular
  { id: 'data-table', label: 'Data table', family: 'tabular', description: 'Sortable rows and columns.', needs: {}, defaultSpan: 8, built: true },
  { id: 'pivot-table', label: 'Pivot table', family: 'tabular', description: 'Grouped rows and columns with aggregation.', needs: { dimensions: 2, measures: 1 }, defaultSpan: 8, built: true },
  { id: 'comparison-table', label: 'Comparison table', family: 'tabular', description: 'Entities side by side down a fixed list of metrics.', needs: { dimensions: 1, measures: 2 }, defaultSpan: 6, built: true },

  // Distribution, correlation, temporal pattern, chronological, geospatial
  { id: 'histogram', label: 'Histogram', family: 'distribution', description: 'Record counts bucketed by value.', needs: { measures: 1, manyRows: true }, defaultSpan: 6, built: true },
  { id: 'box-plot', label: 'Box plot', family: 'distribution', description: 'Quartiles, median and outliers.', needs: { measures: 1, manyRows: true }, defaultSpan: 6, built: true },
  { id: 'violin-plot', label: 'Violin plot', family: 'distribution', description: 'The shape of the spread, not just its quartiles.', needs: { dimensions: 1, measures: 1, manyRows: true }, defaultSpan: 6, built: true },
  { id: 'scatter-plot', label: 'Scatter plot', family: 'correlation', description: 'One point per record against two measures.', needs: { measures: 2 }, defaultSpan: 6, built: true },
  { id: 'bubble-chart', label: 'Bubble chart', family: 'correlation', description: 'Scatter with size as a third measure.', needs: { measures: 3 }, defaultSpan: 6, built: true },
  { id: 'heatmap-matrix', label: 'Heatmap matrix', family: 'correlation', description: 'Every pair of measures at once, by colour.', needs: { measures: 3 }, defaultSpan: 6, built: true },
  { id: 'calendar-heatmap', label: 'Calendar heatmap', family: 'temporal-pattern', description: 'One cell per day, shaded by value.', needs: { time: 1, measures: 1 }, defaultSpan: 8, built: true },
  { id: 'cohort-grid', label: 'Cohort grid', family: 'temporal-pattern', description: 'Cohorts down, elapsed periods across.', needs: { time: 1, dimensions: 1, measures: 1 }, defaultSpan: 8, built: true },
  { id: 'timeline-chart', label: 'Gantt chart', family: 'temporal-pattern', description: 'Spans along a time axis.', needs: { dimensions: 1, measures: 2 }, defaultSpan: 8, built: true },
  { id: 'activity-feed', label: 'Activity feed', family: 'chronological', description: 'Events, most recent first.', needs: { time: 1 }, defaultSpan: 4, built: true },
  { id: 'event-log-view', label: 'Event log', family: 'chronological', description: 'The same events as a dense record.', needs: { time: 1 }, defaultSpan: 6, built: true },
  { id: 'point-map', label: 'Point map', family: 'geospatial', description: 'Places plotted as points, sized by a measure.', needs: { geo: true, measures: 1 }, defaultSpan: 8, built: true },
  { id: 'choropleth-map', label: 'Choropleth map', family: 'geospatial', description: 'Regions shaded by a measure. Needs boundary geometry.', needs: { geo: true, measures: 1 }, defaultSpan: 6, built: false },
]

/**
 * Ids this catalogue used before it adopted the FRD's, and what they became.
 *
 * The module named these itself while it was a parallel track; the FRD names
 * them too, and the no-synonyms rule makes the FRD's the right ones. Two of the
 * seven were not abbreviations but different words for the same thing —
 * `gantt-chart` is the FRD's `timeline-chart` ("Gantt / timeline chart"), and
 * `status-tile` is its `status-indicator` ("Status badge / indicator").
 *
 * This map has to exist because **a widget's `typeId` is persisted**. A saved
 * board holds the id the widget was created with, so renaming the catalogue
 * without translating storage turns every bar chart on every saved board into
 * an error card reading "No widget type 'bar-vertical'". `boards.ts` applies it
 * on read; see `renamed()` there.
 *
 * It is append-only. A future rename adds a row rather than editing one, or
 * boards saved between the two renames become unreadable.
 */
export const RENAMED_TYPES: Readonly<Record<string, string>> = {
  'bar-vertical': 'bar-chart-vertical',
  'bar-horizontal': 'bar-chart-horizontal',
  'bar-grouped': 'grouped-bar-chart',
  'bar-stacked': 'stacked-bar-chart',
  choropleth: 'choropleth-map',
  'gantt-chart': 'timeline-chart',
  'status-tile': 'status-indicator',
}

/** A stored type id brought up to the current catalogue. Unknown ids pass through. */
export const currentTypeId = (id: string): string => RENAMED_TYPES[id] ?? id

export const widgetType = (id: string): WidgetType | undefined =>
  WIDGET_TYPES.find((type) => type.id === id)

export const typesInFamily = (family: FamilyId): WidgetType[] =>
  WIDGET_TYPES.filter((type) => type.family === family)

export const builtTypes = (): WidgetType[] => WIDGET_TYPES.filter((type) => type.built)

export const coverage = () => ({
  builtTypes: WIDGET_TYPES.filter((t) => t.built).length,
  totalTypes: WIDGET_TYPES.length,
  builtFamilies: new Set(WIDGET_TYPES.filter((t) => t.built).map((t) => t.family)).size,
  totalFamilies: FAMILIES.length,
})
