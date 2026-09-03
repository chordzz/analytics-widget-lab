/**
 * Composition Elements — "an element of a Dashboard that is not a Widget. It
 * either controls how Widgets present data (a Control) or organizes Widgets
 * spatially (a Container). Composition Elements draw no data from a Dataset."
 *
 * FR-CO-08 is enforced by the types below: there is no `datasetId` anywhere in
 * this file, and no way to add one without changing the model deliberately.
 */

import type { FieldRole } from './dataset'
import type { TimeGranularity } from './query'

// --- correspondence --------------------------------------------------------

/**
 * How a Control decides which Widgets it acts on (FR-CO-06).
 *
 * The FRD states the required *behaviour* — apply where supported, leave others
 * unaffected — and deliberately leaves the correspondence rule to design. §12
 * flags it as needing an explicit decision. This union is that decision, and it
 * has three cases rather than one because two distinctions the requirement does
 * not draw turn out to matter:
 *
 *  - `field-role` — semantic role matching. A date-range Control needs a Time
 *    Dimension; any Widget whose Dataset has one is affected. This is UC-03,
 *    and it must not require the Author to wire anything up, or the common case
 *    becomes laborious.
 *
 *  - `explicit-binding` — role matching is *not* enough for value-based filters.
 *    Two Datasets may each have a "corridor" Dimension over entirely different
 *    value domains, and matching them on name alone is the implicit coupling
 *    this capability exists to remove. The Author binds a Field per Widget.
 *
 *  - `visualization-type` — Finding 6. FR-CO-06 says a Control applies to
 *    Widgets whose bound *Dataset* supports it, but a presentation toggle
 *    (absolute vs. percentage) or a view switcher depends on the Visualization
 *    Type, not the data. A percentage toggle means something for a stacked bar
 *    and nothing for a stat card, whatever the Dataset holds.
 *
 * Phase 4 implements `field-role`. The other two are modelled so they have a
 * home, and are wired in Phase 5.
 */
export type ControlCorrespondence =
  | { kind: 'field-role'; role: FieldRole }
  | { kind: 'explicit-binding'; bindings: Record<string, string> }
  | { kind: 'visualization-type'; familyIds: string[] }

// --- controls --------------------------------------------------------------

export type ControlType =
  | 'date-range'
  | 'select'
  | 'multi-select'
  | 'search'
  | 'view-switcher'
  | 'presentation-toggle'

export interface Control {
  id: string
  /** Discriminates Composition Elements. A Control is never a Widget. */
  element: 'control'
  controlType: ControlType
  label: string
  correspondence: ControlCorrespondence
  /**
   * Fixed choices, where the Control has them: Visualization Type ids for a
   * view switcher, modes for a presentation toggle. A `select` Control has no
   * fixed options — its values come from the bound Field's data.
   */
  options?: { value: string; label: string }[]
}

/** A date-range Control's value. Bounds are inclusive and may be open-ended. */
export interface DateRangeValue {
  from?: string
  to?: string
  granularity?: TimeGranularity
}

export type ControlValue = DateRangeValue | string | string[] | null

/** Values a Viewer has set, keyed by Control id. */
export type ControlValues = Record<string, ControlValue>

export function dateRangeControl(id: string, label = 'Date range'): Control {
  return {
    id,
    element: 'control',
    controlType: 'date-range',
    label,
    correspondence: { kind: 'field-role', role: 'time-dimension' },
  }
}

/**
 * A value-based filter. Correspondence is by explicit per-Widget binding rather
 * than by role: two Datasets may each declare a "corridor" Dimension over
 * entirely different value domains, and matching them on name would be exactly
 * the implicit coupling this capability exists to remove (Finding 2).
 */
export function selectControl(id: string, label: string): Control {
  return {
    id,
    element: 'control',
    controlType: 'select',
    label,
    correspondence: { kind: 'explicit-binding', bindings: {} },
  }
}

/**
 * Finding 6 — this Control turns on the Visualization Type, not the Dataset.
 * A percentage toggle means something for a stacked bar and nothing for a stat
 * card, whatever data sits behind it.
 */
export function presentationToggleControl(
  id: string,
  familyIds: string[] = ['categorical-comparison'],
): Control {
  return {
    id,
    element: 'control',
    controlType: 'presentation-toggle',
    label: 'Values',
    correspondence: { kind: 'visualization-type', familyIds },
    options: [
      { value: 'absolute', label: 'Absolute' },
      { value: 'percentage', label: 'Percentage' },
    ],
  }
}

/**
 * Switches which Visualization Type renders a Widget. Correspondence names the
 * Families it may act on; whether the *target* Type is permissible for a given
 * Widget is a separate question, answered by the Data Shape predicate at the
 * moment it is applied (FR-VZ-05).
 */
export function viewSwitcherControl(
  id: string,
  options: { value: string; label: string }[],
  familyIds: string[],
): Control {
  return {
    id,
    element: 'control',
    controlType: 'view-switcher',
    label: 'View',
    correspondence: { kind: 'visualization-type', familyIds },
    options,
  }
}

/** Bind a Field of one Widget's Dataset to an explicit-binding Control. */
export function withBinding(control: Control, widgetId: string, fieldKey: string | null): Control {
  if (control.correspondence.kind !== 'explicit-binding') return control

  const bindings = { ...control.correspondence.bindings }
  if (fieldKey === null) delete bindings[widgetId]
  else bindings[widgetId] = fieldKey

  return { ...control, correspondence: { kind: 'explicit-binding', bindings } }
}

// --- containers ------------------------------------------------------------

export type ContainerType = 'section' | 'collapsible-section'

/** FR-CO-07 — organizes Widgets spatially. Draws no data. */
export interface Section {
  id: string
  element: 'container'
  containerType: ContainerType
  label: string
  defaultCollapsed?: boolean
}

export function section(id: string, label: string, collapsible = false): Section {
  return {
    id,
    element: 'container',
    containerType: collapsible ? 'collapsible-section' : 'section',
    label,
  }
}

export type CompositionElement = Control | Section

// --- placement -------------------------------------------------------------

/** The grid a Dashboard lays Widgets out on. */
export const DASHBOARD_COLUMNS = 12

/**
 * FR-CO-02 — position and size, both changeable by the Author.
 *
 * This was a `span` and an `order`: a column count and an ordinal. That gives an
 * Author size and *sequence*, and it does not give position — two Widgets cannot
 * sit side by side with a gap beneath one of them, and nothing can be placed.
 * "Position and size, both changeable" reads as two dimensions, and the free
 * `{x, y, w, h}` below is the stronger reading of the same clause.
 *
 * Merge Plan D4, and the one place the merge propagates *upward*: the product
 * module had already moved to this model and proved it (see `builder/grid.ts`),
 * so the model adopts it rather than the module reverting. Reducing it back is a
 * sort by `(y, x)` with `span = w` if that judgement is ever reversed.
 */
export interface Placement {
  widgetId: string
  /** Leftmost column, 0..DASHBOARD_COLUMNS - w. */
  x: number
  /** Row, from the top. A Dashboard grows downwards and has no floor. */
  y: number
  /** Columns spanned, 1..DASHBOARD_COLUMNS. */
  w: number
  /** Rows spanned. */
  h: number
  /** Which Section holds this Widget. Undefined means the Dashboard root. */
  sectionId?: string
}

export function clampSpan(span: number): number {
  return Math.max(1, Math.min(Math.round(span), DASHBOARD_COLUMNS))
}
