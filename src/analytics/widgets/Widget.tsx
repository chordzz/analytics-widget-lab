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
import { datasetById } from '../data/datasets'
import { rowsForWidget } from '../data/query'
import { fieldOf } from '../data/types'
import {
  ActivityFeed,
  BarChart,
  BoxPlot,
  CalendarHeatmap,
  CohortGrid,
  DataTable,
  DonutChart,
  FunnelChart,
  GanttChart,
  GaugeTile,
  Histogram,
  PivotTable,
  PointMap,
  RadarChart,
  RankedList,
  SankeyChart,
  ScatterChart,
  StatTile,
  StatusList,
  StatusTile,
  Treemap,
  TrendChart,
} from './primitives'
import type { Row } from '../data/types'
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
  actions?: WidgetAction[]
  selected?: boolean
  onSelect?: () => void
  /** Fixed body height. Omit to fill the grid cell. */
  height?: number
}

export function Widget({ spec, state, actions, selected, onSelect, height }: WidgetProps) {
  const type = widgetType(spec.typeId)
  const dataset = datasetById(spec.datasetId)

  // A spec pointing at a missing type or dataset is a wiring bug, not a data
  // state — say so plainly rather than rendering an empty chart.
  if (!type || !dataset) {
    return (
      <WidgetCard
        title={spec.title ?? spec.typeId}
        state="failed"
        errorMessage={
          !type ? `No widget type '${spec.typeId}'.` : `No dataset '${spec.datasetId}'.`
        }
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

  /*
   * Rows are fetched separately from the description now, which is the shape a
   * backend imposes. Still synchronous — Stage 5 puts a port here — but the
   * *inference* below is already on borrowed time: Stage 3 replaces it with a
   * state the response carries. A row count cannot tell "authorized, nothing to
   * say" from "not authorized" from "the Dataset is gone", and rendering the
   * last two as `empty` teaches a Viewer the figure is zero.
   */
  const rows = rowsForWidget(spec, dataset)
  const resolved: WidgetState = state ?? (rows.length === 0 ? 'empty' : 'ready')
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
      state={resolved}
      actions={actions}
      selected={selected}
      onSelect={onSelect}
      bare={bare}
      textLed={textLed}
      style={height ? { height } : undefined}
    >
      {renderBody(spec, type.id, rows, dataset)}
    </WidgetCard>
  )
}

function renderBody(
  spec: WidgetSpec,
  typeId: string,
  rows: readonly Row[],
  dataset: NonNullable<ReturnType<typeof datasetById>>,
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
    case 'stacked-bar-chart': {
      const variant =
        typeId === 'bar-chart-horizontal'
          ? 'horizontal'
          : typeId === 'grouped-bar-chart'
            ? 'grouped'
            : typeId === 'stacked-bar-chart'
              ? 'stacked'
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
      const comparable = !isAggregate && previous !== 0

      return (
        <StatTile
          label={spec.title ?? fieldOf(dataset, key)?.label ?? key}
          value={isAggregate ? (values[0] ?? 0) : latest}
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

    default:
      return null
  }
}

const SEVERITY: Record<string, number> = { good: 0, warning: 1, serious: 2, critical: 3 }
const severity = (value: unknown): number => SEVERITY[String(value)] ?? -1
