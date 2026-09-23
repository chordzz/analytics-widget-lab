/**
 * A Board, translated to and from the API's Dashboard.
 *
 * D23 ends here. A Board references its Widgets by id and keeps their positions
 * in a separate `placements` list — Finding 4's reading of FR-VZ-09, where a
 * Widget saved to the Library outlives any one board. The API embeds Widgets by
 * value, each carrying its own `layout`. So the two halves are joined on the way
 * out and split again on the way in, and `placedWidgets` is already the join.
 *
 * **Where the mapping goes, and why it is worth saying.** The API's `Widget` has
 * `dataset_id`, `visualization_type`, filters and a layout — and nothing that
 * says which Field feeds which axis. A line chart over a Dataset with three
 * Measures is three different charts, and nothing in their schema distinguishes
 * them. The only home available is `presentation_options`, documented as
 * *"rendering settings, opaque to Analytics"*, which is the right shape but
 * carries a caveat that does not hold here: *"every option has a default, so an
 * absent value is never an error"*. A mapping has no default. Losing it does not
 * degrade a Widget, it unmakes one. Raised as Finding 23.
 */

import { placedWidgets, type Board, type PlacedWidget } from '../analytics/builder/boards'
import { DASHBOARD_COLUMNS } from '../domain/composition'
import type { Control, Placement, Section } from '../domain/composition'
import type { DashboardScope, ShareGrant } from '../domain/dashboard'
import type { WidgetSpec, WidgetMapping } from '../analytics/widgets/Widget'

export interface ApiWidget {
  id?: string
  title?: string
  dataset_id: string
  visualization_type: string
  presentation_options?: Record<string, unknown>
  default_filters?: Record<string, unknown>
  exposed_filters?: string[]
  layout?: { x?: number; y?: number; w?: number; h?: number }
}

export interface ApiDashboard {
  id: string
  name: string
  description?: string
  creator_actor_id?: string
  creator_name?: string
  status?: 'draft' | 'published'
  scope_level?: string
  scope_organizational_ref?: string
  widgets?: ApiWidget[]
  composition_elements?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
  deleted?: boolean
}

export interface ApiDashboardInput {
  name: string
  description?: string
  widgets: ApiWidget[]
  composition_elements: Record<string, unknown>
}

/** The key our own settings travel under, kept apart from a publisher's. */
const MAPPING_KEY = 'smc.mapping'
const SUBTITLE_KEY = 'smc.subtitle'
const SORTS_KEY = 'smc.exposedSorts'
const OPTIONS_KEY = 'smc.options'
/*
 * D24. Travels under our own key rather than as a top-level field because the
 * API models bindings nowhere: `exposed_filters` is the Viewer's list, and a
 * binding is the Author's fixed value. Without this a Widget over a Dataset
 * with a required parameter would save, reload unbound, and fail — the binding
 * collected at composition time silently discarded by the round trip.
 */
const BINDINGS_KEY = 'smc.parameterBindings'

// --- outbound ---------------------------------------------------------------

/**
 * Resolves a Widget's client id to the one the API knows, or to nothing.
 *
 * `undefined` means *assign one* — the Widget has never been saved, and the
 * schema says an id is "assigned on save when absent".
 */
export type WidgetIdResolver = (clientId: string) => string | undefined

export function dashboardInputFrom(
  board: Board,
  /** Omitted leaves every Widget id as the client spells it. */
  widgetId: WidgetIdResolver = (clientId) => clientId,
): ApiDashboardInput {
  return {
    name: board.name,
    description: board.description,
    widgets: placedWidgets(board).map((widget) => widgetInputFrom(widget, widgetId)),
    /*
     * Controls and Sections travel whole. The API stores composition elements
     * verbatim for exactly this — they draw from no Dataset, which is what
     * distinguishes them from Widgets — so no translation is needed and none is
     * invented. A Section's `y` is what makes membership derivable (D19); a
     * lossy round trip here would put Widgets under the wrong headings.
     */
    composition_elements: { controls: board.controls, sections: board.sections },
  }
}

