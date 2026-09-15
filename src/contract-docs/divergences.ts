/**
 * The divergence register — every place this implementation does not match the
 * contract it answers to, with the clause, the reason, and how long it is meant
 * to last.
 *
 * There are now two such contracts, which is why every entry carries an
 * `authority`. The **FRD** says what the capability must do; the **deployed
 * Analytics API** says what goes on the wire. They are mostly answering
 * different questions, and an entry names which one it departs from. An entry
 * where the two contracts disagree with *each other* is not a divergence at all
 * — it is a Finding for the FRD authors, and it belongs in
 * `Analytics_API_Alignment.md` §6.
 *
 * Merge Plan §4, and §9's third guard. It lives in code rather than in the plan
 * document for one reason: `bun run docs` emits it and `render.test.ts` fails if
 * the emitted copy drifts, so a divergence that gets fixed cannot stay listed
 * and one that gets introduced cannot stay unlisted. That is what makes "if we
 * divert from the FRD, we state it and give reasons" a property of the build
 * rather than a habit.
 *
 * Distinct from the **Findings** in `Analytics_Frontend_Plan.md` §9: a Finding is
 * a gap in the requirements, a Divergence is a place our implementation does not
 * match them. Where the two are related the entry says so.
 *
 * Ids are permanent. A resolved entry keeps its number and moves to `resolved`
 * rather than being deleted or reused — the register is a record of decisions,
 * and renumbering it would break every code comment that cites one.
 */

export type DivergenceStatus =
  /** We are asking the FRD to grow. */
  | 'proposed-extension'
  /** We think the FRD is wrong or under-specified and chose differently. */
  | 'deliberate-deviation'
  /** Conformance deferred, with a stage that ends it. */
  | 'temporary'
  /** Was one of the above; no longer diverges. Kept for the record. */
  | 'resolved'

/** Which contract an entry departs from. See the header. */
export type DivergenceAuthority =
  /** The FRD. The API is silent, or leaves the field opaque to us. */
  | 'frd'
  /** The deployed Analytics API. Its wire format wins; we adapt. */
  | 'api'
  /** Both say the same thing and we still differ. The hardest to defend. */
  | 'both'

export interface Divergence {
  id: string
  /**
   * The requirement. An FRD clause, or an API path or schema name.
   */
  clause: string
  authority: DivergenceAuthority
  /** One line: what we do instead. */
  divergence: string
  status: DivergenceStatus
  /** Why. Written for whoever has to defend it, not for whoever wrote it. */
  reason: string
  /** Related Findings, by their §9 number. */
  findings?: number[]
  /** Where it is enforced, or where the reasoning lives. */
  where?: string
  /** For `temporary` and `resolved`: the stage that ended it. */
  endedAt?: string
}

