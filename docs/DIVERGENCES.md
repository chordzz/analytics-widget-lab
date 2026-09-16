# Analytics — Divergence Register

Every place this implementation does not match the contract it answers to, with
the clause, the reason, and how long it is meant to last.

There are two such contracts, so every entry names one. The **FRD** says what the
capability must do; the **API** — the deployed Analytics service — says what goes
on the wire. Where those two disagree with *each other*, that is not a divergence
but a Finding, and it lives in `Analytics_API_Alignment.md` §6.

**Generated from `src/contract-docs/divergences.ts` by `bun run docs`.** Do not
edit this file. `src/contract-docs/render.test.ts` fails if it drifts, so a
divergence that gets fixed cannot stay listed and one that gets introduced cannot
stay unlisted.

Distinct from the **Findings** in `Analytics_Frontend_Plan.md` §9: a Finding is a
gap in the requirements, a Divergence is a place our implementation does not match
them. Where the two are related the entry says so.

| Status | Meaning |
| --- | --- |
| Proposed extension | We are asking the FRD to grow. |
| Deliberate deviation | We think the FRD is wrong or under-specified and chose differently. |
| Temporary | Conformance deferred, with a stage that ends it. |
| Resolved | Was one of the above; no longer diverges. Kept for the record. |

## Open — 16

| # | Answers to | Clause | Divergence | Status |
| --- | --- | --- | --- | --- |
| **D1** | FRD | `FR-VZ-05, §4.2` | Mapping slots carry ten roles, not the four `MappingSlotId` names. | Proposed extension |
| **D2** | FRD | `FR-DP-03 — FR-DP-07` | `FieldSemantic` distinguishes naming a place from locating one, and latitude from longitude. | Proposed extension |
| **D3** | FRD | `FR-VZ-03` | Mapping slots are declared per Visualization Type as well as per Family. | Deliberate deviation |
| **D4** | FRD | `FR-CO-02` | A Placement is `{x, y, w, h}`, not a span and an ordinal. | Deliberate deviation |
| **D5** | FRD | `FR-VZ-05` | `Dataset.suits` promotes the Visualization Types a publisher intends. | Deliberate deviation |
| **D6** | FRD | `FR-VZ-01` | Six of the 42 Visualization Types have no renderer. | Temporary |
| **D7** | FRD | `FR-VZ-01` | `status-list` is a 43rd Visualization Type. | Proposed extension |
| **D9** | FRD | `FR-DA-12` | Aggregation happened in the browser. | Deliberate deviation |
| **D12** | FRD | `FR-DP-03` | A Field carries a `format`. | Proposed extension |
| **D13** | FRD | `FR-DA-12` | Single-value widgets still reduce records in the browser. | Deliberate deviation |
| **D14** | FRD | `FR-DA-12` | Distribution widgets bin values in the browser. | Deliberate deviation |
| **D17** | FRD | `FR-VZ-04` | A board keys `WidgetSpec` rather than the model's `Widget`. | Deliberate deviation |
| **D18** | FRD | `FR-VZ-02, §4.2` | `timeline-chart` does not satisfy its Family's Data Shape. | Deliberate deviation |
| **D19** | FRD | `FR-CO-07` | A Section carries its starting row; membership is derived, not stored. | Deliberate deviation |
| **D20** | FRD | `FR-VZ-03, §4.2` | The Status Family requires none of its mapping slots, because its Data Shape is a disjunction. | Proposed extension |
| **D31** | API | `API: schema FilterParameter` | Enumerable Filter Parameters must publish their accepted values; the API leaves it optional. | Proposed extension |

## Resolved — 13

