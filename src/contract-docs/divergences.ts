/**
 * The divergence register — every place this implementation does not match the
 * FRD, with the clause, the reason, and how long it is meant to last.
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

export interface Divergence {
  id: string
  /** The requirement, as the FRD numbers it. */
  clause: string
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
  },
  {
    id: 'D2',
    clause: 'FR-DP-03 — FR-DP-07',
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
    divergence: 'A Placement is `{x, y, w, h}`, not a span and an ordinal.',
    status: 'deliberate-deviation',
    where: 'domain/composition.ts',
    reason:
      '"Position and size, both changeable by the Author" reads as two dimensions. A span with an ' +
      'ordinal gives size and *sequence* but not position — two Widgets cannot sit side by side with ' +
      'a gap beneath one of them. The product module had already moved to this model and proved it, ' +
      'so the model adopted it rather than the module reverting.',
  },
  {
    id: 'D5',
    clause: 'FR-VZ-05',
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
    divergence: 'Six of the 42 Visualization Types have no renderer.',
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
    divergence: 'Aggregation happened in the browser.',
    status: 'resolved',
    endedAt: 'Stage 4',
    findings: [5],
    where: 'analytics/data/query.ts',
    reason:
      'A client that receives raw rows and aggregates them has already obtained data the Viewer may ' +
      'not be entitled to, so the guarantee is unenforceable. Measures now carry their aggregation ' +
      'in the query and the roll-up comes from what the Dataset declared meaningful. Two reductions ' +
      'remain and are recorded separately as D13 and D14.',
  },
  {
    id: 'D10',
    clause: 'FR-VZ-09',
    divergence: 'A board embedded its Widgets by value.',
    status: 'resolved',
    endedAt: 'Stage 6.2',
    findings: [4],
    where: 'analytics/builder/boards.ts',
    reason:
      'A Widget saved to a Widget Library and reused across Dashboards has identity independent of ' +
      'any one of them, so a board holds placements pointing at Widgets. Cheap to adopt then, an ' +
      'expensive migration later.',
  },
  {
    id: 'D11',
    clause: 'FR-CO-05 — FR-CO-08',
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
    divergence: 'Single-value widgets still reduce records in the browser.',
    status: 'temporary',
    findings: [5],
    where: 'analytics/widgets/Widget.tsx',
    reason:
      'A delta card needs the latest value *and* the one before it, which is two aggregates over ' +
      'different windows of one query. `DatasetQuery` expresses one. Until it can express a ' +
      'comparison window, the second point is taken from the returned rows.',
  },
  {
    id: 'D14',
    clause: 'FR-DA-12',
    divergence: 'Distribution widgets bin values in the browser.',
    status: 'temporary',
    findings: [5],
    where: 'analytics/widgets/primitives/Distribution.tsx',
    reason:
      'A histogram is a reduction over every value, and bucket boundaries depend on the data — ' +
      '`DatasetQuery` has no bucketing clause to ask for them. Either the query model gains one or ' +
      'these two Types keep an explicit, bounded row budget.',
  },
  {
    id: 'D17',
    clause: 'FR-VZ-04',
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
    divergence: 'A Section carries its starting row; membership is derived, not stored.',
    status: 'deliberate-deviation',
    where: 'domain/composition.ts, analytics/builder/sections.ts',
    reason:
      'The same gap D4 closed for Placement: a Container required to organize Widgets *spatially* ' +
      'carried no position, so nothing said where one began. Storing `Placement.sectionId` as well ' +
      'would make two records of one fact, free to disagree the moment a Widget is dragged. Deriving ' +
      'it means dragging a Widget under a heading is how you move it there.',
  },
]

/** Entries that still diverge. */
export const openDivergences = (): Divergence[] =>
  DIVERGENCES.filter((entry) => entry.status !== 'resolved')

/** Entries conformance has caught up with. */
export const resolvedDivergences = (): Divergence[] =>
  DIVERGENCES.filter((entry) => entry.status === 'resolved')
