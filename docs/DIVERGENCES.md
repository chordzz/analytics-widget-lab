# Analytics — Divergence Register

Every place this implementation does not match the FRD, with the clause, the
reason, and how long it is meant to last.

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

## Open — 14

| # | Clause | Divergence | Status |
| --- | --- | --- | --- |
| **D1** | `FR-VZ-05, §4.2` | Mapping slots carry ten roles, not the four `MappingSlotId` names. | Proposed extension |
| **D2** | `FR-DP-03 — FR-DP-07` | `FieldSemantic` distinguishes naming a place from locating one, and latitude from longitude. | Proposed extension |
| **D3** | `FR-VZ-03` | Mapping slots are declared per Visualization Type as well as per Family. | Deliberate deviation |
| **D4** | `FR-CO-02` | A Placement is `{x, y, w, h}`, not a span and an ordinal. | Deliberate deviation |
| **D5** | `FR-VZ-05` | `Dataset.suits` promotes the Visualization Types a publisher intends. | Deliberate deviation |
| **D6** | `FR-VZ-01` | Six of the 42 Visualization Types have no renderer. | Temporary |
| **D7** | `FR-VZ-01` | `status-list` is a 43rd Visualization Type. | Proposed extension |
| **D12** | `FR-DP-03` | A Field carries a `format`. | Proposed extension |
| **D13** | `FR-DA-12` | Single-value widgets still reduce records in the browser. | Temporary |
| **D14** | `FR-DA-12` | Distribution widgets bin values in the browser. | Temporary |
| **D17** | `FR-VZ-04` | A board keys `WidgetSpec` rather than the model's `Widget`. | Deliberate deviation |
| **D18** | `FR-VZ-02, §4.2` | `timeline-chart` does not satisfy its Family's Data Shape. | Deliberate deviation |
| **D19** | `FR-CO-07` | A Section carries its starting row; membership is derived, not stored. | Deliberate deviation |
| **D20** | `FR-VZ-03, §4.2` | The Status Family requires none of its mapping slots, because its Data Shape is a disjunction. | Proposed extension |

## Resolved — 4

| # | Clause | Divergence | Status |
| --- | --- | --- | --- |
| **D8** | `FR-DA-09 — FR-DA-12` | Authorization was absent; the module had no Viewer. | Resolved — Stage 5 |
| **D9** | `FR-DA-12` | Aggregation happened in the browser. | Resolved — Stage 4 |
| **D10** | `FR-VZ-09` | A board embedded its Widgets by value. | Resolved — Stage 6.2 |
| **D11** | `FR-CO-05 — FR-CO-08` | The module had no Controls, Containers or exposed filters. | Resolved — Stage 6 |

---

## Open entries in detail

### D1 — Mapping slots carry ten roles, not the four `MappingSlotId` names.

**Clause:** `FR-VZ-05, §4.2`  
**Status:** Proposed extension  
**Findings:** Finding 14  
**Where:** `analytics/builder/requirements.ts`  

Five built Visualization Types cannot be mapped at all with four roles: a point map needs latitude and longitude, a Sankey a source and a target, a gauge a target Measure, a status widget a state Dimension, and a pivot a second Dimension for its columns. Three of those are the same shortfall Finding 1 names at Field level, one level up: even with a `state`-semantic Field declared, the Status slot table had nowhere to put it.

### D2 — `FieldSemantic` distinguishes naming a place from locating one, and latitude from longitude.

**Clause:** `FR-DP-03 — FR-DP-07`  
**Status:** Proposed extension  
**Findings:** Finding 1, Finding 15  
**Where:** `domain/dataset.ts`  

Finding 1 recommends a single `geographic-location` descriptor. It cannot tell a Dimension holding "Kenya" from a Measure holding -1.29, and the two feed different Types — a choropleth needs the former, a point map the latter. The FRD's own Geospatial clause read `semantic === 'geographic-location' && role !== 'measure'`, which excludes precisely the Fields a point map needs, so no Dataset could ever satisfy it that way.

### D3 — Mapping slots are declared per Visualization Type as well as per Family.

