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
  /** Columns on a 12-column board. */
  span?: number
  /**
   * Pixel height, once someone has dragged it.
   *
   * Absent means "whatever this type is worth" — `heightForType`. Storing only
   * the deliberate choices keeps a board's defaults tracking the type as it is
   * tuned, rather than freezing whatever the default happened to be the day the
   * widget was placed.
   */
  height?: number
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
        state="error"
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

  const resolved: WidgetState = state ?? (dataset.rows.length === 0 ? 'empty' : 'ready')
  const bare = type.family === 'single-value' || type.id === 'status-tile'
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
      {renderBody(spec, type.id, dataset.rows, dataset)}
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

    case 'bar-vertical':
    case 'bar-horizontal':
    case 'bar-grouped':
    case 'bar-stacked': {
      const variant =
        typeId === 'bar-horizontal'
          ? 'horizontal'
          : typeId === 'bar-grouped'
            ? 'grouped'
            : typeId === 'bar-stacked'
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
       * How a measure rolls up depends on what it *is*, not on the widget.
       * Adding revenue across months gives revenue for the year; adding uptime
       * across services gives 890%, which is not a number that exists. Rates and
       * durations average, quantities total — inferred from the field's format,
       * since that is where the module already records the difference.
       */
      const rollUp =
        (options.aggregation as 'sum' | 'average' | 'latest' | undefined) ??
        (primaryFormat === 'percent' || primaryFormat === 'duration' ? 'average' : 'sum')

      const summary =
        rollUp === 'latest'
          ? latest
          : rollUp === 'average'
            ? values.reduce((total, value) => total + value, 0) / (values.length || 1)
            : values.reduce((total, value) => total + value, 0)

      // A stat card summarises the period; delta and sparkline cards are about
      // the latest point and how it moved.
      const showTotal = typeId === 'stat-card'

      return (
        <StatTile
          label={spec.title ?? fieldOf(dataset, key)?.label ?? key}
          value={showTotal ? summary : latest}
          format={primaryFormat}
          delta={previous === 0 ? undefined : latest / previous - 1}
          direction={
            (options.direction as 'up-is-good' | 'down-is-good' | 'neutral') ?? 'up-is-good'
          }
          comparisonLabel={typeof options.comparisonLabel === 'string' ? options.comparisonLabel : undefined}
          trend={typeId === 'sparkline-card' ? rows.slice(-40) : undefined}
          trendKey={typeId === 'sparkline-card' ? key : undefined}
        />
      )
    }

    case 'progress-tracker':
    case 'gauge': {
      const valueKey = mapping.value ?? ''
      const targetKey = mapping.target ?? ''
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

    case 'status-tile': {
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

    case 'gantt-chart': {
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
