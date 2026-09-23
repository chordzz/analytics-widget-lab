/**
 * FR-CO-06 — "When a Viewer changes a Control on a Dashboard, the system shall
 * apply that change to every Widget on that Dashboard whose bound Dataset
 * supports it, and shall leave other Widgets unaffected."
 *
 * The requirement states the behaviour and deliberately not the rule. This
 * module is the rule, kept pure: given a Control, a Widget and its Dataset,
 * decide whether the Control applies and — if it does — what it contributes to
 * that Widget's query.
 *
 * The "leave other Widgets unaffected" half is as load-bearing as the first.
 * An unaffected Widget must not silently re-query, and must not quietly show
 * data on a different basis from its neighbours without the Viewer being able
 * to tell. `resolveControlReach` exists so the Dashboard can say which Widgets
 * a Control moved and which it did not.
 */

import { timeRangeParameters, type Dataset } from '../domain/dataset'
import type { DatasetQuery } from '../domain/query'
import type { Control, ControlValues, DateRangeValue } from '../domain/composition'
import { getVisualizationType } from '../visualization/visualization-types'
import { canPresent } from '../visualization/registry'

/** What a Control contributes to one Widget's query. */
export interface QueryContribution {
  timeRange?: { field: string; from?: string; to?: string }
  filters?: Record<string, string | number>
}

/**
 * The parts of a Widget that decide whether a Control reaches it.
 *
 * Narrower than `Widget` for the same reason `AccessSubject` is narrower than
 * `Dashboard`: correspondence turns on four facts, and demanding the whole
 * record couples these rules to a mapping vocabulary they have no opinion
 * about. The product module's `WidgetMapping` has ten slot roles where
 * `FieldMapping` has four (D1), so it could not satisfy `Widget` without
 * pretending — and correspondence never needed it to.
 */
export interface ControlSubject {
  id: string
  datasetId: string
  visualizationTypeId: string
  /**
   * The Time Dimension this Widget is actually drawn against, if it named one.
   *
   * Used so a Dataset with two timestamps is filtered on the one the Widget
   * plots rather than whichever is declared first.
   */
  timeDimension?: string
  /**
   * Filter Parameters the Author fixed on this Widget, by name.
   *
   * Needed because a binding outranks a Control: the Widget's own choice is the
   * more specific of two the same Viewer made (Finding 10), so a bound range
   * means the Control cannot push its own to the Source System.
   *
   * Names only — the values decide what is fetched, not whether the Control
   * reaches.
   */
  boundParameters?: readonly string[]
}

export type Correspondence =
  | { applies: true; via: string }
  /**
   * Reached, but only within what the Widget already asked for.
   *
   * A date range narrows in two places: at the Source System, by a Filter
   * Parameter, and in the browser over the rows that came back. Where the first
   * is unavailable only the second happens — so the Control can narrow and
   * cannot *widen*, and a Viewer who widens past the Widget's own window gets an
   * empty chart rather than more data.
   *
   * Told apart from `applies` because the difference is invisible until someone
   * hits it, and from `applies: false` because the Control genuinely does move
   * this Widget most of the time.
   */
  | { applies: true; via: string; limited: string }
  /** Why not, in words an Author or Viewer can act on. */
  | { applies: false; reason: string }

/**
 * Does this Control act on this Widget?
 *
 * Note it consults the *Dataset*, not the Widget's mapping, for `field-role`.
 * A Control that only reached Fields an Author happened to map would behave
 * differently for two Widgets over the same Dataset, which is not what "whose
 * bound Dataset supports it" says.
 */