| # | Answers to | Clause | Divergence | Status |
| --- | --- | --- | --- | --- |
| **D8** | FRD | `FR-DA-09 — FR-DA-12` | Authorization was absent; the module had no Viewer. | Resolved — Stage 5 |
| **D10** | FRD | `FR-VZ-09` | A board embedded its Widgets by value. | Resolved — Stage 6.2 |
| **D11** | FRD | `FR-CO-05 — FR-CO-08` | The module had no Controls, Containers or exposed filters. | Resolved — Stage 6 |
| **D21** | API | `API: schema Field.role` | A Field has three roles; the API has two, and time is a Field *type*. | Resolved — catalogue/api-dataset.ts - the role is reconstructed from `time_dimension_field` |
| **D22** | API | `API: GET /v1/datasets/{datasetId}/query` | A query is flat filter parameters, not a `DatasetQuery`. | Resolved — retrieval/http-retrieval.ts - filters go upstream, ordering and reduction finish locally |
| **D23** | API | `API: schema Dashboard.widgets` | A board references its Widgets by id; the API embeds them by value. | Resolved — dashboard/api-dashboard.ts - joined on the way out, split on the way in |
| **D24** | API | `API: schema FilterParameter` | A Field carries `filterable`; the API declares Filter Parameters separately. | Resolved — catalogue/api-dataset.ts - `filterable` is read from `filter_parameters` |
| **D25** | API | `API: schema DashboardScopeLevel` | Scope has three levels; the API has four, including `role`. | Resolved — dashboard/api-dashboard.ts - `role` folds into an organizational scope |
| **D26** | API | `API: schema ShareGrantTarget` | A Share Grant targets an individual or a group; the API says user or department. | Resolved — dashboard/api-dashboard.ts - `grantInputFrom` |
| **D27** | API | `API: schema Envelope` | Every response is wrapped in `{ status, message, data }`; we read bodies directly. | Resolved — widgets/WidgetCard.tsx - the note under the figure it qualifies |
| **D28** | API | `API: schema Widget.visualization_type` | Visualization Type ids may be a third vocabulary, neither ours nor the FRD's. | Resolved — the API adopted §4.2 on 15 September 2026 |
| **D29** | API | `API: schema Aggregation` | Two aggregations are spelled `minimum` and `maximum`; the API says `min` and `max`. | Resolved — catalogue/api-dataset.ts - a translation table, and an unknown name is dropped |
| **D30** | API | `API: schema Dataset` | A Dataset declares what one row represents; the API has nowhere to put it. | Resolved — `Dataset.grain`, added by the API on 15 September 2026 |

---

## Open entries in detail

### D1 — Mapping slots carry ten roles, not the four `MappingSlotId` names.

**Answers to:** FRD — `FR-VZ-05, §4.2`  
**Status:** Proposed extension  
**Findings:** Finding 14  
**Where:** `analytics/builder/requirements.ts`  

Five built Visualization Types cannot be mapped at all with four roles: a point map needs latitude and longitude, a Sankey a source and a target, a gauge a target Measure, a status widget a state Dimension, and a pivot a second Dimension for its columns. Three of those are the same shortfall Finding 1 names at Field level, one level up: even with a `state`-semantic Field declared, the Status slot table had nowhere to put it.

### D2 — `FieldSemantic` distinguishes naming a place from locating one, and latitude from longitude.

**Answers to:** FRD — `FR-DP-03 — FR-DP-07`  
**Status:** Proposed extension  
**Findings:** Finding 1, Finding 15  
**Where:** `domain/dataset.ts`  

Finding 1 recommends a single `geographic-location` descriptor. It cannot tell a Dimension holding "Kenya" from a Measure holding -1.29, and the two feed different Types — a choropleth needs the former, a point map the latter. The FRD's own Geospatial clause read `semantic === 'geographic-location' && role !== 'measure'`, which excludes precisely the Fields a point map needs, so no Dataset could ever satisfy it that way.

### D3 — Mapping slots are declared per Visualization Type as well as per Family.

**Answers to:** FRD — `FR-VZ-03`  
**Status:** Deliberate deviation  
**Where:** `analytics/builder/refinement.test.ts`  

Per Family is right for eligibility and too coarse for rendering: `line-chart` and `area-chart` share a Family and are the same mapping, `funnel` and `sankey` share one and are not. So the Family table stays the eligibility contract FR-VZ-05 evaluates and the Type table refines it. A Type may narrow a Family slot or add an optional one; it may never widen a required one, which is checked rather than trusted.

### D4 — A Placement is `{x, y, w, h}`, not a span and an ordinal.

**Answers to:** FRD — `FR-CO-02`  
**Status:** Deliberate deviation  
**Where:** `domain/composition.ts`  

"Position and size, both changeable by the Author" reads as two dimensions. A span with an ordinal gives size and *sequence* but not position — two Widgets cannot sit side by side with a gap beneath one of them. The product module had already moved to this model and proved it, so the model adopted it rather than the module reverting.

