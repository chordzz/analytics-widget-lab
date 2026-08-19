/**
 * What a widget type needs from a dataset, precisely.
 *
 * The catalogue's `needs` is a coarse summary — "one dimension, two measures" —
 * good enough to describe a type in a list. The builder needs more than that: to
 * offer only the datasets that can actually serve a type, to know which field
 * goes in which role, and to refuse to place a widget that is missing something.
 *
 * So a type's real contract is its *slots*. A slot is one role in the
 * visualisation — the x axis, the measure, the target — with the field kinds it
 * will accept and how many fields it takes. Everything the builder does is
 * derived from this one table:
 *
 *   - which datasets appear for a type       → every required slot can be filled
 *   - which fields a dropdown offers         → the slot's accepted kinds
 *   - whether "Add to board" is enabled      → every required slot is filled
 *   - the mapping a freshly-picked type gets → `autoMap`
 *
 * That last one is what makes the flow feel immediate rather than like filling
 * in a form: pick a type, pick a dataset, and a correct widget is already
 * drawing. The mapper is then for changing your mind, not for getting started.
 */

import { WIDGET_TYPES, widgetType } from '../widgets/catalog'
import type { WidgetType } from '../widgets/catalog'
import type { Dataset, Field, FieldKind } from '../data/types'
import type { WidgetMapping } from '../widgets/Widget'

export type SlotId = keyof WidgetMapping

export interface Slot {
  id: SlotId
  label: string
  /** Shown under the control. Says what the choice does, not what it is. */
  help: string
  accepts: readonly FieldKind[]
  /** Fewest fields that make the widget valid. 0 means optional. */
  min: number
  /** Most it will use. Above 1 the slot is an ordered list. */
  max: number
  /**
   * Restricts the slot to Dimensions flagged geographic.
   *
   * Without it a point map is offered anything with a dimension and three
   * measures — regional sales qualifies, and plots revenue as a latitude. Kind
   * alone cannot express "this column names a place"; the `geo` flag can, and
   * the datasets already carry it.
   */
  geo?: boolean
}

const MEASURE = ['measure'] as const
const DIMENSION = ['dimension'] as const
const TIME = ['time'] as const
/** An axis that reads either as a category or as a period. */
const CATEGORY = ['dimension', 'time'] as const
const ANY = ['dimension', 'time', 'measure'] as const

const slot = (
  id: SlotId,
  label: string,
  help: string,
  accepts: readonly FieldKind[],
  min = 1,
  max = 1,
  geo = false,
): Slot => ({ id, label, help, accepts, min, max, geo })

/**
 * The contract, per type.
 *
 * Written out rather than derived from family, because the differences that
 * matter are per type: a grouped bar needs two measures where a plain bar needs
 * one, and a bubble chart needs exactly three where a scatter needs two. A
 * family-level rule would have to be overridden so often that the overrides
 * would be the real table anyway.
 */