**Clause:** `FR-VZ-03`  
**Status:** Deliberate deviation  
**Where:** `analytics/builder/refinement.test.ts`  

Per Family is right for eligibility and too coarse for rendering: `line-chart` and `area-chart` share a Family and are the same mapping, `funnel` and `sankey` share one and are not. So the Family table stays the eligibility contract FR-VZ-05 evaluates and the Type table refines it. A Type may narrow a Family slot or add an optional one; it may never widen a required one, which is checked rather than trusted.

### D4 — A Placement is `{x, y, w, h}`, not a span and an ordinal.

**Clause:** `FR-CO-02`  
**Status:** Deliberate deviation  
**Where:** `domain/composition.ts`  

"Position and size, both changeable by the Author" reads as two dimensions. A span with an ordinal gives size and *sequence* but not position — two Widgets cannot sit side by side with a gap beneath one of them. The product module had already moved to this model and proved it, so the model adopted it rather than the module reverting.

### D5 — `Dataset.suits` promotes the Visualization Types a publisher intends.

**Clause:** `FR-VZ-05`  
**Status:** Deliberate deviation  
**Where:** `domain/dataset.ts`  

The invariant holds — nothing is excluded by it and every Type whose Family the Dataset satisfies stays on offer; it only reorders the picker. It exists because role is not meaning: any table with a Dimension and a Measure satisfies a funnel, one of them is *about* funnels, and the only party who knows which is the publisher. Inferring it from names was tried and matches "Service health" for a *stat* card.

### D6 — Six of the 42 Visualization Types have no renderer.

**Clause:** `FR-VZ-01`  
**Status:** Temporary  
**Where:** `analytics/widgets/catalog.ts`  

Down from eight before the merge, which brought three workbench renderers across. The remaining six are `comparison-table`, `stacked-100-bar`, `violin-plot`, `heatmap-matrix`, `bar-chart-race` and `choropleth-map`. The last is the standing decision about bundling ~100KB of boundary geometry; the other five are ordinary work. All 13 Families are covered, and the catalogue lists what is unbuilt rather than hiding it.

### D7 — `status-list` is a 43rd Visualization Type.

**Clause:** `FR-VZ-01`  
**Status:** Proposed extension  
**Where:** `analytics/widgets/taxonomy.test.ts`  

The Status Family's three Types are a badge, a threshold indicator and an alert banner. A list of services each carrying a state is none of them, and composing it from single indicators loses the shared axis that makes it readable. Proposed rather than dropped, and pinned by a test so a fourth addition is a decision rather than a slot appearing.

### D12 — A Field carries a `format`.

**Clause:** `FR-DP-03`  
**Status:** Proposed extension  
**Where:** `domain/dataset.ts`  

How a value reads is a property of the data, not of any one picture of it: revenue is a currency in every chart that draws it. Putting it on the Widget instead asks each Author to re-declare it, which is how two Widgets over one Field end up disagreeing about whether it is money. The publisher is the only party that knows.

### D13 — Single-value widgets still reduce records in the browser.

**Clause:** `FR-DA-12`  
**Status:** Temporary  
**Findings:** Finding 5  
**Where:** `analytics/widgets/Widget.tsx`  

A delta card needs the latest value *and* the one before it, which is two aggregates over different windows of one query. `DatasetQuery` expresses one. Until it can express a comparison window, the second point is taken from the returned rows.

### D14 — Distribution widgets bin values in the browser.

**Clause:** `FR-DA-12`  
**Status:** Temporary  
**Findings:** Finding 5  
**Where:** `analytics/widgets/primitives/Distribution.tsx`  

A histogram is a reduction over every value, and bucket boundaries depend on the data — `DatasetQuery` has no bucketing clause to ask for them. Either the query model gains one or these two Types keep an explicit, bounded row budget.

### D17 — A board keys `WidgetSpec` rather than the model's `Widget`.

**Clause:** `FR-VZ-04`  
**Status:** Deliberate deviation  
**Where:** `analytics/builder/boards.ts`  