### D5 — `Dataset.suits` promotes the Visualization Types a publisher intends.

**Answers to:** FRD — `FR-VZ-05`  
**Status:** Deliberate deviation  
**Where:** `domain/dataset.ts`  

The invariant holds — nothing is excluded by it and every Type whose Family the Dataset satisfies stays on offer; it only reorders the picker. It exists because role is not meaning: any table with a Dimension and a Measure satisfies a funnel, one of them is *about* funnels, and the only party who knows which is the publisher. Inferring it from names was tried and matches "Service health" for a *stat* card.

### D6 — Six of the 42 Visualization Types have no renderer.

**Answers to:** FRD — `FR-VZ-01`  
**Status:** Temporary  
**Where:** `analytics/widgets/catalog.ts`  

Down from eight before the merge, which brought three workbench renderers across. The remaining six are `comparison-table`, `stacked-100-bar`, `violin-plot`, `heatmap-matrix`, `bar-chart-race` and `choropleth-map`. `choropleth-map` is the standing decision about bundling ~100KB of boundary geometry; the rest are ordinary work. All 13 Families are covered, and the catalogue lists what is unbuilt rather than hiding it.

### D7 — `status-list` is a 43rd Visualization Type.

**Answers to:** FRD — `FR-VZ-01`  
**Status:** Proposed extension  
**Where:** `analytics/widgets/taxonomy.test.ts`  

The Status Family's three Types are a badge, a threshold indicator and an alert banner. A list of services each carrying a state is none of them, and composing it from single indicators loses the shared axis that makes it readable. Proposed rather than dropped, and pinned by a test so a fourth addition is a decision rather than a slot appearing.

### D9 — Aggregation happened in the browser.

**Answers to:** FRD — `FR-DA-12`  
**Status:** Deliberate deviation  
**Findings:** Finding 5, Finding 19  
**Where:** `analytics/data/query.ts, analytics/widgets/Widget.tsx`  

REOPENED. Resolved at Stage 4 by moving aggregation into the query, on Finding 5's argument that a client receiving raw rows has already obtained data the Viewer may not be entitled to. That premise assumed Analytics would query on the Viewer's behalf with its own credentials. It does not: it relays the Viewer's own token and tells the Source System to "treat the request identically to direct API access by that user". Every row reaching the browser is therefore a row that Viewer could have fetched directly, and FR-DA-12 holds by a better mechanism than ours. The query has nowhere to carry an aggregation, so this stops being a thing to fix and becomes a thing to state — and the three types that send `measures` need their client-side reduction back. See Finding 19.

### D12 — A Field carries a `format`.

**Answers to:** FRD — `FR-DP-03`  
**Status:** Proposed extension  
**Where:** `domain/dataset.ts`  

How a value reads is a property of the data, not of any one picture of it: revenue is a currency in every chart that draws it. Putting it on the Widget instead asks each Author to re-declare it, which is how two Widgets over one Field end up disagreeing about whether it is money. The publisher is the only party that knows.

### D13 — Single-value widgets still reduce records in the browser.

**Answers to:** FRD — `FR-DA-12`  
**Status:** Deliberate deviation  
**Findings:** Finding 5, Finding 19  
**Where:** `analytics/widgets/Widget.tsx`  

Permanent as of the API review: the query cannot express an aggregation, so there is no server to move this to, and token relay means the rows were the Viewer's to see anyway. A delta card needs the latest value *and* the one before it, which is two aggregates over different windows of one query. `DatasetQuery` expresses one. Until it can express a comparison window, the second point is taken from the returned rows.

### D14 — Distribution widgets bin values in the browser.

**Answers to:** FRD — `FR-DA-12`  
**Status:** Deliberate deviation  
**Findings:** Finding 5, Finding 19  
**Where:** `analytics/widgets/primitives/Distribution.tsx`  

Permanent as of the API review: the query cannot express an aggregation, so there is no server to move this to, and token relay means the rows were the Viewer's to see anyway. A histogram is a reduction over every value, and bucket boundaries depend on the data — `DatasetQuery` has no bucketing clause to ask for them. Either the query model gains one or these two Types keep an explicit, bounded row budget.