function widgetInputFrom(widget: PlacedWidget, widgetId: WidgetIdResolver): ApiWidget {
  /*
   * Omitted when the API has never seen this Widget, so it issues the id.
   *
   * It used to be sent as minted, which meant `local:w-4klw2vxzdo` — a client
   * artifact, complete with the prefix that marks *our* unsaved records —
   * persisted into their data. The board id was already handled this way; the
   * Widget id was not, and nothing said why they should differ.
   */
  const assigned = widgetId(widget.id)

  return {
    ...(assigned === undefined ? {} : { id: assigned }),
    title: widget.title,
    dataset_id: widget.datasetId,
    /*
     * Sent as we spell it, which is now also as they spell it. The backend
     * adopted §4.2's identifiers on 15 September, so the translation this line
     * used to carry is gone — see `api-taxonomy.ts`.
     */
    visualization_type: widget.typeId,
    presentation_options: {
      [MAPPING_KEY]: widget.mapping,
      ...(widget.subtitle === undefined ? {} : { [SUBTITLE_KEY]: widget.subtitle }),
      ...(widget.exposedSorts === undefined ? {} : { [SORTS_KEY]: widget.exposedSorts }),
      ...(widget.options === undefined ? {} : { [OPTIONS_KEY]: widget.options }),
      ...(widget.parameterBindings === undefined
        ? {}
        : { [BINDINGS_KEY]: widget.parameterBindings }),
    },
    /*
     * The declared home for a binding, and where it should have been going.
     *
     * `default_filters` is *"filter values applied unless a viewer changes an
     * exposed one"*, with keys validated against the Dataset's published Filter
     * Parameters. That is exactly what a binding is. We were writing them only
     * to `presentation_options` under a private key — which Analytics treats as
     * opaque, so nothing validated them and nothing but us could read them.
     *
     * The chart was still right, because we send the parameters ourselves on
     * the query call. What was wrong is the *record*: a Dashboard whose Widget
     * says "failed transactions" carried no stored evidence of the narrowing
     * anywhere the API could see, so any other reader of that Dashboard — a
     * second client, an export, their own admin surface — would have shown the
     * unfiltered figure under our title.
     *
     * Still written to both. Boards saved before today carry only the private
     * key, and `widgetFrom` reads whichever is present.
     */
    ...(widget.parameterBindings === undefined
      ? {}
      : { default_filters: widget.parameterBindings }),
    exposed_filters: widget.exposedFilters ?? [],
    layout: { x: widget.x, y: widget.y, w: widget.w, h: widget.h },
  }
}

/**
 * D26 — our `individual | group` against the API's `user | department`.
 *
 * The same idea under different names, except that `group` is the broader word
 * and the API deliberately is not: a department is an IAM concept it holds a
 * reference to, not an arbitrary set. So a group Grant is only meaningful where
 * the group *is* a department, which is what `recipientId` already holds.
 */
export function grantInputFrom(grant: ShareGrant): {
  target_type: 'user' | 'department'
  target_ref: string
} {
  return {
    target_type: grant.recipientKind === 'individual' ? 'user' : 'department',
    target_ref: grant.recipientId,
  }
}

/** Identifies a Grant by what it targets, which is all the API lets us compare. */
export const grantKey = (grant: ShareGrant): string =>
  `${grant.recipientKind === 'individual' ? 'user' : 'department'}:${grant.recipientId}`

/** D25 — our three Scope kinds against the API's four levels. */
export function scopeInputFrom(scope: DashboardScope): {
  scope_level: string
  scope_organizational_ref?: string
} {
  switch (scope.kind) {
    case 'personal':
      return { scope_level: 'personal' }
    case 'organizational-scope':
      // Their `department` is the IAM concept our `organizational-scope` names.
      // `role` is the fourth level and we model nothing that maps to it.
      return { scope_level: 'department', scope_organizational_ref: scope.scopeId }
    case 'organization-wide':
      return { scope_level: 'organization' }
  }
}

// --- inbound ----------------------------------------------------------------

export function boardFrom(api: ApiDashboard, fallbackAuthorId: string): Board {
  const widgets: Record<string, WidgetSpec> = {}
  const placements: Placement[] = []

  ;(api.widgets ?? []).forEach((widget, index) => {
    // A Widget with no id is one the API has not assigned one to yet, which its
    // own schema says happens on save. Indexing keeps the board renderable
    // rather than dropping the card.
    const id = widget.id ?? `${api.id}-w${String(index)}`
    widgets[id] = specFrom(id, widget)
    placements.push(placementFrom(id, widget.layout, index))
  })

  const elements = api.composition_elements ?? {}

  return {
    id: api.id,
    name: api.name,
    description: api.description ?? '',
    authorId: api.creator_actor_id ?? fallbackAuthorId,
    status: api.status === 'published' ? 'published' : 'draft',
    scope: scopeFrom(api),
    /*
     * Grants are not on the Dashboard schema — they are their own sub-resource
     * and the read endpoint does not embed them. An empty list here is honest
     * about what this response contains rather than asserting there are none.
     * Finding 24.
     */
    shareGrants: [],
    placements,
    widgets,
    controls: arrayOf<Control>(elements, 'controls'),
    sections: arrayOf<Section>(elements, 'sections'),
    updated: (api.updated_at ?? api.created_at ?? '').slice(0, 10),
  }
}

