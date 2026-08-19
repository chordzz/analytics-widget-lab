/**
 * Renderer registration.
 *
 * Kept apart from the classification manifest on purpose. All 13 Families and
 * 42 Visualization Types are classified (FR-VZ-01/02) whether or not anything
 * can draw them; this file records what has actually been built. Phase 2 covers
 * four Families spanning distinct Data Shapes — enough to validate the model
 * without paying for all 42 renderers up front.
 *
 * A Type that is classified but unregistered renders a clear notice rather than
 * failing, so the gap is visible instead of mysterious.
 *
 * Phase 7 adds five more Families, chosen because every one of them is
 * *decidable and satisfied* by the fixture Datasets today — so each is
 * immediately reachable rather than built against a Data Shape nothing can yet
 * satisfy. The four still unbuilt are unbuilt for stated reasons: Composition,
 * Distribution and Geospatial cannot be evaluated at all under the current
 * publication model (Finding 1), and Temporal Pattern needs daily-grain
 * fixtures the monthly ones cannot provide.
 */

import { registerRenderer } from '../widget-runtime/renderer'
import {
  AreaChartRenderer,
  LineChartRenderer,
  SplineChartRenderer,
  StepChartRenderer,
} from './TrendRenderer'
import {
  GroupedBarRenderer,
  HorizontalBarRenderer,
  StackedBarRenderer,
  VerticalBarRenderer,
} from './CategoricalComparisonRenderer'
import {
  DeltaCardRenderer,
  ProgressTrackerRenderer,
  SparklineCardRenderer,
  StatCardRenderer,
} from './SingleValueRenderer'
import { TabularRenderer } from './TabularRenderer'
import { BubbleChartRenderer, ScatterPlotRenderer } from './CorrelationRenderer'
import { LeaderboardRenderer, RankedListRenderer } from './RankingRenderer'
import {
  AlertBannerRenderer,
  StatusIndicatorRenderer,
  ThresholdIndicatorRenderer,
} from './StatusRenderer'
import { ActivityFeedRenderer, EventLogRenderer } from './ChronologicalRenderer'
import { GaugeRenderer, RadarChartRenderer } from './RadialRenderer'

let registered = false

/** Idempotent — safe to call from module scope and across hot reloads. */
export function registerBuiltInRenderers(): void {
  if (registered) return
  registered = true

  // Trend
  registerRenderer({ visualizationTypeId: 'line-chart', render: LineChartRenderer })
  registerRenderer({ visualizationTypeId: 'area-chart', render: AreaChartRenderer })
  registerRenderer({ visualizationTypeId: 'spline-chart', render: SplineChartRenderer })
  registerRenderer({ visualizationTypeId: 'step-chart', render: StepChartRenderer })

  // Categorical Comparison
  registerRenderer({ visualizationTypeId: 'bar-chart-vertical', render: VerticalBarRenderer })
  registerRenderer({ visualizationTypeId: 'bar-chart-horizontal', render: HorizontalBarRenderer })
  registerRenderer({ visualizationTypeId: 'grouped-bar-chart', render: GroupedBarRenderer })
  registerRenderer({ visualizationTypeId: 'stacked-bar-chart', render: StackedBarRenderer })

  // Single Value
  registerRenderer({ visualizationTypeId: 'stat-card', render: StatCardRenderer })
  registerRenderer({ visualizationTypeId: 'sparkline-card', render: SparklineCardRenderer })
  registerRenderer({ visualizationTypeId: 'progress-tracker', render: ProgressTrackerRenderer })
  registerRenderer({ visualizationTypeId: 'delta-card', render: DeltaCardRenderer })

  // Tabular
  registerRenderer({ visualizationTypeId: 'data-table', render: TabularRenderer })

  // Correlation
  registerRenderer({ visualizationTypeId: 'scatter-plot', render: ScatterPlotRenderer })
  registerRenderer({ visualizationTypeId: 'bubble-chart', render: BubbleChartRenderer })

  // Ranking & Flow — the Dimension+Measure route only; ordered stage data is
  // not expressible in the publication model, so funnel and sankey stay
  // classified but unbuilt.
  registerRenderer({ visualizationTypeId: 'ranked-list', render: RankedListRenderer })
  registerRenderer({ visualizationTypeId: 'leaderboard', render: LeaderboardRenderer })

  // Status — displays threshold state; alerting on a breach is out of scope.
  registerRenderer({ visualizationTypeId: 'status-indicator', render: StatusIndicatorRenderer })
  registerRenderer({ visualizationTypeId: 'threshold-indicator', render: ThresholdIndicatorRenderer })
  registerRenderer({ visualizationTypeId: 'alert-banner', render: AlertBannerRenderer })

  // Chronological
  registerRenderer({ visualizationTypeId: 'activity-feed', render: ActivityFeedRenderer })
  registerRenderer({ visualizationTypeId: 'event-log-view', render: EventLogRenderer })

  // Radial
  registerRenderer({ visualizationTypeId: 'gauge', render: GaugeRenderer })
  registerRenderer({ visualizationTypeId: 'radar-chart', render: RadarChartRenderer })
}