const SLOTS: Record<string, Slot[]> = {
  // Single value
  'stat-card': [slot('value', 'Measure', 'The number on the tile.', MEASURE)],
  'sparkline-card': [
    slot('value', 'Measure', 'The number, and the line behind it.', MEASURE),
    slot('x', 'Period', 'Orders the sparkline.', TIME),
  ],
  'delta-card': [
    slot('value', 'Measure', 'Compared between the last two periods.', MEASURE),
    slot('x', 'Period', 'Defines what "last period" means.', TIME),
  ],
  'progress-tracker': [
    slot('value', 'Actual', 'Progress so far.', MEASURE),
    slot('target', 'Target', 'What counts as complete.', MEASURE),
  ],

  // Trend
  'line-chart': [
    slot('x', 'Time axis', 'Plotted left to right.', TIME),
    slot('series', 'Measures', 'One line each.', MEASURE, 1, 5),
  ],
  'area-chart': [
    slot('x', 'Time axis', 'Plotted left to right.', TIME),
    slot('series', 'Measures', 'One filled band each.', MEASURE, 1, 5),
  ],
  'spline-chart': [
    slot('x', 'Time axis', 'Plotted left to right.', TIME),
    slot('series', 'Measures', 'One smoothed curve each.', MEASURE, 1, 5),
  ],
  'step-chart': [
    slot('x', 'Time axis', 'Plotted left to right.', TIME),
    slot('series', 'Measures', 'Held flat between changes.', MEASURE, 1, 5),
  ],

  // Categorical
  'bar-vertical': [
    slot('x', 'Categories', 'One bar per value.', CATEGORY),
    slot('series', 'Measures', 'Bar height.', MEASURE, 1, 4),
  ],
  'bar-horizontal': [
    slot('x', 'Categories', 'One bar per value. Suits long labels.', CATEGORY),
    slot('series', 'Measures', 'Bar length.', MEASURE, 1, 4),
  ],
  'bar-grouped': [
    slot('x', 'Categories', 'One group of bars per value.', CATEGORY),
    slot('series', 'Measures', 'One bar within each group.', MEASURE, 2, 4),
  ],
  'bar-stacked': [
    slot('x', 'Categories', 'One stack per value.', CATEGORY),
    slot('series', 'Measures', 'One segment within each stack.', MEASURE, 2, 4),
  ],

  // Composition
  'pie-chart': [
    slot('x', 'Segments', 'One slice per value.', DIMENSION),
    slot('value', 'Measure', 'Slice size.', MEASURE),
  ],
  'donut-chart': [
    slot('x', 'Segments', 'One slice per value.', DIMENSION),
    slot('value', 'Measure', 'Slice size, and the centre total.', MEASURE),
  ],
  treemap: [
    slot('x', 'Rectangles', 'One rectangle per value.', DIMENSION),
    slot('value', 'Measure', 'Rectangle area.', MEASURE),
  ],

  // Ranking & flow
  'ranked-list': [
    slot('x', 'Entries', 'What is being ranked.', DIMENSION),
    slot('value', 'Measure', 'Ranks the entries.', MEASURE),
  ],
  leaderboard: [
    slot('x', 'Entries', 'What is being ranked.', DIMENSION),
    slot('value', 'Measure', 'Ranks the entries.', MEASURE),
  ],
  funnel: [
    slot('x', 'Stages', 'In order, widest first.', DIMENSION),
    slot('value', 'Measure', 'Stage width.', MEASURE),
  ],
  sankey: [
    slot('x', 'From', 'Where flow leaves.', DIMENSION),
    slot('secondary', 'To', 'Where flow arrives.', DIMENSION),
    slot('value', 'Volume', 'Ribbon thickness.', MEASURE),
  ],

  // Status
  'status-list': [
    slot('x', 'Entities', 'One row each.', DIMENSION),
    slot('state', 'State', 'Drives the status colour.', DIMENSION),
    slot('value', 'Measure', 'Optional figure beside each row.', MEASURE, 0, 1),
  ],
  'status-tile': [
    slot('x', 'Entities', 'The worst one is shown.', DIMENSION),
    slot('state', 'State', 'Drives the status colour.', DIMENSION),
  ],

  // Radial
  gauge: [
    slot('value', 'Actual', 'The needle.', MEASURE),
    slot('target', 'Target', 'Full scale.', MEASURE),
  ],
  'radar-chart': [
    slot('x', 'Entities', 'One outline each.', DIMENSION),
    slot('series', 'Measures', 'One axis each. Three or more.', MEASURE, 3, 8),
  ],

  // Tabular
  'data-table': [slot('columns', 'Columns', 'Shown in this order.', ANY, 1, 12)],
  'pivot-table': [
    slot('x', 'Rows', 'Grouped down the side.', DIMENSION),
    slot('secondary', 'Columns', 'Grouped across the top.', DIMENSION),
    slot('value', 'Measure', 'Aggregated per cell. Counts rows if empty.', MEASURE, 0, 1),
  ],

  // Distribution
  histogram: [slot('value', 'Measure', 'Bucketed by value.', MEASURE)],
  'box-plot': [
    slot('x', 'Groups', 'One box per value.', DIMENSION),
    slot('value', 'Measure', 'Summarised within each group.', MEASURE),
  ],

  // Correlation
  'scatter-plot': [slot('series', 'Measures', 'Exactly two — x then y.', MEASURE, 2, 2)],
  'bubble-chart': [slot('series', 'Measures', 'Three — x, y, then size.', MEASURE, 3, 3)],

  // Temporal
  'calendar-heatmap': [
    slot('x', 'Date', 'One cell per day.', TIME),
    slot('value', 'Measure', 'Cell shade.', MEASURE),
  ],
  'cohort-grid': [
    slot('x', 'Cohorts', 'One row each.', CATEGORY),
    slot('secondary', 'Elapsed period', 'One column each.', CATEGORY),
    slot('value', 'Measure', 'Cell shade.', MEASURE),
  ],
  'gantt-chart': [
    slot('x', 'Rows', 'One bar per value.', DIMENSION),
    slot('series', 'Start and end', 'Exactly two — where the bar begins and ends.', MEASURE, 2, 2),
    slot('secondary', 'Grouping', 'Optional. Colours bars by group.', DIMENSION, 0, 1),
    slot('value', 'Progress', 'Optional. Shades the completed portion.', MEASURE, 0, 1),
  ],

  // Chronological
  'activity-feed': [
    slot('x', 'When', 'Orders the feed, most recent first.', TIME),
    slot('secondary', 'Actor', 'Who did it.', DIMENSION),
    slot('value', 'Action', 'What they did.', DIMENSION),
  ],

  // Geospatial
  'point-map': [
    slot('x', 'Place', 'Names each point. Must be a geographic field.', DIMENSION, 1, 1, true),
    slot('lat', 'Latitude', 'Degrees, −90 to 90.', MEASURE, 1, 1, true),
    slot('lng', 'Longitude', 'Degrees, −180 to 180.', MEASURE, 1, 1, true),
    slot('value', 'Measure', 'Point area.', MEASURE),
  ],
}

