/**
 * Chrome plus primitive, joined.
 *
 * This is the only place the two layers meet. A `WidgetSpec` says which type,
 * which dataset and which fields; this resolves that to a primitive inside a
 * card. Everything above it deals in specs; everything below it deals in
 * arrays and colours.
 */

import { WidgetCard, type WidgetAction, type WidgetState } from './WidgetCard'
import { widgetType } from './catalog'
import { thresholdFrom } from './threshold'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useDataset, useWidgetRows } from '../data/AnalyticsData'
import { WidgetFilters } from './WidgetFilters'
import { governedParameters, rangeSignature, singleValueOf, withoutGoverned } from '../data/query'
import type { ViewerChoices } from '../data/query'
import type { QueryContribution } from '../../composition/correspondence'
import type { PartialResult } from '../../retrieval/port'
import { fieldOf } from '../data/types'
import {
  ActivityFeed,
  BarChart,
  BarChartRace,
  BoxPlot,
  CalendarHeatmap,
  CohortGrid,
  ComparisonTable,
  DataTable,
  DonutChart,
  FunnelChart,
  GanttChart,
  GaugeTile,
  HeatmapMatrix,
  Histogram,
  PivotTable,
  PointMap,
  RadarChart,
  RankedList,
  SankeyChart,
  ScatterChart,
  StatTile,
  StatusList,
  ThresholdTile,
  AlertBanner,
  EventLog,
  StatusTile,
  Treemap,
  TrendChart,
  ViolinPlot,
} from './primitives'
import type { Dataset, Row } from '../data/types'
import type { StatusTone } from '../theme/tokens'

/** Which fields of the bound dataset play which part. */
export interface WidgetMapping {
  /** Time or category axis. */
  x?: string
  /** Measures to plot, in order. */
  series?: string[]
  /** Single measure, for tiles and composition. */
  value?: string
  /** Measure holding the target, for gauges. */
  target?: string
  /** Field holding a state, for status widgets. */
  state?: string
  /** Columns, for tables. */
  columns?: string[]
  /** Second dimension — pivot columns, sankey target, scatter grouping. */
  secondary?: string
  /** Latitude and longitude, for maps. */
  lat?: string
  lng?: string
}

export interface WidgetSpec {
  id: string
  typeId: string
  datasetId: string
  title?: string
  subtitle?: string
  mapping: WidgetMapping
  options?: Record<string, unknown>
  /**
   * FR-VZ-06 — Fields of the bound Dataset a Viewer may filter on.
   *
   * The Author's choice, and bounded twice over. Only Fields the *publisher*
   * declared `filterable` may appear here (FR-DP-05): an Author cannot expose
   * what the Source System withheld, and a Widget cannot overrule a publisher
   * any more than a Dashboard Control can.
   *
   * Distinct from a Dashboard Control (FR-CO-05), which acts across Widgets.
   * These belong to this Widget alone.
   */
  exposedFilters?: string[]
  /** FR-VZ-06 — Fields a Viewer may reorder by. Same constraint, via `sortable`. */
  exposedSorts?: string[]
  /**
   * Values the Author fixed for the Dataset's Filter Parameters — D24.
   *
   * A third kind of narrowing, and distinct from both the others. An exposed
   * filter is the *Viewer's* to set and is never persisted; a Dashboard Control
   * is the Viewer's too, across several Widgets. A binding is the **Author's**,
   * it is part of what this Widget is, and it travels with the Widget.
   *
   * It exists because a Filter Parameter may be `required` — the Source System
   * cannot answer without it. A Widget over such a Dataset is not a Widget with
   * an unset filter; it is a query that will be refused. So the value is
   * collected when the Widget is composed, or the Widget is not composable.
   */
  parameterBindings?: Record<string, string | number>
  /*
   * No size and no position.
   *
   * A spec says what to draw; where it sits is the board's business. Keeping
   * placement off this type is what lets the two smaller entry points in
   * CONTRACT.md stay honest — a chart on a detail page owes nothing to a
   * dashboard, and it should not have to name a column to render.
   *
   * A widget on a board is a `PlacedWidget` — this plus `x`, `y`, `w`, `h`. See
   * `builder/boards.ts`.
   */
}

