/**
 * Our Visualization Type ids on the wire — D28.
 *
 * The backend team answered the taxonomy question on 14 September: their
 * `visualization_type` takes `line` where §4.2 and our registry say `line-chart`,
 * and `top-n-list` where we say `ranked-list`. Sixteen ids differ in spelling.
 * Until that is reconciled, a Widget of any of those sixteen is rejected on save
 * with a 400 — which is nineteen of the thirty-seven built types once the three
 * with no counterpart at all are counted.
 *
 * So this translates at the boundary, exactly as `grantInputFrom` and
 * `scopeInputFrom` do for their own mismatches. Our domain keeps §4.2's
 * vocabulary — `typeId` is persisted, keys the renderer registry, keys the
 * per-Type mapping slots, and names the Types in the widget data contract
 * already circulated to Source System teams — and only the wire speaks theirs.
 *
 * **This is not a concession.** `Analytics_Taxonomy_Position.md` asks them to
 * adopt §4.2's identifiers and that ask stands, because a permanent translation
 * table is the N×M problem in miniature and because `/presentation` and the
 * proposed `GET /v1/visualizations` will both answer in their vocabulary too.
 * This is how we work in the meantime rather than how we think it should end.
 *
 * When they rename, `api-taxonomy.test.ts` fails and this file is deleted.
 */

/** Ours → theirs. Only the ids that differ; anything absent already agrees. */
const TO_API: Record<string, string> = {
  'line-chart': 'line',
  'area-chart': 'area',
  'spline-chart': 'spline',
  'step-chart': 'step',
  'bar-chart-vertical': 'bar',
  'bar-chart-horizontal': 'horizontal-bar',
  'grouped-bar-chart': 'grouped-bar',
  'stacked-bar-chart': 'stacked-bar',
  'pie-chart': 'pie',
  'donut-chart': 'donut',
  'scatter-plot': 'scatter',
  'bubble-chart': 'bubble',
  'bar-chart-race': 'bar-race',
  'radar-chart': 'radar',
  'ranked-list': 'top-n-list',
  'status-indicator': 'status-badge',
  'timeline-chart': 'gantt',
}

const FROM_API: Record<string, string> = Object.fromEntries(
  Object.entries(TO_API).map(([ours, theirs]) => [theirs, ours]),
)

/**
 * Types the deployed API has no identifier for at all.
 *
 * Not a spelling difference — a missing concept. `activity-feed` and
 * `event-log-view` are the Chronological Family, which their taxonomy does not
 * carry; `status-list` is our own 43rd Type (D7). All three are built and
 * rendering, and all three are refused on save.
 */
export const UNMAPPED_TYPE_IDS = ['activity-feed', 'event-log-view', 'status-list'] as const

export const acceptedByApi = (typeId: string): boolean =>
  !(UNMAPPED_TYPE_IDS as readonly string[]).includes(typeId)

/**
 * Sent as theirs where they differ, and as ours otherwise.
 *
 * An unmapped id goes out unchanged rather than being suppressed. The save then
 * fails with a 400 naming the field, which is the truthful outcome — silently
 * substituting some other Type would put a chart on the board that is not the
 * one the Author built.
 */
export const visualizationTypeToApi = (typeId: string): string => TO_API[typeId] ?? typeId

/**
 * Read back as ours.
 *
 * An id in neither table is returned unchanged: it is a Type this build does not
 * know, and the Widget renders as a card that cannot draw. That is the right
 * outcome for a board authored by a newer version of the frontend.
 */
export const visualizationTypeFromApi = (typeId: string): string => FROM_API[typeId] ?? typeId