export const slotsFor = (typeId: string): Slot[] => SLOTS[typeId] ?? []

export const requiredSlots = (typeId: string): Slot[] =>
  slotsFor(typeId).filter((entry) => entry.min > 0)

/** Fields of a dataset that could go in a slot. */
export const candidatesFor = (dataset: Dataset, entry: Slot): Field[] =>
  dataset.fields.filter(
    (field) => entry.accepts.includes(field.kind) && (!entry.geo || Boolean(field.geo)),
  )

/** Whether a dataset has enough of the right fields for every required slot. */
export function satisfies(typeId: string, dataset: Dataset): boolean {
  const entries = slotsFor(typeId)
  if (entries.length === 0) return false

  /*
   * Slots are checked against a shared pool rather than independently. A radar
   * chart needs three measures for its series *and* a dimension for its
   * entities; checking each slot alone would also let a two-measure dataset
   * through for a scatter-plus-size widget by counting the same field twice.
   */
  const claimed = new Set<string>()
  for (const entry of entries) {
    if (entry.min === 0) continue
    const available = candidatesFor(dataset, entry).filter((field) => !claimed.has(field.key))
    if (available.length < entry.min) return false
    available.slice(0, entry.min).forEach((field) => claimed.add(field.key))
  }
  return true
}

/**
 * Widget types this dataset can actually fill, in catalogue order.
 *
 * The other direction of `satisfies`, and the one the builder leads with: you
 * choose data, and only the widgets that can show it are offered. Nothing is
 * greyed out and nothing fails after you pick it — an unbuildable widget is
 * simply not in the list.
 */
export const typesFor = (dataset: Dataset): WidgetType[] =>
  WIDGET_TYPES.filter((type) => type.built && satisfies(type.id, dataset))

/**
 * The widgets this dataset says it is *for*.
 *
 * Surfaced as a shortlist above the full set. Being able to draw a funnel from
 * a table is not the same as that table being about funnels, and a picker of
 * twenty valid-but-arbitrary options is its own kind of unhelpful.
 */
export const suggestedTypesFor = (dataset: Dataset): WidgetType[] =>
  typesFor(dataset).filter((type) => suitsType(dataset, type.id))

/** Whether a dataset declares itself a natural fit for this widget type. */
export const suitsType = (dataset: Dataset, typeId: string): boolean =>
  dataset.suits?.includes(typeId) ?? false

// --- automatic mapping ------------------------------------------------------

/** Distinct values of a field. Cheap enough at these row counts. */
function distinctCount(dataset: Dataset, key: string): number {
  const seen = new Set<unknown>()
  for (const row of dataset.rows) seen.add(row[key])
  return seen.size
}