### D17 — A board keys `WidgetSpec` rather than the model's `Widget`.

**Answers to:** FRD — `FR-VZ-04`  
**Status:** Deliberate deviation  
**Where:** `analytics/builder/boards.ts`  

The same record with two differences, both tracing to D1: the mapping vocabulary has ten roles rather than four, and the Type id is the module's. Adopting `Widget` would mean flattening the mapping into `FieldMapping` and losing five Types, so the board keys the shape it can actually render and the access rules take the narrow view they need.

### D18 — `timeline-chart` does not satisfy its Family's Data Shape.

**Answers to:** FRD — `FR-VZ-02, §4.2`  
**Status:** Deliberate deviation  
**Findings:** Finding 16  
**Where:** `analytics/builder/refinement.test.ts`  

The FRD classifies "Gantt / timeline chart" under Temporal Pattern, which requires a Time Dimension. A Gantt spans an *interval* — a start and an end — and the common encoding is two numeric offsets, so there is no Time Dimension in it. Both fixes are worse than the gap: narrowing the axis makes the Type satisfy nothing, and re-classifying it is the FRD's call.

### D19 — A Section carries its starting row; membership is derived, not stored.

**Answers to:** FRD — `FR-CO-07`  
**Status:** Deliberate deviation  
**Where:** `domain/composition.ts, analytics/builder/sections.ts`  

The same gap D4 closed for Placement: a Container required to organize Widgets *spatially* carried no position, so nothing said where one began. Storing `Placement.sectionId` as well would make two records of one fact, free to disagree the moment a Widget is dragged. Deriving it means dragging a Widget under a heading is how you move it there.

### D20 — The Status Family requires none of its mapping slots, because its Data Shape is a disjunction.

**Answers to:** FRD — `FR-VZ-03, §4.2`  
**Status:** Proposed extension  
**Findings:** Finding 14, Finding 17  
**Where:** `visualization/mapping-slots.ts, analytics/builder/refinement.test.ts`  

§4.2 gives Status two alternative shapes — "one Measure with a threshold, *or* one state Dimension" — and the two need different slots: a threshold indicator takes a Measure and no Dimension, a status tile takes a state Dimension. A per-Family slot table can only express a conjunction, so requiring either slot asserts something the Family does not require and makes the other route unrepresentable. Surfaced by porting the threshold route in §2: D3's refinement guard rejected both new Types, correctly. The eligibility guarantee is not lost — the disjunction is modelled properly in the Data Shape clause, which is what FR-VZ-05 evaluates — and a counterpart guard now asserts every built Type still requires at least one slot of its own, so "the Family requires nothing" cannot become "a Type may require nothing".

### D31 — Enumerable Filter Parameters must publish their accepted values; the API leaves it optional.

**Answers to:** API — `API: schema FilterParameter`  
**Status:** Proposed extension  
**Findings:** Finding 8  
**Where:** `domain/publication-contract.ts (PC-09), analytics/data/AnalyticsData.tsx`  

`allowed_values` exists on the API and is optional, so a publisher may omit it and still pass validation — at which point a Viewer is offered a filter control with nothing in it. Deriving the list from returned rows is the obvious substitute and the wrong one: the options would then change as other filters changed, and a control that narrows itself is worse than an empty one. Whether values are enumerable is the publisher's judgement and cannot be checked from here — 365 dates are not a dropdown — so PC-09 states the obligation and checks what it can, that a declared list is not empty. Narrows Finding 8 to the filters a declaration genuinely cannot enumerate.

---

## Resolved entries

### D8 — Authorization was absent; the module had no Viewer.

**Answers to:** FRD — `FR-DA-09 — FR-DA-12`  
**Status:** Resolved (Stage 5)  
**Where:** `analytics/data/adapters.ts`  

Every port call now carries a `ViewerIdentity` and authorization is resolved per Dataset per call. Resolved in shape rather than in substance: the local Viewer is authorized for everything, so the *seam* is real and the policy behind it is a fixture.

### D10 — A board embedded its Widgets by value.

**Answers to:** FRD — `FR-VZ-09`  
**Status:** Resolved (Stage 6.2)  
**Findings:** Finding 4  
**Where:** `analytics/builder/boards.ts`  