export interface WidgetProps {
  spec: WidgetSpec
  /** Overrides the resolved state. Used by the gallery to show loading and error. */
  state?: WidgetState
  /**
   * Overrides the resolved partial marker. Same slot as `state`, and needed
   * separately because partial is a qualifier rather than a status — a gallery
   * that could only override the six could never show this one.
   */
  partial?: PartialResult
  actions?: WidgetAction[]
  selected?: boolean
  onSelect?: () => void
  /** Fixed body height. Omit to fill the grid cell. */
  height?: number
  /**
   * What a Dashboard Control contributes to this widget's query (FR-CO-05).
   *
   * Already resolved by the board — a widget does not know which Controls
   * exist, only what reached it, which is why adding a Control needs no change
   * here.
   */
  contribution?: QueryContribution
}

export interface WidgetViewProps extends WidgetProps {
  /** The bound Dataset's description. Null while unknown or withdrawn. */
  dataset: Dataset | null
  rows?: readonly Row[]
  errorMessage?: string
  /** The exposed filters, already resolved. Pure: this component owns no state. */
  controls?: ReactNode
}

/**
 * A widget, drawn from rows that are already in hand.
 *
 * Pure: no fetching, no effects, no context. That is what makes it renderable on
 * a server, in a test, and inside a host that already has the rows — and it is
 * the same split the workbench draws between `WidgetHost` and `WidgetFrame`.
 * `Widget` below is the thin asynchronous wrapper.
 */
export function WidgetView({
  spec,
  dataset,
  rows = [],
  state = 'ready',
  actions,
  selected,
  onSelect,
  height,
  errorMessage,
  partial,
  controls,
}: WidgetViewProps) {
  const type = widgetType(spec.typeId)

  // A spec pointing at a missing type is a wiring bug, not a data state — say so
  // plainly rather than rendering an empty chart. A missing *dataset* is not the
  // same thing any more: it can mean withdrawn, or denied, or simply not
  // arrived, so that judgement belongs to whoever resolved the state.
  if (!type) {
    return (
      <WidgetCard
        title={spec.title ?? spec.typeId}
        state="failed"
        errorMessage={`No widget type '${spec.typeId}'.`}
      />
    )
  }

  if (!type.built) {
    return (
      <WidgetCard
        title={spec.title ?? type.label}
        subtitle={spec.subtitle}
        state="empty"
        emptyMessage={`${type.label} has no renderer yet.`}
      />
    )
  }

  const bare = type.family === 'single-value' || type.id === 'status-indicator'
  // Lists and tables read as text, so they keep the wider inset. Plots give
  // the padding back to the plot.
  const textLed =
    ['status', 'chronological'].includes(type.family) ||
    ['data-table', 'pivot-table', 'ranked-list', 'leaderboard', 'cohort-grid'].includes(type.id)

  return (
    <WidgetCard
      title={spec.title ?? type.label}
      subtitle={spec.subtitle}
      state={state}
      errorMessage={errorMessage}
      partial={partial}
      actions={actions}
      selected={selected}
      onSelect={onSelect}
      bare={bare}
      textLed={textLed}
      controls={controls}
      style={height ? { height } : undefined}
    >
      {state === 'ready' && dataset ? renderBody(spec, type.id, rows, dataset) : null}
    </WidgetCard>
  )
}

/**
 * Which of the six states a card is in — the whole decision, in one place.
 *
 * Three ways a card can be without a Dataset, and **only one of them is a
 * withdrawal**:
 *
 *   - the Catalogue *answered* "no such Dataset" — a withdrawal from a Viewer's
 *     side, because it was bound once and so existed once. Drawing it as a
 *     failure would say the system is broken while the system is working.
 *   - the Catalogue *did not answer* — a failure, and the mistake this used to
 *     make. A `503` while describing rendered "the source system has withdrawn
 *     this dataset": a statement about a decision a publisher took, made because
 *     IAM was briefly unreachable. Untrue, unfalsifiable from the card, and
 *     whoever acts on it goes looking for a choice nobody made.
 *   - we have not asked yet — loading.
 *
 * Exported and pure so it can be tested as itself. Left inline it could only be
 * checked by a test that restated it, which proves the copy and not the code.
 */