export function correspondenceFor(
  control: Control,
  widget: ControlSubject,
  dataset: Dataset,
): Correspondence {
  switch (control.correspondence.kind) {
    case 'field-role': {
      const role = control.correspondence.role
      // Prefer the Field the Author already mapped, so a Widget with two
      // timestamps is filtered on the one it is actually drawn against.
      const mapped =
        role === 'time-dimension' && widget.timeDimension
          ? dataset.fields.find((f) => f.key === widget.timeDimension && f.role === role)
          : undefined
      const field = mapped ?? dataset.fields.find((f) => f.role === role)

      if (!field) {
        /*
         * No Field of that role — which for a date range is not the end of it.
         *
         * An aggregate Dataset has no date column because it answers *for* a
         * window rather than across one: its columns are `value`, `delta`,
         * `changePercent`, all Measures. It still takes `from` and `to`, as
         * **Filter Parameters** — a different list from Fields, and deliberately
         * so (D24).
         *
         * Matching only on Fields refused 25 of Peniremit's 41 Datasets,
         * including every one behind a stat card, with "declares no time
         * dimension". True, and not the question a Viewer is asking when they
         * move the board's date range.
         *
         * Nothing else needs to change for this: `rangeFor` already translates a
         * Control's range into whatever parameter names the publisher declared,
         * reading BE-8's `time_range` where there is one and falling back to
         * `from`/`to`. Only this test was wrong.
         */
        const names = role === 'time-dimension' ? timeRangeParameters(dataset) : {}
        if (names.from ?? names.to) {
          /*
           * `via` names what the range narrows. A Dataset declaring
           * `time_range` says which Field that is even without carrying the
           * column; one that only publishes the parameters is named by them,
           * because that is the whole of what the publisher has said.
           */
          const via = dataset.timeRange?.field ?? [names.from, names.to].filter(Boolean).join('/')

          return { applies: true, via }
        }

        return {
          applies: false,
          reason: `${dataset.name} declares no ${role.replace('-', ' ')}.`,
        }
      }
      if (!field.filterable) {
        // FR-DP-05 — the publisher decides what may be filtered. A Control
        // cannot overrule that.
        return {
          applies: false,
          reason: `${field.label} is not declared filterable.`,
        }
      }
      /*
       * A bound range used to be reported as a limit here, and no longer is.
       *
       * It was true while the Widget's binding outranked the Control: the
       * Source System answered for the Author's window, the Control's range was
       * applied in the browser over those rows, so it could narrow and could
       * not widen. A Viewer asking for August on a card bound to September got
       * an empty chart, and saying so was the honest thing.
       *
       * A Control now governs the parameters it corresponds to, so its range is
       * what goes upstream and the endpoint answers for the window the Viewer
       * asked for. There is nothing left to warn about — and leaving the
       * warning would be the same failure in reverse, telling someone a Control
       * is hobbled when it is not.
       */
      return { applies: true, via: field.key }
    }

    // Phase 5. Modelled here so the shape is settled; see Finding 2.
    case 'explicit-binding': {
      const bound = control.correspondence.bindings[widget.id]
      return bound
        ? { applies: true, via: bound }
        : { applies: false, reason: 'No Field bound for this Widget.' }
    }

    // Phase 5. Finding 6 — this case turns on the Visualization Type, not the
    // Dataset, which FR-CO-06 as written does not allow for.
    case 'visualization-type': {
      const type = getVisualizationType(widget.visualizationTypeId)
      const familyIds = control.correspondence.familyIds
      return type && familyIds.includes(type.familyId)
        ? { applies: true, via: type.familyId }
        : { applies: false, reason: `${type?.name ?? 'This Type'} does not present data this way.` }
    }
  }
}

function isDateRange(value: unknown): value is DateRangeValue {
  return typeof value === 'object' && value !== null && ('from' in value || 'to' in value)
}

/**
 * Everything a Dashboard's Controls do to one Widget.
 *
 * Three channels, because FR-CO-06's phrase "control how its Widgets present
 * data" covers three genuinely different things and treating them as one would
 * force presentation changes through a needless re-retrieval:
 *
 *  - `query`            — re-retrieve on a narrower question (date range, filters)
 *  - `presentation`     — draw the same rows differently (absolute vs. percentage)
 *  - `visualizationTypeId` — draw the same rows as a different Type entirely
 *
 * Only the first costs a round trip.
 */
export interface ControlEffect {
  query: QueryContribution
  presentation: Record<string, unknown>
  /** Set when a view switcher substitutes the Type this Widget renders as. */
  visualizationTypeId?: string
}

export const NO_EFFECT: ControlEffect = { query: {}, presentation: {} }

/**
 * Whether a view switcher may actually put `targetTypeId` on this Widget.
 *
 * Correspondence says the Control *acts on* this Widget; this says the target
 * is permissible for it. The two are separate questions and both must pass —
 * switching a Widget to a Type its Dataset does not satisfy would break
 * FR-VZ-05 through the back door, offering by Control what the authoring
 * surface would have refused.
 */
export function canSwitchTo(
  targetTypeId: string,
  dataset: Dataset,
  hasRenderer: (typeId: string) => boolean,
): Correspondence {
  if (!canPresent(dataset, targetTypeId)) {
    const type = getVisualizationType(targetTypeId)
    return {
      applies: false,
      reason: `${dataset.name} does not satisfy the Data Shape for ${type?.name ?? targetTypeId}.`,
    }
  }
  if (!hasRenderer(targetTypeId)) {
    return { applies: false, reason: 'That Visualization Type has no renderer yet.' }
  }
  return { applies: true, via: targetTypeId }
}