A Widget saved to a Widget Library and reused across Dashboards has identity independent of any one of them, so a board holds placements pointing at Widgets. Cheap to adopt then, an expensive migration later.

### D11 — The module had no Controls, Containers or exposed filters.

**Answers to:** FRD — `FR-CO-05 — FR-CO-08`  
**Status:** Resolved (Stage 6)  
**Where:** `analytics/builder/BoardControls.tsx, analytics/builder/sections.ts`  

Exposed filters and sorts (6.1), Controls with their reach reported (6.3) and Sections as bands (6.4) are all present. A Control still names no Widgets: correspondence is computed per Widget from its bound Dataset, so adding a Widget brings it under an existing Control.

### D21 — A Field has three roles; the API has two, and time is a Field *type*.

**Answers to:** API — `API: schema Field.role`  
**Status:** Resolved (catalogue/api-dataset.ts - the role is reconstructed from `time_dimension_field`)  
**Findings:** Finding 18  
**Where:** `domain/dataset.ts, analytics/builder/requirements.ts`  

The API's `FieldRole` is `dimension | measure`. A date is `type: 'date'`, and the Dataset names one of them in `time_dimension_field`. We followed FR-DP-06 and made Time Dimension a third role, which every slot that accepts a temporal axis then depends on. The API wins: it is shared across products and already published to integrators, and the translation is an adapter in our repo rather than a change to a contract other teams have read.

### D22 — A query is flat filter parameters, not a `DatasetQuery`.

**Answers to:** API — `API: GET /v1/datasets/{datasetId}/query`  
**Status:** Resolved (retrieval/http-retrieval.ts - filters go upstream, ordering and reduction finish locally)  
**Findings:** Finding 19  
**Where:** `analytics/data/query.ts`  

The endpoint accepts the Dataset's published Filter Parameters "and nothing else". There is no `dimensions`, no `measures`, no `sort` and no `limit`, because Analytics stores nothing and computes nothing: it forwards to the Source System and relays the answer byte-for-byte. Measured against our 37 built types, this costs less than it sounds — 25 emit an empty query already, which is exactly a bare GET. Nine emit `sort` and three emit `measures`, and those twelve are the whole of the work.

### D23 — A board references its Widgets by id; the API embeds them by value.

**Answers to:** API — `API: schema Dashboard.widgets`  
**Status:** Resolved (dashboard/api-dashboard.ts - joined on the way out, split on the way in)  
**Findings:** Finding 20  
**Where:** `analytics/builder/boards.ts`  

`Dashboard.widgets` is an array of Widgets, each with an id "assigned on save when absent". A Widget therefore has no identity independent of the Dashboard holding it. We moved the other way at Stage 6.2 on Finding 4's advice, which read FR-VZ-09's Widget Library as implying references. The API contradicts that, so this is a straight revert of one of our own decisions — and Finding 20 asks the FRD authors which of the two is intended.

### D24 — A Field carries `filterable`; the API declares Filter Parameters separately.

**Answers to:** API — `API: schema FilterParameter`  
**Status:** Resolved (catalogue/api-dataset.ts - `filterable` is read from `filter_parameters`)  
**Where:** `domain/dataset.ts`  

The API keeps two lists. `fields` describes the *response* shape — and a Field name "must match the field name the Source System returns", which is the promise that lets us render generically at all. `filter_parameters` describes the *accepted query inputs*, each with its own type, `required` flag and optional `allowed_values`. We collapsed both into a boolean on the Field, which cannot express a parameter that is not also a returned column, nor an enumerated value list. This is the one API divergence where their model is plainly richer than ours rather than merely different.

### D25 — Scope has three levels; the API has four, including `role`.

**Answers to:** API — `API: schema DashboardScopeLevel`  
**Status:** Resolved (dashboard/api-dashboard.ts - `role` folds into an organizational scope)  
**Findings:** Finding 21  
**Where:** `domain/dashboard.ts`  

The API's levels are `personal | department | role | organization`, and the reference field is `scope_organizational_ref`. We modelled three, leaving role-based Scope out because Frontend Plan §8 recorded the naming hazard around it. The API added it, and its own note says a `role` scope "currently admits only the creator and Administrators" — so the level exists and does not yet mean what it says. Finding 21 carries that.