export function stateForWidget(input: {
  describing: boolean
  describeFailed: boolean
  hasDataset: boolean
  retrieved: WidgetState
}): WidgetState {
  if (input.describing) return 'loading'
  if (input.describeFailed) return 'failed'
  if (!input.hasDataset) return 'withdrawn'
  return input.retrieved
}

/**
 * A widget that fetches its own rows.
 *
 * One retrieval per widget, with its own state, which is FR-DA-10 made
 * structural: a denial, a failure or a slow response on one card leaves every
 * other card on the board working. Sharing a request across a board would make
 * that impossible to honour.
 *
 * `state` overrides everything, which is how the Gallery shows all six
 * treatments without needing a Source System that can produce them on demand.
 */
export function Widget({
  spec,
  state: override,
  actions,
  selected,
  onSelect,
  height,
  contribution,
  partial: partialOverride,
}: WidgetProps) {
  const { dataset, loading: describing, failure: catalogueFailure } = useDataset(spec.datasetId)

  /*
   * The Viewer's filter choices live here and go no further.
   *
   * Not in the boards store, which is persisted: a Viewer narrowing a chart is
   * reading the Author's dashboard, not editing it, and writing their choice
   * would change what everyone else sees because one person looked. Per widget
   * rather than per board for the same reason FR-VZ-06 is per Widget — these
   * belong to this card alone. A Dashboard Control (FR-CO-05) is the other
   * thing, and it is Stage 6.3.
   */
  const [choices, setChoices] = useState<ViewerChoices>({})

  /*
   * Moving the board's range clears what this card was nudged to.
   *
   * Three layers decide a parameter — the Author's default, the Control, then
   * the Viewer's own choice on this Widget — and the Viewer's wins. That is
   * right while they are looking at one card, and wrong the moment they reach
   * for the board's range again: the control they just used would be the one
   * thing on screen that did nothing.
   *
   * So a Viewer's override is a deviation from the board rather than a
   * replacement for it, and the board re-asserts. Only over the parameters the
   * Control actually governs — a date range has nothing to say about a
   * `status` this card was filtered to, and clearing that would throw away a
   * choice nobody overruled.
   *
   * Keyed on the range's *value*, not the contribution's identity. Comparing
   * objects would clear the override on every render, which is the same bug as
   * never clearing it and considerably harder to see.
   */
  const lastRange = useRef(rangeSignature(contribution))
  useEffect(() => {
    const signature = rangeSignature(contribution)
    if (signature === lastRange.current) return
    lastRange.current = signature

    const governed = dataset ? governedParameters(dataset, contribution) : []
    if (governed.length === 0) return

    setChoices((current) => withoutGoverned(current, governed))
  }, [contribution, dataset])

  const retrieved = useWidgetRows(spec, dataset, choices, contribution)

  const controls =
    dataset && (spec.exposedFilters?.length || spec.exposedSorts?.length) ? (
      <WidgetFilters
        dataset={dataset}
        filters={spec.exposedFilters ?? []}
        sorts={spec.exposedSorts ?? []}
        choices={choices}
        onChange={setChoices}
        // What the Author bound, so an exposed required parameter opens on a
        // value rather than on an empty box the endpoint would refuse.
        bindings={spec.parameterBindings}
      />
    ) : undefined

  if (override) {
    return (
      <WidgetView
        spec={spec}
        dataset={dataset}
        rows={retrieved.status === 'ready' ? retrieved.rows : []}
        state={override}
        partial={partialOverride}
        controls={controls}
        actions={actions}
        selected={selected}
        onSelect={onSelect}
        height={height}
      />
    )
  }

  const state = stateForWidget({
    describing,
    describeFailed: catalogueFailure !== null,
    hasDataset: dataset !== null,
    retrieved: retrieved.status,
  })

  /*
   * Only while the state it qualifies is actually on screen. A withdrawn
   * Dataset whose last retrieval happened to be partial must not carry the note
   * into a panel that is deliberately withholding figures.
   */
  const partial =
    partialOverride ??
    (state === retrieved.status &&
    (retrieved.status === 'ready' || retrieved.status === 'empty')
      ? retrieved.partial
      : undefined)

  return (
    <WidgetView
      spec={spec}
      dataset={dataset}
      rows={retrieved.status === 'ready' ? retrieved.rows : []}
      state={state}
      partial={partial}
      /*
       * The Catalogue's reason outranks the retrieval's. If describing failed
       * there was no retrieval, so `retrieved` is still holding whatever it said
       * before — and a stale message under a fresh failure sends someone after
       * the wrong thing.
       */
      errorMessage={
        catalogueFailure?.message ??
        (retrieved.status === 'failed' ? retrieved.message : undefined)
      }
      controls={controls}
      actions={actions}
      selected={selected}
      onSelect={onSelect}
      height={height}
    />
  )
}