/**
 * Beyond this many rows, a near-unique dimension is an identifier.
 *
 * Below it, a near-unique dimension is the label: every row of `project-timeline`
 * is a task and every row of `sales-by-country` is a country, and those fields
 * are exactly what belongs on the axis. Above it — 2,000 transaction ids — it is
 * a key, and putting it on an axis draws 2,000 marks.
 *
 * Cardinality alone cannot tell those apart. Table length can.
 */
const IDENTIFIER_ROWS = 50

/**
 * How good a dimension is as a grouping axis.
 *
 * The naive rule — take the first field of the right kind — puts the
 * transactions table's `id` on a box plot's x axis. Cardinality is what
 * separates a category from an identifier, but only in a long table; see
 * `IDENTIFIER_ROWS`.
 */
/**
 * Coordinates are locations, not quantities.
 *
 * Latitude is a Measure by kind, and in `sales-by-country` it is the first one
 * declared — so a ranked list of countries picks it up and sorts them by how far
 * north they are. Nothing about the kind system prevents that; the geo marker
 * does. Still selectable by hand, just never the automatic answer.
 */
const isCoordinate = (field: Field): boolean => field.geo === 'lat' || field.geo === 'lng'

function groupingScore(dataset: Dataset, field: Field): number {
  if (field.kind === 'measure') return isCoordinate(field) ? -1 : 0

  const distinct = distinctCount(dataset, field.key)
  const rows = dataset.rows.length || 1

  if (distinct < 2) return 0
  if (rows > IDENTIFIER_ROWS && distinct > rows * 0.5) return 0
  if (distinct <= 12) return 3
  if (distinct <= 30) return 2
  return 1
}

/**
 * A sensible default mapping, so a freshly-picked widget draws immediately.
 *
 * Two passes. The first claims fields whose key *is* the slot's name — the only
 * reliable way to get latitude into the latitude slot rather than into whatever
 * measure slot happens to be declared first. The second fills what is left, best
 * candidate first, never reusing a claimed field.
 *
 * Optional slots are left empty. A Gantt is valid without a grouping or a
 * progress measure, and guessing at them puts data on the chart nobody asked
 * to see. Required slots are the promise; the rest is the person's choice.
 *
 * Returns null when the dataset cannot serve the type at all.
 */
export function autoMap(typeId: string, dataset: Dataset): WidgetMapping | null {
  if (!satisfies(typeId, dataset)) return null

  const entries = slotsFor(typeId)
  const mapping: WidgetMapping = {}
  const claimed = new Set<string>()

  const assign = (entry: Slot, fields: Field[]) => {
    const keys = fields.map((field) => field.key)
    keys.forEach((key) => claimed.add(key))
    if (entry.max > 1) {
      mapping[entry.id] = [...((mapping[entry.id] as string[] | undefined) ?? []), ...keys] as never
    } else {
      mapping[entry.id] = keys[0] as never
    }
  }

  // Pass one — exact name matches.
  for (const entry of entries) {
    const exact = candidatesFor(dataset, entry).find(
      (field) => field.key.toLowerCase() === entry.id.toLowerCase() && !claimed.has(field.key),
    )
    if (exact) assign(entry, [exact])
  }

  // Pass two — everything still empty.
  for (const entry of entries) {
    const already = mapping[entry.id]
    const have = Array.isArray(already) ? already.length : already ? 1 : 0
    const wanted = Math.max(entry.min, entry.id === 'columns' ? Math.min(entry.max, 6) : entry.min)
    if (have >= wanted) continue

    const pool = candidatesFor(dataset, entry)
      .filter((field) => !claimed.has(field.key))
      // Stable, so declaration order breaks ties: the scores only demote the
      // fields that would be actively wrong here.
      .sort((a, b) => groupingScore(dataset, b) - groupingScore(dataset, a))

    if (pool.length === 0) continue
    assign(entry, pool.slice(0, wanted - have))
  }

  return mapping
}

/** Required slots this mapping has not filled. Empty means placeable. */
export function unfilledSlots(typeId: string, mapping: WidgetMapping): Slot[] {
  return slotsFor(typeId).filter((entry) => {
    if (entry.min === 0) return false
    const value = mapping[entry.id]
    const count = Array.isArray(value) ? value.length : value ? 1 : 0
    return count < entry.min
  })
}

export const isComplete = (typeId: string, mapping: WidgetMapping): boolean =>
  slotsFor(typeId).length > 0 && unfilledSlots(typeId, mapping).length === 0

export { widgetType }
