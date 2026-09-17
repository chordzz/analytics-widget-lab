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

import { acceptedByApi } from '../../dashboard/api-taxonomy'
import { WIDGET_TYPES, widgetType } from '../widgets/catalog'
import type { WidgetType } from '../widgets/catalog'
import {
  fieldOf,
  isCoordinate,
  isGeographic,
  type Dataset,
  type Field,
  type FieldRole,
} from '../data/types'
import type { WidgetMapping } from '../widgets/Widget'

export type SlotId = keyof WidgetMapping

export interface Slot {
  id: SlotId
  label: string
  /** Shown under the control. Says what the choice does, not what it is. */
  help: string
  accepts: readonly FieldRole[]
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
const TIME = ['time-dimension'] as const
/** An axis that reads either as a category or as a period. */
const CATEGORY = ['dimension', 'time-dimension'] as const
const ANY = ['dimension', 'time-dimension', 'measure'] as const

const slot = (
  id: SlotId,
  label: string,
  help: string,
  accepts: readonly FieldRole[],
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
  'bar-chart-vertical': [
    slot('x', 'Categories', 'One bar per value.', CATEGORY),
    slot('series', 'Measures', 'Bar height.', MEASURE, 1, 4),
  ],
  'bar-chart-horizontal': [
    slot('x', 'Categories', 'One bar per value. Suits long labels.', CATEGORY),
    slot('series', 'Measures', 'Bar length.', MEASURE, 1, 4),
  ],
  'grouped-bar-chart': [
    slot('x', 'Categories', 'One group of bars per value.', CATEGORY),
    slot('series', 'Measures', 'One bar within each group.', MEASURE, 2, 4),
  ],
  'stacked-bar-chart': [
    slot('x', 'Categories', 'One stack per value.', CATEGORY),
    slot('series', 'Measures', 'One segment within each stack.', MEASURE, 2, 4),
  ],
  'stacked-100-bar': [
    slot('x', 'Categories', 'One full-width bar per value.', CATEGORY),
    // Parts of one whole, so the minimum is two and the wording says why: a
    // single "share" is always 100% and draws a solid bar that means nothing.
    slot('series', 'Measures', 'Parts of the whole — two or more, or every bar is 100% of itself.', MEASURE, 2, 5),
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
  'bar-chart-race': [
    slot('x', 'Period', 'One frame of the race per value.', TIME),
    slot('secondary', 'Racers', 'One bar each, ranked within every period.', DIMENSION),
    slot('value', 'Measure', 'What they are ranked on.', MEASURE),
  ],

  // Status
  'status-list': [
    slot('x', 'Entities', 'One row each.', DIMENSION),
    slot('state', 'State', 'Drives the status colour.', DIMENSION),
    slot('value', 'Measure', 'Optional figure beside each row.', MEASURE, 0, 1),
  ],
  'status-indicator': [
    slot('x', 'Entities', 'The worst one is shown.', DIMENSION),
    slot('state', 'State', 'Drives the status colour.', DIMENSION),
  ],
  /*
   * The Family's *other* Data Shape — one Measure with a threshold. The
   * threshold is Widget configuration rather than a Dataset property, which is
   * why a bare Measure satisfies these two and no `state` slot appears.
   */
  'threshold-indicator': [
    slot('value', 'Measure', 'The figure to assess.', MEASURE, 1, 1),
  ],
  'alert-banner': [
    slot('value', 'Measure', 'The figure to assess.', MEASURE, 1, 1),
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
  'comparison-table': [
    slot('x', 'Entities', 'One column each.', DIMENSION),
    slot('series', 'Metrics', 'One row each, in this order.', MEASURE, 2, 8),
  ],

  // Distribution
  histogram: [slot('value', 'Measure', 'Bucketed by value.', MEASURE)],
  'box-plot': [
    slot('x', 'Groups', 'One box per value.', DIMENSION),
    slot('value', 'Measure', 'Summarised within each group.', MEASURE),
  ],
  'violin-plot': [
    slot('x', 'Groups', 'One violin per value.', DIMENSION),
    slot('value', 'Measure', 'Its spread drawn as a density curve.', MEASURE),
  ],

  // Correlation
  'scatter-plot': [slot('series', 'Measures', 'Exactly two — x then y.', MEASURE, 2, 2)],
  'bubble-chart': [slot('series', 'Measures', 'Three — x, y, then size.', MEASURE, 3, 3)],
  'heatmap-matrix': [
    // Two Measures make a one-cell matrix, which is a scatter plot with the
    // detail thrown away. Three is where the grid starts earning its place.
    slot('series', 'Measures', 'Three or more — every pair gets a cell.', MEASURE, 3, 8),
  ],

  // Temporal
  'calendar-heatmap': [
    slot('x', 'Date', 'One cell per day.', TIME),
    slot('value', 'Measure', 'Cell shade.', MEASURE),
  ],
  'cohort-grid': [
    /*
     * A cohort is a *period* — the month or week a group of users joined — so
     * this takes a Time Dimension and not the wider CATEGORY it used to.
     *
     * Widening it here silently widened eligibility: the type was offered for
     * `transactions`, `sales-by-country` and `traffic-flow`, none of which are
     * cohort data, because any Dimension could fill the axis. Caught by
     * `refinement.test.ts` — Temporal Pattern requires a Time Dimension, and a
     * slot that would also accept a plain Dimension does not satisfy that.
     */
    slot('x', 'Cohorts', 'One row per cohort period.', TIME),
    slot('secondary', 'Elapsed period', 'One column each.', CATEGORY),
    slot('value', 'Measure', 'Cell shade.', MEASURE),
  ],
  'timeline-chart': [
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
  /*
   * A log takes columns rather than named roles, because a log row is a record
   * and a feed row is a sentence. Chronological is the Family with no Measure,
   * so `columns` accepts anything — the figures are shown, never aggregated.
   */
  'event-log-view': [
    slot('x', 'When', 'Orders the log, most recent first.', TIME),
    slot('columns', 'Columns', 'Shown after the timestamp, in this order.', ANY, 1, 8),
  ],

  // Geospatial
  'point-map': [
    slot('x', 'Place', 'Names each point. Must be a geographic field.', DIMENSION, 1, 1, true),
    slot('lat', 'Latitude', 'Degrees, −90 to 90.', MEASURE, 1, 1, true),
    slot('lng', 'Longitude', 'Degrees, −180 to 180.', MEASURE, 1, 1, true),
    slot('value', 'Measure', 'Point area.', MEASURE),
  ],
}

/**
 * D3 — how a Type's slots are checked against its Family's.
 *
 * FR-VZ-03 declares mapping slots **per Family**, and `mapping-slots.ts` does
 * exactly that; the module declares them **per Type**, because `funnel` and
 * `sankey` share a Family and are not the same mapping while `line-chart` and
 * `area-chart` are. Both are right about different things, and the resolution is
 * two layers of one table rather than two tables — which only holds if something
 * checks the layers agree. `refinement.test.ts` is that check.
 *
 * A Type slot **contributes** to a Family slot when every role it accepts is a
 * role the Family slot accepts. That is refinement, stated:
 *
 *   - narrowing contributes — a Family slot taking any Field is satisfied by a
 *     Type slot taking a Dimension
 *   - **widening does not** — a Family slot requiring a Time Dimension is *not*
 *     satisfied by a Type slot that would also accept a plain Dimension, because
 *     an Author can then fill it with one and the Family's requirement is gone
 *
 * The second case is the whole point, and it is why this compares accepted roles
 * rather than slot ids. An id-based map cannot see it: `value` holds a Measure in
 * a donut chart and a Dimension in an activity feed, so what a slot *is* named
 * says nothing about which requirement it answers.
 */
export const contributesTo = (
  typeSlot: Pick<Slot, 'accepts'>,
  familySlot: { accepts: readonly FieldRole[] },
): boolean => typeSlot.accepts.every((role) => familySlot.accepts.includes(role))

/**
 * How much of a Family slot's requirement a Type demands.
 *
 * Summed over every contributing slot, because two module slots can answer one
 * Family slot: a bubble chart's `value` and `series` are both Measures, and a
 * Family asking for two is satisfied by one of each.
 */
export function demandFor(
  typeId: string,
  familySlot: { accepts: readonly FieldRole[] },
): number {
  return slotsFor(typeId)
    .filter((entry) => contributesTo(entry, familySlot))
    .reduce((total, entry) => total + entry.min, 0)
}

export const slotsFor = (typeId: string): Slot[] => SLOTS[typeId] ?? []

export const requiredSlots = (typeId: string): Slot[] =>
  slotsFor(typeId).filter((entry) => entry.min > 0)

/** Fields of a dataset that could go in a slot. */
export const candidatesFor = (dataset: Dataset, entry: Slot): Field[] =>
  dataset.fields.filter(
    (field) => entry.accepts.includes(field.role) && (!entry.geo || isGeographic(field)),
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
 * Why a widget type is not on offer, in the Author's terms.
 *
 * The composer's rule has been that an unbuildable widget is simply absent —
 * nothing greyed out, nothing failing after you pick it. That is right when the
 * absence is obvious (no time dimension, no trend lines) and wrong when it is
 * not: two thirds of the catalogue can be missing for a reason nobody can see,
 * and an Author who came to build a funnel is left wondering whether the product
 * has one.
 *
 * So the absences are explained rather than merely correct. Three kinds, and
 * they are genuinely different situations:
 *
 *   - **the backend will not accept it.** Nothing about this Dataset. Ours to
 *     fix with the Analytics team, and temporary.
 *   - **the publisher has not said enough.** The Dataset may well suit it; the
 *     declaration cannot establish that, which is a gap in the publication
 *     contract rather than a property of the data.
 *   - **the data is the wrong shape.** The honest, permanent answer: this
 *     Dataset has one Measure and a scatter plot needs two.
 */
export type UnavailableReason =
  | { kind: 'not-accepted'; because: string }
  | { kind: 'undeclared'; because: string }
  | { kind: 'shape'; because: string }

export interface UnavailableType {
  type: WidgetType
  reason: UnavailableReason
}

/**
 * Every built type this Dataset cannot currently show, with why.
 *
 * Ordered by how actionable the answer is: what we can fix first, then what the
 * publisher can, then what nothing can.
 */
export function unavailableTypesFor(
  dataset: Dataset,
  /**
   * The Types the API will accept, from `GET /v1/visualizations`.
   *
   * Omitted falls back to the local list — the endpoint may be loading, or may
   * have declined. Treating an absent answer as "nothing is accepted" would
   * lock every widget in the product over one failed request.
   */
  accepted?: ReadonlySet<string> | null,
): UnavailableType[] {
  const offered = new Set(typesFor(dataset).map((type) => type.id))

  const entries = WIDGET_TYPES.filter((type) => type.built).flatMap<UnavailableType>((type) => {
    if (accepted ? !accepted.has(type.id) : !acceptedByApi(type.id)) {
      return [
        {
          type,
          reason: {
            kind: 'not-accepted',
            because: 'The Analytics API has no name for this widget type yet.',
          },
        },
      ]
    }
    if (offered.has(type.id)) return []
    return [{ type, reason: reasonFor(type.id, dataset) }]
  })

  const rank = { 'not-accepted': 0, undeclared: 1, shape: 2 }
  return entries.sort((a, b) => rank[a.reason.kind] - rank[b.reason.kind])
}

/**
 * The first slot this Dataset cannot fill, said as a shortfall.
 *
 * First rather than all of them: a widget needing two things it does not have is
 * not twice as unavailable, and the leading reason is the one an Author would
 * act on.
 */
function reasonFor(typeId: string, dataset: Dataset): UnavailableReason {
  const claimed = new Set<string>()

  for (const entry of slotsFor(typeId)) {
    if (entry.min === 0) continue
    const available = candidatesFor(dataset, entry).filter((field) => !claimed.has(field.key))

    if (available.length >= entry.min) {
      available.slice(0, entry.min).forEach((field) => claimed.add(field.key))
      continue
    }

    /*
     * A geographic slot is the one case where the shortfall may not be real.
     * Nothing in the deployed API can say a Measure is a latitude, so a Dataset
     * that genuinely holds coordinates looks identical to one that does not —
     * and telling the Author their data is the wrong shape would be a guess
     * stated as a fact.
     */
    if (entry.geo) {
      /*
       * Named by what the slot wants rather than by the first thing missing.
       * A point map's place slot failing is not the whole story — it also needs
       * a latitude and a longitude — and an Author told only about the first
       * would go and fix something that still would not finish.
       */
      const wants =
        entry.id === 'lat' || entry.id === 'lng'
          ? 'Fields declared as a latitude and a longitude'
          : 'a Field declared as a place'

      return {
        kind: 'undeclared',
        because: `Needs ${wants} — something the publication contract cannot express yet.`,
      }
    }

    return { kind: 'shape', because: shortfall(entry, available.length) }
  }

  // Every slot fills, so the type was excluded for a reason the slot table does
  // not model. Saying so beats inventing one.
  return { kind: 'shape', because: `${dataset.name} does not suit this widget type.` }
}

function shortfall(entry: Slot, has: number): string {
  const roles = entry.accepts.map(roleWord).join(' or ')
  const need = entry.min === 1 ? `a ${roles}` : `${String(entry.min)} ${roles}s`
  const got = has === 0 ? 'none' : `only ${String(has)}`
  /*
   * The slot label keeps its own capital. Lower-cased, Sankey's `To` reads as a
   * preposition — "needs a dimension for to" — and the sentence falls apart.
   * Capitalised it is plainly the name of a slot.
   */
  return `Needs ${need} for ${entry.label}; this data has ${got}.`
}

const roleWord = (role: FieldRole): string =>
  role === 'time-dimension' ? 'time dimension' : role

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

/**
 * Distinct values of a Field, as declared rather than counted.
 *
 * This used to scan the records. It cannot any more, and should not have: an
 * Author's tool deciding which chart to *offer* would be performing a retrieval
 * to do it, which is the thing FR-DP-11 exists to prevent. The count is
 * published metadata now — Finding 16.
 */
const distinctCount = (dataset: Dataset, key: string): number =>
  fieldOf(dataset, key)?.distinctCount ?? 0

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
/*
 * Coordinates are locations, not quantities.
 *
 * Latitude is a Measure by role, and in `sales-by-country` it is the first one
 * declared — so a ranked list of countries picks it up and sorts them by how far
 * north they are. Nothing about the role system prevents that; the Field's
 * geographic semantic does. Still selectable by hand, just never the automatic
 * answer.
 *
 * `isCoordinate` now comes from the model rather than being decided again here.
 * It was a local predicate over the module's own `geo` flag; the same question is
 * asked by the Geospatial Data Shape, and two answers to it could disagree.
 */

function groupingScore(dataset: Dataset, field: Field): number {
  if (field.role === 'measure') return isCoordinate(field) ? -1 : 0

  const distinct = distinctCount(dataset, field.key)
  const rows = dataset.recordCount ?? 1

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