function renderBody(
  spec: WidgetSpec,
  typeId: string,
  rows: readonly Row[],
  dataset: Dataset,
) {
  const { mapping, options = {} } = spec

  const seriesSpecs = (mapping.series ?? []).map((key) => ({
    key,
    label: fieldOf(dataset, key)?.label ?? key,
  }))

  const primaryFormat = fieldOf(dataset, mapping.value ?? mapping.series?.[0] ?? '')?.format

  switch (typeId) {
    case 'line-chart':
    case 'area-chart':
    case 'spline-chart':
    case 'step-chart':
      return (
        <TrendChart
          data={rows}
          xKey={mapping.x ?? ''}
          series={seriesSpecs}
          variant={typeId.replace('-chart', '') as 'line' | 'area' | 'spline' | 'step'}
          format={primaryFormat}
        />
      )

    case 'bar-chart-vertical':
    case 'bar-chart-horizontal':
    case 'grouped-bar-chart':
    case 'stacked-bar-chart':
    case 'stacked-100-bar': {
      const variant =
        typeId === 'bar-chart-horizontal'
          ? 'horizontal'
          : typeId === 'grouped-bar-chart'
            ? 'grouped'
            : typeId === 'stacked-bar-chart'
              ? 'stacked'
              : typeId === 'stacked-100-bar'
                ? 'stacked-100'
                : 'vertical'
      return (
        <BarChart
          data={rows}
          xKey={mapping.x ?? ''}
          series={seriesSpecs}
          variant={variant}
          format={primaryFormat}
          colorByCategory={options.colorByCategory === true}
        />
      )
    }

    case 'pie-chart':
    case 'donut-chart':
      return (
        <DonutChart
          data={rows}
          xKey={mapping.x ?? ''}
          valueKey={mapping.value ?? ''}
          variant={typeId === 'pie-chart' ? 'pie' : 'donut'}
          format={primaryFormat}
          centerLabel={typeof options.centerLabel === 'string' ? options.centerLabel : undefined}
        />
      )

    case 'stat-card':
    case 'sparkline-card':
    case 'delta-card': {
      const key = mapping.value ?? ''
      const values = rows.map((row) => Number(row[key] ?? 0))
      const latest = values[values.length - 1] ?? 0
      const previous = values[values.length - 2] ?? latest

      /*
       * The roll-up is gone from here.
       *
       * It used to be computed in this switch — sum unless the field's *format*
       * was a percent or a duration, in which case average. The rule was right
       * and the location was wrong: how a Measure rolls up is a property of what
       * it is, the publisher declares it (FR-DP-04), and letting each widget
       * re-derive it is the divergent-definition failure this capability exists
       * to remove.
       *
       * A stat card now asks for the aggregate and receives one row. Delta and
       * sparkline cards are about the latest point and how it moved, so they
       * receive the series, ordered by its Time Dimension rather than by
       * whatever order the rows happened to arrive in.
       */
      /*
       * A stat card receives one aggregated row, so it has one number and no
       * comparison. That surfaced something the old code got wrong rather than
       * breaking something it got right: it displayed the whole period's
       * *total* beside a delta computed from the last two *records* — a
       * 24-month figure labelled "vs. last month". The two never described the
       * same thing.
       *
       * A comparison needs a second aggregate over a previous period, which is
       * a query this widget does not yet make. Until it does, a stat card shows
       * its figure and says nothing about movement, and the cards that exist to
       * show movement keep their series.
       */
      const isAggregate = typeId === 'stat-card'
      /*
       * The aggregate, whether or not the query's `measures` was honoured. The
       * deployed API relays the Source System's body verbatim and may ignore the
       * aggregation entirely (D22), in which case the whole column arrives and
       * `values[0]` would be the *first* record shown as if it were the total.
       * `singleValueOf` obeys the publisher's declared aggregation either way.
       */
      const aggregate = singleValueOf(spec, dataset, rows, key)
      /*
       * A comparison needs two points. One is not a flat period, it is a period
       * with nothing to compare against — which a Control makes reachable, by
       * narrowing a delta card to a single month. Showing "0%" there asserts
       * something false about the data.
       */
      const comparable = !isAggregate && values.length > 1 && previous !== 0

      return (
        <StatTile
          label={spec.title ?? fieldOf(dataset, key)?.label ?? key}
          value={isAggregate ? aggregate : latest}
          format={primaryFormat}
          delta={comparable ? latest / previous - 1 : undefined}
          direction={
            (options.direction as 'up-is-good' | 'down-is-good' | 'neutral') ?? 'up-is-good'
          }
          comparisonLabel={
            comparable && typeof options.comparisonLabel === 'string'
              ? options.comparisonLabel
              : undefined
          }
          trend={typeId === 'sparkline-card' ? rows.slice(-40) : undefined}
          trendKey={typeId === 'sparkline-card' ? key : undefined}
        />
      )
    }

    case 'progress-tracker':
    case 'gauge': {
      const valueKey = mapping.value ?? ''
      const targetKey = mapping.target ?? ''
      /*
       * "Current" is the last record of a time-ordered series, and the ordering
       * is now asked for in the query rather than assumed — see `queryFor`. A
       * Source System has no obligation to return rows in any order, so taking
       * the tail of an unordered response would show an arbitrary month as the
       * current one and be wrong without looking wrong.
       */
      const latest = rows[rows.length - 1]
      return (
        <GaugeTile
          label={fieldOf(dataset, valueKey)?.label ?? valueKey}
          value={Number(latest?.[valueKey] ?? 0)}
          target={Number(latest?.[targetKey] ?? 0)}
          format={primaryFormat}
        />
      )
    }

    case 'ranked-list':
    case 'leaderboard':
      return (
        <RankedList
          data={rows}
          xKey={mapping.x ?? ''}
          valueKey={mapping.value ?? ''}
          format={primaryFormat}
          showMovement={typeId === 'leaderboard'}
          limit={typeof options.limit === 'number' ? options.limit : 8}
        />
      )

    case 'status-list':
      return (
        <StatusList
          data={rows}
          xKey={mapping.x ?? ''}
          stateKey={mapping.state ?? ''}
          valueKey={mapping.value}
          format={primaryFormat}
        />
      )

    /*
     * The Status Family's threshold route (merge §2). The figure arrives already
     * aggregated by the query, so the comparison below is presentation — see
     * `widgets/threshold.ts`.
     */
    case 'threshold-indicator':
    case 'alert-banner': {
      const key = mapping.value ?? ''
      // Same reasoning as the stat card: `rows[0]` is the aggregate only if
      // somebody aggregated. Against a pass-through source it is one service's
      // uptime standing in for the fleet's.
      const value = singleValueOf(spec, dataset, rows, key)
      const label = spec.title ?? fieldOf(dataset, key)?.label ?? key
      const config = thresholdFrom(options)
      const format = primaryFormat

      return typeId === 'alert-banner' ? (
        <AlertBanner value={value} label={label} config={config} format={format} />
      ) : (
        <ThresholdTile
          value={value}
          label={fieldOf(dataset, key)?.label ?? key}
          config={config}
          format={format}
          showThreshold
        />
      )
    }

    case 'event-log-view':
      return (
        <EventLog
          data={rows}
          timeKey={mapping.x ?? ''}
          columns={(mapping.columns ?? [])
            .map((key) => fieldOf(dataset, key))
            .filter((field): field is NonNullable<typeof field> => field !== undefined)}
          limit={typeof options.limit === 'number' ? options.limit : undefined}
        />
      )

    case 'status-indicator': {
      /*
       * D13 — this still reduces records in the browser, and cannot stop yet.
       *
       * It picks the worst of many states, and "worst" is an ordering over
       * `good | warning | serious | critical` that `DatasetQuery` has no way to
       * express: sorting by the state Field alphabetically puts `critical`
       * before `good` by accident and `warning` after both. A query-side answer
       * needs either an ordered-Dimension semantic or a `severity` aggregation,
       * neither of which the FRD has.
       *
       * The test from the Merge Plan — would the number change if the server
       * returned a different page of the same data? — says yes, so this is a
       * real divergence rather than presentation. It is bounded in practice
       * (8 services) and registered rather than hidden.
       */
      const worst = [...rows].sort(
        (a, b) => severity(b[mapping.state ?? '']) - severity(a[mapping.state ?? '']),
      )[0]
      return (
        <StatusTile
          label={String(worst?.[mapping.x ?? ''] ?? '—')}
          tone={(worst?.[mapping.state ?? ''] as StatusTone) ?? 'neutral'}
          detail={typeof options.detail === 'string' ? options.detail : undefined}
        />
      )
    }

    case 'treemap':
      return (
        <Treemap
          data={rows}
          xKey={mapping.x ?? ''}
          valueKey={mapping.value ?? ''}
          format={primaryFormat}
        />
      )

    case 'funnel':
      return (
        <FunnelChart
          data={rows}
          xKey={mapping.x ?? ''}
          valueKey={mapping.value ?? ''}
          format={primaryFormat}
        />
      )

    case 'sankey':
      return (
        <SankeyChart
          data={rows}
          fromKey={mapping.x ?? ''}
          toKey={mapping.secondary ?? ''}
          valueKey={mapping.value ?? ''}
          format={primaryFormat}
        />
      )

    case 'radar-chart':
      return (
        <RadarChart
          data={rows}
          xKey={mapping.x ?? ''}
          series={seriesSpecs}
          entities={Array.isArray(options.entities) ? (options.entities as string[]) : undefined}
          format={primaryFormat}
        />
      )

    case 'scatter-plot':
    case 'bubble-chart': {
      const [x, y, size] = mapping.series ?? []
      return (
        <ScatterChart
          data={rows}
          xKey={x ?? ''}
          yKey={y ?? ''}
          sizeKey={typeId === 'bubble-chart' ? size : undefined}
          groupKey={mapping.secondary}
          xFormat={fieldOf(dataset, x ?? '')?.format}
          yFormat={fieldOf(dataset, y ?? '')?.format}
        />
      )
    }

    case 'histogram':
      return (
        <Histogram
          data={rows}
          valueKey={mapping.value ?? ''}
          buckets={typeof options.buckets === 'number' ? options.buckets : undefined}
          format={primaryFormat}
        />
      )

    case 'box-plot':
      return (
        <BoxPlot
          data={rows}
          xKey={mapping.x ?? ''}
          valueKey={mapping.value ?? ''}
          format={primaryFormat}
        />
      )

    case 'violin-plot':
      return (
        <ViolinPlot
          data={rows}
          xKey={mapping.x ?? ''}
          valueKey={mapping.value ?? ''}
          format={primaryFormat}
        />
      )

    case 'heatmap-matrix': {
      /*
       * The matrix correlates the Measures the Author put on the widget, not
       * every Measure the Dataset declares. Binding is the Author's statement
       * of what this widget is about, and a matrix that quietly included three
       * more columns would answer a question nobody asked.
       */
      const measures = (mapping.series ?? [])
        .map((key) => fieldOf(dataset, key))
        .filter((field): field is NonNullable<typeof field> => field !== undefined)
      return <HeatmapMatrix data={rows} measures={measures} />
    }

    case 'bar-chart-race':
      return (
        <BarChartRace
          data={rows}
          timeKey={mapping.x ?? ''}
          entityKey={mapping.secondary ?? ''}
          valueKey={mapping.value ?? ''}
          top={typeof options.top === 'number' ? options.top : undefined}
          format={primaryFormat}
        />
      )

    case 'calendar-heatmap':
      return (
        <CalendarHeatmap
          data={rows}
          xKey={mapping.x ?? ''}
          valueKey={mapping.value ?? ''}
          format={primaryFormat}
        />
      )

    case 'cohort-grid':
      return (
        <CohortGrid
          data={rows}
          cohortKey={mapping.x ?? ''}
          periodKey={mapping.secondary ?? ''}
          valueKey={mapping.value ?? ''}
          format={primaryFormat}
        />
      )

    case 'timeline-chart': {
      const [start, end] = mapping.series ?? []
      return (
        <GanttChart
          data={rows}
          xKey={mapping.x ?? ''}
          startKey={start ?? ''}
          endKey={end ?? ''}
          groupKey={mapping.secondary}
          progressKey={mapping.value}
        />
      )
    }

    case 'activity-feed':
      return (
        <ActivityFeed
          data={rows}
          timeKey={mapping.x ?? ''}
          actorKey={mapping.secondary}
          actionKey={mapping.value ?? ''}
          severityKey={typeof options.severityKey === 'string' ? options.severityKey : undefined}
        />
      )

    case 'point-map':
      return (
        <PointMap
          data={rows}
          xKey={mapping.x ?? ''}
          latKey={mapping.lat ?? 'lat'}
          lngKey={mapping.lng ?? 'lng'}
          valueKey={mapping.value ?? ''}
          format={primaryFormat}
        />
      )

    case 'pivot-table':
      return (
        <PivotTable
          data={rows}
          rowKey={mapping.x ?? ''}
          columnKey={mapping.secondary ?? ''}
          valueKey={mapping.value}
          aggregation={(options.aggregation as 'count' | 'sum' | 'average') ?? 'count'}
          format={primaryFormat}
        />
      )

    case 'data-table': {
      const columns = (mapping.columns ?? dataset.fields.map((field) => field.key))
        .map((key) => fieldOf(dataset, key))
        .filter((field): field is NonNullable<typeof field> => field !== undefined)
      return <DataTable data={rows} columns={columns} />
    }

    case 'comparison-table': {
      const metrics = (mapping.series ?? [])
        .map((key) => fieldOf(dataset, key))
        .filter((field): field is NonNullable<typeof field> => field !== undefined)
      return (
        <ComparisonTable
          data={rows}
          entityKey={mapping.x ?? ''}
          metrics={metrics}
          showLeaders={options.showLeaders === true}
          higherIsBetter={
            isDirectionMap(options.higherIsBetter) ? options.higherIsBetter : undefined
          }
        />
      )
    }

    default:
      return null
  }
}

/**
 * `presentation_options` is opaque to the API, so anything read out of it is
 * unvalidated input rather than a typed field — checked here rather than cast.
 */
function isDirectionMap(value: unknown): value is Record<string, boolean> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === 'boolean')
  )
}

const SEVERITY: Record<string, number> = { good: 0, warning: 1, serious: 2, critical: 3 }
const severity = (value: unknown): number => SEVERITY[String(value)] ?? -1