### D26 — A Share Grant targets an individual or a group; the API says user or department.

**Answers to:** API — `API: schema ShareGrantTarget`  
**Status:** Resolved (dashboard/api-dashboard.ts - `grantInputFrom`)  
**Where:** `domain/dashboard.ts`  

Ours is `individual | group` with a `recipientLabel`; the API is `user | department` with a `target_ref`. The same idea under different names, and the rename is the whole of the fix. Worth recording only because `group` is the broader word and the API deliberately is not: a department is an IAM concept it holds a reference to, not an arbitrary set.

### D27 — Every response is wrapped in `{ status, message, data }`; we read bodies directly.

**Answers to:** API — `API: schema Envelope`  
**Status:** Resolved (widgets/WidgetCard.tsx - the note under the figure it qualifies)  
**Where:** `api/client.ts, retrieval/relayed-body.ts, analytics/widgets/WidgetCard.tsx`  

A boolean `status`, a human `message`, and the payload under `data`. One unwrap in the adapter and nothing above it needs to know — which is the argument for the adapter existing at all. Recorded because the envelope also carries the partial-result marker: a Source System may answer `200` with `meta.partial` and a reason, and a widget that ignores that shows a truncated series as if it were the whole one. Half of this is done: the client unwraps the envelope once, and `relayed-body.ts` finds the marker under either of the two readings the spec admits. It now reaches the card: a note under the figure it qualifies, shown on `ready` and on `empty`, on a bare stat tile as well as a chart, and never behind a hover - a tooltip is invisible to a touchscreen, a wall display, and a screenshot, which are three of the ways a wrong number travels. It is not a seventh render state: it qualifies an answer rather than replacing one, so the picture is still drawn.

### D28 — Visualization Type ids may be a third vocabulary, neither ours nor the FRD's.

**Answers to:** API — `API: schema Widget.visualization_type`  
**Status:** Resolved (the API adopted §4.2 on 15 September 2026)  
**Findings:** Finding 22  
**Where:** `analytics/widgets/catalog.ts, analytics/widgets/taxonomy.test.ts`  

`visualization_type` is a bare string that Analytics *validates* against the Families the bound Dataset's Data Shape satisfies, so the API is the authority for those strings. It publishes no enum: they are discovered at runtime from `/presentation`. Its examples read `family: "trend-over-time"` and `types: ["line", "area"]` where Stage 1 renamed us to the FRD's `trend`, `line-chart` and `area-chart`. Examples are not a contract and may simply be loose, so this is unconfirmed — one authenticated call settles it. If it holds, Stage 1 needs doing again, and `taxonomy.test.ts` should assert against the API rather than a local manifest.

### D29 — Two aggregations are spelled `minimum` and `maximum`; the API says `min` and `max`.

**Answers to:** API — `API: schema Aggregation`  
**Status:** Resolved (catalogue/api-dataset.ts - a translation table, and an unknown name is dropped)  
**Where:** `domain/dataset.ts, analytics/data/adapters.ts`  

Both enumerate the same six — sum, average, count, the two extremes, and a distinct count — and differ only on whether the extremes are abbreviated. Found by the type-checker while writing the reduction for D22, which is the useful part: a declared `min` would have fallen through our switch to a silent zero rather than failing, because an aggregation we do not recognise looks exactly like an empty column. Two names for one operation is also how a board ends up averaging a count, so the translation belongs in one place.

### D30 — A Dataset declares what one row represents; the API has nowhere to put it.

**Answers to:** API — `API: schema Dataset`  
**Status:** Resolved (`Dataset.grain`, added by the API on 15 September 2026)  
**Where:** `domain/dataset.ts, domain/publication-contract.ts (PC-08)`  

A declaration lists the columns and never says how many rows to expect. Two Datasets can declare identically — same Fields, same roles, same aggregations — while one returns a single summary row and the other one row per corridor per day, and those feed almost disjoint sets of Visualization Types. An Author picking for a stat card cannot tell them apart, and FR-DP-11 exists precisely so they do not have to retrieve the data to find out. Worse, `aggregations` is the only aggregation-shaped field in a declaration, so it reads like the answer and is not: it says what could meaningfully be done to a figure, never what was. PC-08 requires the grain; the API carrying it is the ask.