/** Fold every applicable Control's value into one effect for a Widget. */
export function effectFor(
  controls: Control[],
  values: ControlValues,
  widget: ControlSubject,
  dataset: Dataset,
  hasRenderer: (typeId: string) => boolean = () => true,
): ControlEffect {
  const effect: ControlEffect = { query: {}, presentation: {} }

  for (const control of controls) {
    const value = values[control.id]
    if (value === undefined || value === null) continue

    const correspondence = correspondenceFor(control, widget, dataset)
    if (!correspondence.applies) continue

    switch (control.controlType) {
      case 'date-range':
        if (isDateRange(value) && (value.from || value.to)) {
          effect.query.timeRange = { field: correspondence.via, from: value.from, to: value.to }
        }
        break

      case 'select':
      case 'search':
        if (typeof value === 'string' && value !== '') {
          effect.query.filters = { ...effect.query.filters, [correspondence.via]: value }
        }
        break

      // Finding 6 — presentation only. No re-retrieval; the same rows are drawn
      // a different way.
      case 'presentation-toggle':
        if (typeof value === 'string') effect.presentation.valueMode = value
        break

      case 'view-switcher':
        if (typeof value === 'string' && value !== '') {
          const permitted = canSwitchTo(value, dataset, hasRenderer)
          if (permitted.applies) effect.visualizationTypeId = value
        }
        break
    }
  }

  return effect
}

/** Retained for callers that only need the query half. */
export function contributionFor(
  controls: Control[],
  values: ControlValues,
  widget: ControlSubject,
  dataset: Dataset,
): QueryContribution {
  return effectFor(controls, values, widget, dataset).query
}

/**
 * Merge a Control contribution into a Widget's own query.
 *
 * Where a Dashboard Control and a Widget's own exposed filter (FR-VZ-06) name
 * the same Field, the Widget's wins. Both are the Viewer's choices, but the
 * Widget-level one is the more specific of the two, and silently overriding the
 * control a Viewer just used on a particular Widget would be the more
 * surprising outcome. The FRD does not settle this; recorded as Finding 10.
 */
export function applyContribution(
  query: DatasetQuery,
  contribution: QueryContribution,
): DatasetQuery {
  return {
    ...query,
    timeRange: contribution.timeRange ?? query.timeRange,
    filters:
      contribution.filters || query.filters
        ? { ...contribution.filters, ...query.filters }
        : undefined,
  }
}

export interface ControlReach {
  affected: { widgetId: string; via: string }[]
  /**
   * Reached, but only within what the Widget already asked for.
   *
   * A subset of `affected` in spirit — these Widgets do move — kept separate
   * because the limit is invisible until a Viewer widens the range and is shown
   * an empty chart instead of more data.
   */
  limited: { widgetId: string; via: string; reason: string }[]
  unaffected: { widgetId: string; reason: string }[]
}

/**
 * Which Widgets a Control moves, and which it leaves alone.
 *
 * Exists so a Dashboard can *show* the second half of FR-CO-06. A Control that
 * silently touches two Widgets out of three leaves a Viewer to guess whether
 * the third is stale, filtered differently, or broken.
 */
export function resolveControlReach(
  control: Control,
  widgets: ControlSubject[],
  datasets: Record<string, Dataset>,
  /**
   * The Control's current value, and what can be drawn. Supplied for a view
   * switcher, where reach depends on the *selected* target: a Widget the
   * switcher acts on may still be unreachable because its Dataset does not
   * satisfy the chosen Type. Reporting reach without this would overstate it.
   */
  context?: { value?: ControlValues[string]; hasRenderer?: (typeId: string) => boolean },
): ControlReach {
  const reach: ControlReach = { affected: [], limited: [], unaffected: [] }

  for (const widget of widgets) {
    const dataset = datasets[widget.datasetId]
    if (!dataset) {
      reach.unaffected.push({ widgetId: widget.id, reason: 'Dataset unavailable.' })
      continue
    }

    let correspondence = correspondenceFor(control, widget, dataset)

    if (
      correspondence.applies &&
      control.controlType === 'view-switcher' &&
      typeof context?.value === 'string' &&
      context.value !== ''
    ) {
      correspondence = canSwitchTo(context.value, dataset, context.hasRenderer ?? (() => true))
    }

    if (correspondence.applies && 'limited' in correspondence) {
      reach.limited.push({
        widgetId: widget.id,
        via: correspondence.via,
        reason: correspondence.limited,
      })
    } else if (correspondence.applies) {
      reach.affected.push({ widgetId: widget.id, via: correspondence.via })
    } else {
      reach.unaffected.push({ widgetId: widget.id, reason: correspondence.reason })
    }
  }

  return reach
}