The same record with two differences, both tracing to D1: the mapping vocabulary has ten roles rather than four, and the Type id is the module's. Adopting `Widget` would mean flattening the mapping into `FieldMapping` and losing five Types, so the board keys the shape it can actually render and the access rules take the narrow view they need.

### D18 — `timeline-chart` does not satisfy its Family's Data Shape.

**Clause:** `FR-VZ-02, §4.2`  
**Status:** Deliberate deviation  
**Findings:** Finding 16  
**Where:** `analytics/builder/refinement.test.ts`  

The FRD classifies "Gantt / timeline chart" under Temporal Pattern, which requires a Time Dimension. A Gantt spans an *interval* — a start and an end — and the common encoding is two numeric offsets, so there is no Time Dimension in it. Both fixes are worse than the gap: narrowing the axis makes the Type satisfy nothing, and re-classifying it is the FRD's call.

### D19 — A Section carries its starting row; membership is derived, not stored.

**Clause:** `FR-CO-07`  
**Status:** Deliberate deviation  
**Where:** `domain/composition.ts, analytics/builder/sections.ts`  

The same gap D4 closed for Placement: a Container required to organize Widgets *spatially* carried no position, so nothing said where one began. Storing `Placement.sectionId` as well would make two records of one fact, free to disagree the moment a Widget is dragged. Deriving it means dragging a Widget under a heading is how you move it there.

### D20 — The Status Family requires none of its mapping slots, because its Data Shape is a disjunction.

**Clause:** `FR-VZ-03, §4.2`  
**Status:** Proposed extension  
**Findings:** Finding 14, Finding 17  
**Where:** `visualization/mapping-slots.ts, analytics/builder/refinement.test.ts`  

§4.2 gives Status two alternative shapes — "one Measure with a threshold, *or* one state Dimension" — and the two need different slots: a threshold indicator takes a Measure and no Dimension, a status tile takes a state Dimension. A per-Family slot table can only express a conjunction, so requiring either slot asserts something the Family does not require and makes the other route unrepresentable. Surfaced by porting the threshold route in §2: D3's refinement guard rejected both new Types, correctly. The eligibility guarantee is not lost — the disjunction is modelled properly in the Data Shape clause, which is what FR-VZ-05 evaluates — and a counterpart guard now asserts every built Type still requires at least one slot of its own, so "the Family requires nothing" cannot become "a Type may require nothing".

---

## Resolved entries

### D8 — Authorization was absent; the module had no Viewer.

**Clause:** `FR-DA-09 — FR-DA-12`  
**Status:** Resolved (Stage 5)  
**Where:** `analytics/data/adapters.ts`  

Every port call now carries a `ViewerIdentity` and authorization is resolved per Dataset per call. Resolved in shape rather than in substance: the local Viewer is authorized for everything, so the *seam* is real and the policy behind it is a fixture.

### D9 — Aggregation happened in the browser.

**Clause:** `FR-DA-12`  
**Status:** Resolved (Stage 4)  
**Findings:** Finding 5  
**Where:** `analytics/data/query.ts`  

A client that receives raw rows and aggregates them has already obtained data the Viewer may not be entitled to, so the guarantee is unenforceable. Measures now carry their aggregation in the query and the roll-up comes from what the Dataset declared meaningful. Two reductions remain and are recorded separately as D13 and D14.

### D10 — A board embedded its Widgets by value.

**Clause:** `FR-VZ-09`  
**Status:** Resolved (Stage 6.2)  
**Findings:** Finding 4  
**Where:** `analytics/builder/boards.ts`  

A Widget saved to a Widget Library and reused across Dashboards has identity independent of any one of them, so a board holds placements pointing at Widgets. Cheap to adopt then, an expensive migration later.

### D11 — The module had no Controls, Containers or exposed filters.

**Clause:** `FR-CO-05 — FR-CO-08`  
**Status:** Resolved (Stage 6)  
**Where:** `analytics/builder/BoardControls.tsx, analytics/builder/sections.ts`  

Exposed filters and sorts (6.1), Controls with their reach reported (6.3) and Sections as bands (6.4) are all present. A Control still names no Widgets: correspondence is computed per Widget from its bound Dataset, so adding a Widget brings it under an existing Control.