function specFrom(id: string, widget: ApiWidget): WidgetSpec {
  const options = widget.presentation_options ?? {}
  return {
    id,
    typeId: widget.visualization_type,
    datasetId: widget.dataset_id,
    title: widget.title,
    subtitle: asString(options[SUBTITLE_KEY]),
    /*
     * An absent mapping is an empty one rather than a thrown error. The Widget
     * then fails its own satisfaction check and renders as a card that cannot
     * draw — which is visible and recoverable. Throwing here would take the
     * whole board down for one bad Widget, and partial failure is the pattern
     * the six render states exist to support.
     */
    mapping: (options[MAPPING_KEY] as WidgetMapping | undefined) ?? {},
    options: options[OPTIONS_KEY] as Record<string, unknown> | undefined,
    exposedFilters: widget.exposed_filters,
    exposedSorts: options[SORTS_KEY] as string[] | undefined,
    /*
     * `default_filters` first — it is the declared field and the one the API
     * validates. The private key is the fallback for Widgets stored before we
     * started writing the declared one.
     */
    parameterBindings: bindingsFrom(widget.default_filters) ??
      (options[BINDINGS_KEY] as Record<string, string | number> | undefined),
  }
}

/**
 * A Widget with no layout is stacked rather than piled at the origin.
 *
 * Every Widget landing on `{0,0}` renders as one card with nine underneath it,
 * which reads as data loss. A column down the left is obviously unarranged, and
 * an Author fixes it by dragging.
 */
function placementFrom(
  widgetId: string,
  layout: ApiWidget['layout'],
  index: number,
): Placement {
  const w = clamp(layout?.w ?? 6, 1, DASHBOARD_COLUMNS)
  return {
    widgetId,
    x: clamp(layout?.x ?? 0, 0, DASHBOARD_COLUMNS - w),
    y: layout?.y ?? index * 4,
    w,
    h: Math.max(1, layout?.h ?? 4),
  }
}

function scopeFrom(api: ApiDashboard): DashboardScope {
  switch (api.scope_level) {
    case 'organization':
      return { kind: 'organization-wide' }
    case 'department':
    case 'role':
      /*
       * `role` folds into the same kind deliberately. We model no role Scope,
       * and the API's own note says a `role` scope "currently admits only the
       * creator and Administrators" — so presenting it as something narrower
       * than it is would be the more misleading choice than naming it a scope
       * reference we hold and do not interpret.
       */
      return {
        kind: 'organizational-scope',
        scopeId: api.scope_organizational_ref ?? '',
        label: api.scope_organizational_ref ?? 'Organizational scope',
      }
    default:
      return { kind: 'personal' }
  }
}

function arrayOf<T>(elements: Record<string, unknown>, key: string): T[] {
  const value = elements[key]
  return Array.isArray(value) ? (value as T[]) : []
}

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, Math.round(value)))

/** A deleted Dashboard is a status, never a removed row. */
export const isLive = (api: ApiDashboard): boolean => api.deleted !== true

/**
 * `default_filters` as bindings, or nothing.
 *
 * Unvalidated wire data: the schema says `additionalProperties: true`, so a
 * value could be anything. Only strings and finite numbers are parameters a
 * query can carry, and a binding that silently became `[object Object]`
 * upstream would narrow to nothing and look like an empty Dataset.
 */
function bindingsFrom(
  declared: Record<string, unknown> | undefined,
): Record<string, string | number> | undefined {
  if (!declared) return undefined
  const usable = Object.entries(declared).filter(
    (entry): entry is [string, string | number] =>
      typeof entry[1] === 'string' || (typeof entry[1] === 'number' && Number.isFinite(entry[1])),
  )
  return usable.length === 0 ? undefined : Object.fromEntries(usable)
}