export const DIVERGENCES: Divergence[] = [
  {
    id: 'D1',
    clause: 'FR-VZ-05, §4.2',
    authority: 'frd',
    divergence: 'Mapping slots carry ten roles, not the four `MappingSlotId` names.',
    status: 'proposed-extension',
    findings: [14],
    where: 'analytics/builder/requirements.ts',
    reason:
      'Five built Visualization Types cannot be mapped at all with four roles: a point map needs ' +
      'latitude and longitude, a Sankey a source and a target, a gauge a target Measure, a status ' +
      'widget a state Dimension, and a pivot a second Dimension for its columns. Three of those are ' +
      "the same shortfall Finding 1 names at Field level, one level up: even with a `state`-semantic " +
      'Field declared, the Status slot table had nowhere to put it.',
    // The API asks nothing of us here: `Widget.presentation_options` is "opaque to
    // Analytics" and "the composition surface owns their meaning". So the slot
    // vocabulary is ours to define, and this stays a request to the FRD for
    // coherence rather than a blocker on anything.
  },
  {
    id: 'D2',
    clause: 'FR-DP-03 — FR-DP-07',
    authority: 'frd',
    divergence:
      '`FieldSemantic` distinguishes naming a place from locating one, and latitude from longitude.',
    status: 'proposed-extension',
    findings: [1, 15],
    where: 'domain/dataset.ts',
    reason:
      "Finding 1 recommends a single `geographic-location` descriptor. It cannot tell a Dimension " +
      'holding "Kenya" from a Measure holding -1.29, and the two feed different Types — a choropleth ' +
      'needs the former, a point map the latter. The FRD\'s own Geospatial clause read ' +
      "`semantic === 'geographic-location' && role !== 'measure'`, which excludes precisely the " +
      'Fields a point map needs, so no Dataset could ever satisfy it that way.',
  },
  {
    id: 'D3',
    clause: 'FR-VZ-03',
    authority: 'frd',
    divergence: 'Mapping slots are declared per Visualization Type as well as per Family.',
    status: 'deliberate-deviation',
    where: 'analytics/builder/refinement.test.ts',
    reason:
      'Per Family is right for eligibility and too coarse for rendering: `line-chart` and ' +
      '`area-chart` share a Family and are the same mapping, `funnel` and `sankey` share one and are ' +
      'not. So the Family table stays the eligibility contract FR-VZ-05 evaluates and the Type table ' +
      'refines it. A Type may narrow a Family slot or add an optional one; it may never widen a ' +
      'required one, which is checked rather than trusted.',
  },
  {
    id: 'D4',
    clause: 'FR-CO-02',
    authority: 'frd',
    divergence: 'A Placement is `{x, y, w, h}`, not a span and an ordinal.',
    status: 'deliberate-deviation',
    where: 'domain/composition.ts',
    reason:
      '"Position and size, both changeable by the Author" reads as two dimensions. A span with an ' +
      'ordinal gives size and *sequence* but not position — two Widgets cannot sit side by side with ' +
      'a gap beneath one of them. The product module had already moved to this model and proved it, ' +
      'so the model adopted it rather than the module reverting.',
    // Vindicated: the deployed API's `WidgetLayout` is `{ x, y, w, h }`. Two teams
    // reading the same requirement landed in the same place, independently.
  },
  {
    id: 'D5',
    clause: 'FR-VZ-05',
    authority: 'frd',
    divergence: '`Dataset.suits` promotes the Visualization Types a publisher intends.',
    status: 'deliberate-deviation',
    where: 'domain/dataset.ts',
    reason:
      'The invariant holds — nothing is excluded by it and every Type whose Family the Dataset ' +
      'satisfies stays on offer; it only reorders the picker. It exists because role is not meaning: ' +
      'any table with a Dimension and a Measure satisfies a funnel, one of them is *about* funnels, ' +
      'and the only party who knows which is the publisher. Inferring it from names was tried and ' +
      'matches "Service health" for a *stat* card.',
  },
  {
    id: 'D6',
    clause: 'FR-VZ-01',
    authority: 'frd',
    divergence: 'One of the 42 Visualization Types has no renderer.',
    status: 'temporary',
    where: 'analytics/widgets/catalog.ts',
    reason:
      'Down from eight before the merge, which brought three workbench renderers across. The ' +
      'remaining six are `comparison-table`, `stacked-100-bar`, `violin-plot`, `heatmap-matrix`, ' +
      '`bar-chart-race` and `choropleth-map`. The last is the standing decision about bundling ~100KB ' +
      'of boundary geometry; the other five are ordinary work. All 13 Families are covered, and the ' +
      'catalogue lists what is unbuilt rather than hiding it.',
  },
  {
    id: 'D7',
    clause: 'FR-VZ-01',
    authority: 'frd',
    divergence: '`status-list` is a 43rd Visualization Type.',
    status: 'proposed-extension',
    where: 'analytics/widgets/taxonomy.test.ts',
    reason:
      "The Status Family's three Types are a badge, a threshold indicator and an alert banner. A " +
      'list of services each carrying a state is none of them, and composing it from single ' +
      'indicators loses the shared axis that makes it readable. Proposed rather than dropped, and ' +
      'pinned by a test so a fourth addition is a decision rather than a slot appearing.',
  },
  {
    id: 'D8',
    clause: 'FR-DA-09 — FR-DA-12',
    authority: 'frd',
    divergence: 'Authorization was absent; the module had no Viewer.',
    status: 'resolved',
    endedAt: 'Stage 5',
    where: 'analytics/data/adapters.ts',
    reason:
      'Every port call now carries a `ViewerIdentity` and authorization is resolved per Dataset per ' +
      'call. Resolved in shape rather than in substance: the local Viewer is authorized for ' +
      'everything, so the *seam* is real and the policy behind it is a fixture.',
  },
  {
    id: 'D9',
    clause: 'FR-DA-12',
    authority: 'frd',
    divergence: 'Aggregation happened in the browser.',
    status: 'deliberate-deviation',
    findings: [5, 19],
    where: 'analytics/data/query.ts, analytics/widgets/Widget.tsx',
    reason:
      'REOPENED. Resolved at Stage 4 by moving aggregation into the query, on Finding 5\'s argument ' +
      'that a client receiving raw rows has already obtained data the Viewer may not be entitled to. ' +
      'That premise assumed Analytics would query on the Viewer\'s behalf with its own credentials. ' +
      'It does not: it relays the Viewer\'s own token and tells the Source System to "treat the ' +
      'request identically to direct API access by that user". Every row reaching the browser is ' +
      'therefore a row that Viewer could have fetched directly, and FR-DA-12 holds by a better ' +
      'mechanism than ours. The query has nowhere to carry an aggregation, so this stops being a ' +
      'thing to fix and becomes a thing to state — and the three types that send `measures` need ' +
      'their client-side reduction back. See Finding 19.',
  },
  {
    id: 'D10',
    clause: 'FR-VZ-09',
    authority: 'frd',
    divergence: 'A board embedded its Widgets by value.',
    status: 'resolved',
    endedAt: 'Stage 6.2',
    findings: [4],
    where: 'analytics/builder/boards.ts',
    reason:
      'A Widget saved to a Widget Library and reused across Dashboards has identity independent of ' +
      'any one of them, so a board holds placements pointing at Widgets. Cheap to adopt then, an ' +
      'expensive migration later.',
    // Superseded by D23: the deployed API embeds Widgets by value, so this was
    // resolved in the direction the FRD implied and the implementation went the
    // other way. Kept resolved against the FRD; D23 carries the API's answer.
  },
  {
    id: 'D11',
    clause: 'FR-CO-05 — FR-CO-08',
    authority: 'frd',
    divergence: 'The module had no Controls, Containers or exposed filters.',
    status: 'resolved',
    endedAt: 'Stage 6',
    where: 'analytics/builder/BoardControls.tsx, analytics/builder/sections.ts',
    reason:
      'Exposed filters and sorts (6.1), Controls with their reach reported (6.3) and Sections as ' +
      'bands (6.4) are all present. A Control still names no Widgets: correspondence is computed per ' +
      'Widget from its bound Dataset, so adding a Widget brings it under an existing Control.',
  },
  {
    id: 'D12',
    clause: 'FR-DP-03',
    authority: 'frd',
    divergence: 'A Field carries a `format`.',
    status: 'proposed-extension',
    where: 'domain/dataset.ts',
    reason:
      'How a value reads is a property of the data, not of any one picture of it: revenue is a ' +
      'currency in every chart that draws it. Putting it on the Widget instead asks each Author to ' +
      're-declare it, which is how two Widgets over one Field end up disagreeing about whether it is ' +
      'money. The publisher is the only party that knows.',
  },
  {
    id: 'D13',
    clause: 'FR-DA-12',
    authority: 'frd',
    divergence: 'Single-value widgets still reduce records in the browser.',
    status: 'deliberate-deviation',
    findings: [5, 19],
    where: 'analytics/widgets/Widget.tsx',
    reason:
      'Permanent as of the API review: the query cannot express an aggregation, so there is no ' +
      'server to move this to, and token relay means the rows were the Viewer\'s to see anyway. ' +
      'A delta card needs the latest value *and* the one before it, which is two aggregates over ' +
      'different windows of one query. `DatasetQuery` expresses one. Until it can express a ' +
      'comparison window, the second point is taken from the returned rows.',
  },
  {
    id: 'D14',
    clause: 'FR-DA-12',
    authority: 'frd',
    divergence: 'Distribution widgets bin values in the browser.',
    status: 'deliberate-deviation',
    findings: [5, 19],
    where: 'analytics/widgets/primitives/Distribution.tsx',
    reason:
      'Permanent as of the API review: the query cannot express an aggregation, so there is no ' +
      'server to move this to, and token relay means the rows were the Viewer\'s to see anyway. ' +
      'A histogram is a reduction over every value, and bucket boundaries depend on the data — ' +
      '`DatasetQuery` has no bucketing clause to ask for them. Either the query model gains one or ' +
      'these two Types keep an explicit, bounded row budget.',
  },
  {
    id: 'D17',
    clause: 'FR-VZ-04',
    authority: 'frd',
    divergence: "A board keys `WidgetSpec` rather than the model's `Widget`.",
    status: 'deliberate-deviation',
    where: 'analytics/builder/boards.ts',
    reason:
      'The same record with two differences, both tracing to D1: the mapping vocabulary has ten ' +
      'roles rather than four, and the Type id is the module\'s. Adopting `Widget` would mean ' +
      'flattening the mapping into `FieldMapping` and losing five Types, so the board keys the ' +
      'shape it can actually render and the access rules take the narrow view they need.',
  },
  {
    id: 'D18',
    clause: 'FR-VZ-02, §4.2',
    authority: 'frd',
    divergence: '`timeline-chart` does not satisfy its Family\'s Data Shape.',
    status: 'deliberate-deviation',
    findings: [16],
    where: 'analytics/builder/refinement.test.ts',
    reason:
      'The FRD classifies "Gantt / timeline chart" under Temporal Pattern, which requires a Time ' +
      'Dimension. A Gantt spans an *interval* — a start and an end — and the common encoding is two ' +
      'numeric offsets, so there is no Time Dimension in it. Both fixes are worse than the gap: ' +
      'narrowing the axis makes the Type satisfy nothing, and re-classifying it is the FRD\'s call.',
  },
  {
    id: 'D19',
    clause: 'FR-CO-07',
    authority: 'frd',
    divergence: 'A Section carries its starting row; membership is derived, not stored.',
    status: 'deliberate-deviation',
    where: 'domain/composition.ts, analytics/builder/sections.ts',
    reason:
      'The same gap D4 closed for Placement: a Container required to organize Widgets *spatially* ' +
      'carried no position, so nothing said where one began. Storing `Placement.sectionId` as well ' +
      'would make two records of one fact, free to disagree the moment a Widget is dragged. Deriving ' +
      'it means dragging a Widget under a heading is how you move it there.',
  },
  {
    id: 'D20',
    clause: 'FR-VZ-03, §4.2',
    authority: 'frd',
    divergence:
      'The Status Family requires none of its mapping slots, because its Data Shape is a disjunction.',
    status: 'proposed-extension',
    findings: [14, 17],
    where: 'visualization/mapping-slots.ts, analytics/builder/refinement.test.ts',
    reason:
      '§4.2 gives Status two alternative shapes — "one Measure with a threshold, *or* one state ' +
      'Dimension" — and the two need different slots: a threshold indicator takes a Measure and no ' +
      'Dimension, a status tile takes a state Dimension. A per-Family slot table can only express a ' +
      'conjunction, so requiring either slot asserts something the Family does not require and makes ' +
      'the other route unrepresentable. Surfaced by porting the threshold route in §2: D3\'s ' +
      'refinement guard rejected both new Types, correctly. The eligibility guarantee is not lost — ' +
      'the disjunction is modelled properly in the Data Shape clause, which is what FR-VZ-05 ' +
      'evaluates — and a counterpart guard now asserts every built Type still requires at least one ' +
      'slot of its own, so "the Family requires nothing" cannot become "a Type may require nothing".',
  },
  // --- the deployed API -----------------------------------------------------
  // Everything below answers to https://api.dev.analytics.penilabs.com, not to
  // the FRD. Where the API and the FRD disagree with each other, the entry says
  // so and a Finding carries the question upstream.

  {
    id: 'D21',
    clause: 'API: schema Field.role',
    authority: 'api',
    divergence: 'A Field has three roles; the API has two, and time is a Field *type*.',
    status: 'resolved',
    endedAt: 'catalogue/api-dataset.ts - the role is reconstructed from `time_dimension_field`',
    findings: [18],
    where: 'domain/dataset.ts, analytics/builder/requirements.ts',
    reason:
      "The API's `FieldRole` is `dimension | measure`. A date is `type: 'date'`, and the Dataset " +
      'names one of them in `time_dimension_field`. We followed FR-DP-06 and made Time Dimension a ' +
      'third role, which every slot that accepts a temporal axis then depends on. The API wins: it ' +
      'is shared across products and already published to integrators, and the translation is an ' +
      'adapter in our repo rather than a change to a contract other teams have read.',
  },
  {
    id: 'D22',
    clause: 'API: GET /v1/datasets/{datasetId}/query',
    authority: 'api',
    divergence: 'A query is flat filter parameters, not a `DatasetQuery`.',
    status: 'resolved',
    endedAt: 'retrieval/http-retrieval.ts - filters go upstream, ordering and reduction finish locally',
    findings: [19],
    where: 'analytics/data/query.ts',
    reason:
      'The endpoint accepts the Dataset\'s published Filter Parameters "and nothing else". There ' +
      'is no `dimensions`, no `measures`, no `sort` and no `limit`, because Analytics stores nothing ' +
      'and computes nothing: it forwards to the Source System and relays the answer byte-for-byte. ' +
      'Measured against our 37 built types, this costs less than it sounds — 25 emit an empty query ' +
      'already, which is exactly a bare GET. Nine emit `sort` and three emit `measures`, and those ' +
      'twelve are the whole of the work.',
  },
  {
    id: 'D23',
    clause: 'API: schema Dashboard.widgets',
    authority: 'api',
    divergence: 'A board references its Widgets by id; the API embeds them by value.',
    status: 'resolved',
    endedAt: 'dashboard/api-dashboard.ts - joined on the way out, split on the way in',
    findings: [20],
    where: 'analytics/builder/boards.ts',
    reason:
      '`Dashboard.widgets` is an array of Widgets, each with an id "assigned on save when absent". ' +
      'A Widget therefore has no identity independent of the Dashboard holding it. We moved the ' +
      'other way at Stage 6.2 on Finding 4\'s advice, which read FR-VZ-09\'s Widget Library as ' +
      'implying references. The API contradicts that, so this is a straight revert of one of our own ' +
      'decisions — and Finding 20 asks the FRD authors which of the two is intended.',
  },
  {
    id: 'D24',
    clause: 'API: schema FilterParameter',
    authority: 'api',
    divergence: 'A Field carries `filterable`; the API declares Filter Parameters separately.',
    status: 'resolved',
    endedAt: 'catalogue/api-dataset.ts - `filterable` is read from `filter_parameters`',
    where: 'domain/dataset.ts',
    reason:
      'The API keeps two lists. `fields` describes the *response* shape — and a Field name "must ' +
      'match the field name the Source System returns", which is the promise that lets us render ' +
      'generically at all. `filter_parameters` describes the *accepted query inputs*, each with its ' +
      'own type, `required` flag and optional `allowed_values`. We collapsed both into a boolean on ' +
      'the Field, which cannot express a parameter that is not also a returned column, nor an ' +
      'enumerated value list. This is the one API divergence where their model is plainly richer ' +
      'than ours rather than merely different.',
  },
  {
    id: 'D25',
    clause: 'API: schema DashboardScopeLevel',
    authority: 'api',
    divergence: 'Scope has three levels; the API has four, including `role`.',
    status: 'resolved',
    endedAt: 'dashboard/api-dashboard.ts - `role` folds into an organizational scope',
    findings: [21],
    where: 'domain/dashboard.ts',
    reason:
      "The API's levels are `personal | department | role | organization`, and the reference field " +
      'is `scope_organizational_ref`. We modelled three, leaving role-based Scope out because ' +
      "Frontend Plan §8 recorded the naming hazard around it. The API added it, and its own note " +
      'says a `role` scope "currently admits only the creator and Administrators" — so the level ' +
      'exists and does not yet mean what it says. Finding 21 carries that.',
  },
  {
    id: 'D26',
    clause: 'API: schema ShareGrantTarget',
    authority: 'api',
    divergence: 'A Share Grant targets an individual or a group; the API says user or department.',
    status: 'resolved',
    endedAt: 'dashboard/api-dashboard.ts - `grantInputFrom`',
    where: 'domain/dashboard.ts',
    reason:
      'Ours is `individual | group` with a `recipientLabel`; the API is `user | department` with a ' +
      '`target_ref`. The same idea under different names, and the rename is the whole of the fix. ' +
      'Worth recording only because `group` is the broader word and the API deliberately is not: a ' +
      'department is an IAM concept it holds a reference to, not an arbitrary set.',
  },
  {
    id: 'D27',
    clause: 'API: schema Envelope',
    authority: 'api',
    divergence: 'Every response is wrapped in `{ status, message, data }`; we read bodies directly.',
    status: 'resolved',
    endedAt: 'widgets/WidgetCard.tsx - the note under the figure it qualifies',
    where: 'api/client.ts, retrieval/relayed-body.ts, analytics/widgets/WidgetCard.tsx',
    reason:
      'A boolean `status`, a human `message`, and the payload under `data`. One unwrap in the ' +
      'adapter and nothing above it needs to know — which is the argument for the adapter existing ' +
      'at all. Recorded because the envelope also carries the partial-result marker: a Source System ' +
      'may answer `200` with `meta.partial` and a reason, and a widget that ignores that shows a ' +
      'truncated series as if it were the whole one. Half of this is done: the client unwraps the ' +
      'envelope once, and `relayed-body.ts` finds the marker under either of the two readings the ' +
      'spec admits. It now reaches the card: a note under the figure it qualifies, shown on ' +
      '`ready` and on `empty`, on a bare stat tile as well as a chart, and never behind a hover ' +
      '- a tooltip is invisible to a touchscreen, a wall display, and a screenshot, which are ' +
      'three of the ways a wrong number travels. It is not a seventh render state: it qualifies ' +
      'an answer rather than replacing one, so the picture is still drawn.',
  },
  {
    id: 'D28',
    clause: 'API: schema Widget.visualization_type',
    authority: 'api',
    divergence: 'Visualization Type ids may be a third vocabulary, neither ours nor the FRD\'s.',
    status: 'temporary',
    endedAt: 'confirmation against a live Dataset',
    findings: [22],
    where: 'analytics/widgets/catalog.ts, analytics/widgets/taxonomy.test.ts',
    reason:
      '`visualization_type` is a bare string that Analytics *validates* against the Families the ' +
      "bound Dataset's Data Shape satisfies, so the API is the authority for those strings. It " +
      'publishes no enum: they are discovered at runtime from `/presentation`. Its examples read ' +
      '`family: "trend-over-time"` and `types: ["line", "area"]` where Stage 1 renamed us to the ' +
      "FRD's `trend`, `line-chart` and `area-chart`. Examples are not a contract and may simply be " +
      'loose, so this is unconfirmed — one authenticated call settles it. If it holds, Stage 1 needs ' +
      'doing again, and `taxonomy.test.ts` should assert against the API rather than a local manifest.',
  },
  {
    id: 'D29',
    clause: 'API: schema Aggregation',
    authority: 'api',
    divergence: 'Two aggregations are spelled `minimum` and `maximum`; the API says `min` and `max`.',
    status: 'resolved',
    endedAt: 'catalogue/api-dataset.ts - a translation table, and an unknown name is dropped',
    where: 'domain/dataset.ts, analytics/data/adapters.ts',
    reason:
      'Both enumerate the same six — sum, average, count, the two extremes, and a distinct count — ' +
      'and differ only on whether the extremes are abbreviated. Found by the type-checker while ' +
      'writing the reduction for D22, which is the useful part: a declared `min` would have fallen ' +
      'through our switch to a silent zero rather than failing, because an aggregation we do not ' +
      'recognise looks exactly like an empty column. Two names for one operation is also how a ' +
      'board ends up averaging a count, so the translation belongs in one place.',
  },
  {
    id: 'D30',
    clause: 'API: schema Dataset',
    authority: 'api',
    divergence: 'A Dataset declares what one row represents; the API has nowhere to put it.',
    status: 'proposed-extension',
    where: 'domain/dataset.ts, domain/publication-contract.ts (PC-08)',
    reason:
      'A declaration lists the columns and never says how many rows to expect. Two Datasets can ' +
      'declare identically — same Fields, same roles, same aggregations — while one returns a ' +
      'single summary row and the other one row per corridor per day, and those feed almost ' +
      'disjoint sets of Visualization Types. An Author picking for a stat card cannot tell them ' +
      'apart, and FR-DP-11 exists precisely so they do not have to retrieve the data to find out. ' +
      "Worse, `aggregations` is the only aggregation-shaped field in a declaration, so it reads " +
      'like the answer and is not: it says what could meaningfully be done to a figure, never what ' +
      'was. PC-08 requires the grain; the API carrying it is the ask.',
  },
  {
    id: 'D31',
    clause: 'API: schema FilterParameter',
    authority: 'api',
    divergence: 'Enumerable Filter Parameters must publish their accepted values; the API leaves it optional.',
    status: 'proposed-extension',
    findings: [8],
    where: 'domain/publication-contract.ts (PC-09), analytics/data/AnalyticsData.tsx',
    reason:
      '`allowed_values` exists on the API and is optional, so a publisher may omit it and still ' +
      'pass validation — at which point a Viewer is offered a filter control with nothing in it. ' +
      'Deriving the list from returned rows is the obvious substitute and the wrong one: the ' +
      'options would then change as other filters changed, and a control that narrows itself is ' +
      'worse than an empty one. Whether values are enumerable is the publisher\'s judgement and ' +
      'cannot be checked from here — 365 dates are not a dropdown — so PC-09 states the obligation ' +
      'and checks what it can, that a declared list is not empty. Narrows Finding 8 to the filters ' +
      'a declaration genuinely cannot enumerate.',
  },
]
/** Entries that still diverge. */
export const openDivergences = (): Divergence[] =>
  DIVERGENCES.filter((entry) => entry.status !== 'resolved')

/** Entries conformance has caught up with. */
export const resolvedDivergences = (): Divergence[] =>
  DIVERGENCES.filter((entry) => entry.status === 'resolved')
