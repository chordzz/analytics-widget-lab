/**
 * The primitive set.
 *
 * Each is a pure visualisation: it takes an array and display config, draws,
 * and knows nothing about dashboards, datasets or fetching. Importable
 * anywhere in the host portal — inside a widget, on a detail page, in a report.
 */

export { TrendChart, Sparkline } from './TrendChart'
export type { TrendChartProps, TrendVariant } from './TrendChart'

export { BarChart } from './BarChart'
export type { BarChartProps, BarVariant } from './BarChart'

export { DonutChart } from './DonutChart'
export type { DonutChartProps } from './DonutChart'

export { StatTile } from './StatTile'
export type { StatTileProps } from './StatTile'

export { GaugeTile } from './GaugeTile'
export type { GaugeTileProps } from './GaugeTile'

export { StatusList, StatusTile } from './StatusList'
export type { StatusListProps } from './StatusList'

export { ThresholdTile, AlertBanner } from './ThresholdTile'
export type { ThresholdTileProps, AlertBannerProps } from './ThresholdTile'

export { EventLog } from './EventLog'
export type { EventLogProps } from './EventLog'

export { RankedList } from './RankedList'
export type { RankedListProps } from './RankedList'

export { DataTable } from './DataTable'
export type { DataTableProps } from './DataTable'

export { ComparisonTable } from './ComparisonTable'
export type { ComparisonTableProps } from './ComparisonTable'

export { ScatterChart, BubbleChart } from './ScatterChart'
export type { ScatterChartProps } from './ScatterChart'

export { RadarChart } from './RadarChart'
export type { RadarChartProps } from './RadarChart'

export { Treemap } from './Treemap'
export type { TreemapProps } from './Treemap'

export { FunnelChart } from './FunnelChart'
export type { FunnelChartProps } from './FunnelChart'

export { SankeyChart } from './SankeyChart'
export type { SankeyChartProps } from './SankeyChart'

export { Histogram, BoxPlot, ViolinPlot } from './Distribution'
export type { HistogramProps, BoxPlotProps, ViolinPlotProps } from './Distribution'

export { CalendarHeatmap } from './CalendarHeatmap'
export type { CalendarHeatmapProps } from './CalendarHeatmap'

export { CohortGrid } from './CohortGrid'
export type { CohortGridProps } from './CohortGrid'

export { GanttChart } from './GanttChart'
export type { GanttChartProps } from './GanttChart'

export { ActivityFeed } from './ActivityFeed'
export type { ActivityFeedProps } from './ActivityFeed'

export { PivotTable } from './PivotTable'
export type { PivotTableProps } from './PivotTable'

export { PointMap } from './PointMap'
export type { PointMapProps } from './PointMap'

export { Legend } from './shared'
export type { ChartProps, SeriesSpec } from './shared'

export { HeatmapMatrix, correlation } from './HeatmapMatrix'
export type { HeatmapMatrixProps } from './HeatmapMatrix'

export { BarChartRace } from './BarChartRace'
export type { BarChartRaceProps } from './BarChartRace'
