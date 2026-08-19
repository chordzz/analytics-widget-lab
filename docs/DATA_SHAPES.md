# Analytics — Visualization Data Shapes

> **Generated file — do not edit.** Produced by `bun run docs` from `src/visualization/families.ts`.
> Regenerate after any change to the contract rather than editing this document.

## Purpose

What each Visualization Family requires of a Dataset in order to present it meaningfully.

**This is guidance for publishers, not a publication gate.** Nothing here is enforced when a Dataset
is published. It is here so a publisher can see what declaring a Time Dimension, or a second Measure,
would make possible — and so a Dashboard Author can understand why a given Visualization Type is not
on offer.

## How eligibility works

A Dataset is **not bound** to any Visualization Type. Any Visualization Family whose Data Shape the
Dataset satisfies may present it, and eligibility is recomputed whenever it is needed rather than
stored. Adding a Visualization Type to an existing Family therefore requires no change to any Dataset.

There are 13 Families containing 42 Visualization Types. Types within a Family share one Data
Shape — line, area, spline and step charts do not have four separate requirements, they inherit
Trend's.

Evaluation yields one of three outcomes:

| Outcome | Meaning |
|---|---|
| **Satisfied** | The Dataset meets the shape. The Family's Types are offered. |
| **Not satisfied** | The Dataset provably does not meet the shape — for example it has one Measure where two are required. Nothing is wrong with the Dataset; the Author should pick a different visualization. |
| **Cannot be determined** | The publication contract cannot express what the Family needs. The Types are withheld. This is a gap in the contract, not a defect in the Dataset — see the known gap in `PUBLICATION_CONTRACT.md`. |

## Summary

| Family | Question answered | Required Data Shape | Decidable today | Types built |
|---|---|---|---|---|
| Tabular | What are the individual records? | One or more Dimensions and/or Measures | Yes | 1 of 3 |
| Trend | How has this changed over time? | One Time Dimension + one or more Measures | Yes | 4 of 4 |
| Categorical Comparison | How do these categories compare? | One Dimension + one or more Measures | Yes | 4 of 4 |
| Composition | What are the parts of this whole? | One Dimension + one Measure summing to a meaningful total | Partly | 0 of 4 |
| Distribution | How are these values spread? | One Measure across many records | Partly | 0 of 3 |
| Correlation | Do these move together? | Two or more Measures | Yes | 2 of 3 |
| Ranking & Flow | What is the order, or where is the drop-off? | One Dimension + one Measure, or ordered stage data | Partly | 2 of 5 |
| Geospatial | Where is this happening? | One location-typed Dimension + one Measure | Partly | 0 of 2 |
| Radial | How does this compare against a target or across axes? | One or more Measures, optionally with a target | Yes | 2 of 2 |
| Single Value | What is the number right now? | One Measure, optionally one Time Dimension for trend or comparison | Yes | 4 of 4 |
| Temporal Pattern | What is the pattern across time periods or cohorts? | One Time Dimension + one Measure | Yes | 0 of 3 |
| Chronological | What happened, in order? | Time-ordered records | Yes | 2 of 2 |
| Status | Is this healthy? | One Measure with a threshold, or one state Dimension | Partly | 3 of 3 |

## Visualization Types by Family

Every Type the classification declares, and whether a renderer exists for it
today. Classification is complete — all 42 Types are registered and can be
offered by the eligibility predicate; the build status column is only about
whether something can *draw* the result yet.

| Family | Visualization Type | Renderer |
|---|---|---|
| Tabular | Data table | Built |
|  | Pivot table | Not built |
|  | Comparison table | Not built |
| Trend | Line chart | Built |
|  | Area chart | Built |
|  | Spline chart | Built |
|  | Step chart | Built |
| Categorical Comparison | Bar chart (vertical) | Built |
|  | Bar chart (horizontal) | Built |
|  | Grouped bar chart | Built |
|  | Stacked bar chart | Built |
| Composition | Pie chart | Not built |
|  | Donut chart | Not built |
|  | Stacked 100% bar | Not built |
|  | Treemap | Not built |
| Distribution | Histogram | Not built |
|  | Box plot | Not built |
|  | Violin plot | Not built |
| Correlation | Scatter plot | Built |
|  | Bubble chart | Built |
|  | Heatmap matrix | Not built |
| Ranking & Flow | Top-N / ranked list | Built |
|  | Leaderboard | Built |
|  | Funnel | Not built |
|  | Sankey | Not built |
|  | Bar chart race | Not built |
| Geospatial | Choropleth map | Not built |
|  | Point / pin map | Not built |
| Radial | Radar / spider chart | Built |
|  | Gauge / speedometer | Built |
| Single Value | Stat card | Built |
|  | Sparkline card | Built |
|  | Progress / goal tracker | Built |
|  | Delta card | Built |
| Temporal Pattern | Calendar heatmap | Not built |
|  | Cohort / retention grid | Not built |
|  | Gantt / timeline chart | Not built |
| Chronological | Activity feed / timeline | Built |
|  | Log / event viewer | Built |
| Status | Status badge / indicator | Built |
|  | Threshold indicator | Built |
|  | Alert / notification banner | Built |

### Still to build

- **Pivot table** *(Tabular)* — Not yet built. No blocker — straightforward when prioritized.
- **Comparison table** *(Tabular)* — Not yet built. No blocker — straightforward when prioritized.
- **Pie chart** *(Composition)* — The Family cannot be evaluated at all under the current publication model — additivity is undeclared (Finding 1). Building a renderer would produce something no Dataset is ever offered.
- **Donut chart** *(Composition)* — The Family cannot be evaluated at all under the current publication model — additivity is undeclared (Finding 1). Building a renderer would produce something no Dataset is ever offered.
- **Stacked 100% bar** *(Composition)* — The Family cannot be evaluated at all under the current publication model — additivity is undeclared (Finding 1). Building a renderer would produce something no Dataset is ever offered.
- **Treemap** *(Composition)* — The Family cannot be evaluated at all under the current publication model — additivity is undeclared (Finding 1). Building a renderer would produce something no Dataset is ever offered.
- **Histogram** *(Distribution)* — The Family cannot be evaluated at all — record volume is undeclared (Finding 1).
- **Box plot** *(Distribution)* — The Family cannot be evaluated at all — record volume is undeclared (Finding 1).
- **Violin plot** *(Distribution)* — The Family cannot be evaluated at all — record volume is undeclared (Finding 1).
- **Heatmap matrix** *(Correlation)* — Not yet built. No blocker — straightforward when prioritized.
- **Funnel** *(Ranking & Flow)* — Reachable only through the "ordered stage data" route, which the publication model cannot express (Finding 1).
- **Sankey** *(Ranking & Flow)* — Reachable only through the "ordered stage data" route, which the publication model cannot express (Finding 1).
- **Bar chart race** *(Ranking & Flow)* — Reachable only through the "ordered stage data" route, which the publication model cannot express (Finding 1).
- **Choropleth map** *(Geospatial)* — The Family cannot be evaluated at all — there is no location-typed Field (Finding 1). Also the only Family needing a mapping library, which is a dependency decision in its own right.
- **Point / pin map** *(Geospatial)* — The Family cannot be evaluated at all — there is no location-typed Field (Finding 1). Also the only Family needing a mapping library, which is a dependency decision in its own right.
- **Calendar heatmap** *(Temporal Pattern)* — Evaluable, but the fixture Datasets are monthly. A calendar heatmap or cohort grid needs daily-grain data to show anything meaningful.
- **Cohort / retention grid** *(Temporal Pattern)* — Evaluable, but the fixture Datasets are monthly. A calendar heatmap or cohort grid needs daily-grain data to show anything meaningful.
- **Gantt / timeline chart** *(Temporal Pattern)* — Evaluable, but the fixture Datasets are monthly. A calendar heatmap or cohort grid needs daily-grain data to show anything meaningful.

Taken together: 24 of 42 Types are built, spanning 9 of 13
Families. The order to tackle the rest in follows from the reasons above —
anything blocked on Finding 1 is waiting on a decision about the publication
model, not on frontend effort.

## Families in detail

### Tabular

*"What are the individual records?"*

**Requires:** One or more Dimensions and/or Measures

Conditions checked:

- at least one Field

Visualization Types:

- **Data table** — Sortable and filterable rows with pagination, column configuration (visibility, width, pinning), row selection and expandable rows.
- **Pivot table** — Grouped rows and columns with aggregation. *(no renderer yet — Not yet built. No blocker — straightforward when prioritized.)*
- **Comparison table** — Side-by-side entities across fixed metrics. *(no renderer yet — Not yet built. No blocker — straightforward when prioritized.)*

### Trend

*"How has this changed over time?"*

**Requires:** One Time Dimension + one or more Measures

Conditions checked:

- at least one Time Dimension
- at least one Measure

Visualization Types:

- **Line chart** — Values joined over time.
- **Area chart** — Line chart with the area beneath filled.
- **Spline chart** — Curve-smoothed line over time.
- **Step chart** — Discrete level changes over time.

### Categorical Comparison

*"How do these categories compare?"*

**Requires:** One Dimension + one or more Measures

Conditions checked:

- at least one Dimension
- at least one Measure

Visualization Types:

- **Bar chart (vertical)** — One bar per category, measured on the vertical axis.
- **Bar chart (horizontal)** — One bar per category, measured on the horizontal axis. Suits long category labels.
- **Grouped bar chart** — Several Measures shown side by side within each category.
- **Stacked bar chart** — Several Measures stacked within each category.

> A Time Dimension is a Dimension per the Definitions table, so it counts here. If this Family is meant to require a non-temporal Dimension, §4.2 should say so.

### Composition

*"What are the parts of this whole?"*

**Requires:** One Dimension + one Measure summing to a meaningful total

Conditions checked:

- at least one Dimension
- at least one Measure
- a Measure that sums to a meaningful total
  - **Cannot be determined today.** §4.2 requires a Measure "summing to a meaningful total". Additivity is a property of meaning, not of type — FR-DP-04 declares which aggregations are meaningful, but not whether the resulting total is itself meaningful as a whole.
  - Would be resolved by: proposed Field semantic 'additive-total'

Visualization Types:

- **Pie chart** — Shares of a whole as circular segments. *(no renderer yet — The Family cannot be evaluated at all under the current publication model — additivity is undeclared (Finding 1). Building a renderer would produce something no Dataset is ever offered.)*
- **Donut chart** — Pie chart with a hollow centre, often carrying the total. *(no renderer yet — The Family cannot be evaluated at all under the current publication model — additivity is undeclared (Finding 1). Building a renderer would produce something no Dataset is ever offered.)*
- **Stacked 100% bar** — Shares of a whole as proportions of a full-width bar. *(no renderer yet — The Family cannot be evaluated at all under the current publication model — additivity is undeclared (Finding 1). Building a renderer would produce something no Dataset is ever offered.)*
- **Treemap** — Shares of a whole as nested rectangles sized by value. *(no renderer yet — The Family cannot be evaluated at all under the current publication model — additivity is undeclared (Finding 1). Building a renderer would produce something no Dataset is ever offered.)*

### Distribution

*"How are these values spread?"*

**Requires:** One Measure across many records

Conditions checked:

- at least one Measure
- many records
  - **Cannot be determined today.** §4.2 requires the Measure be spread "across many records". Record volume is not part of the published model.
  - Would be resolved by: proposed Dataset descriptor 'recordVolume'

Visualization Types:

- **Histogram** — Record counts bucketed by value range. *(no renderer yet — The Family cannot be evaluated at all — record volume is undeclared (Finding 1).)*
- **Box plot** — Quartiles, median and outliers. *(no renderer yet — The Family cannot be evaluated at all — record volume is undeclared (Finding 1).)*
- **Violin plot** — Density of values across the range. *(no renderer yet — The Family cannot be evaluated at all — record volume is undeclared (Finding 1).)*

### Correlation

*"Do these move together?"*

**Requires:** Two or more Measures

Conditions checked:

- at least 2 Measures

Visualization Types:

- **Scatter plot** — One point per record against two Measures.
- **Bubble chart** — Scatter plot with a third Measure encoded as point size.
- **Heatmap matrix** — Pairwise Measure relationships encoded as colour intensity. *(no renderer yet — Not yet built. No blocker — straightforward when prioritized.)*

### Ranking & Flow

*"What is the order, or where is the drop-off?"*

**Requires:** One Dimension + one Measure, or ordered stage data

Conditions checked:

- one Dimension and one Measure, or a Dimension declared as an ordered stage
  - **Cannot be determined today.** §4.2 admits "ordered stage data" as an alternative shape. Stage ordering is not expressible in the published model, so the funnel/sankey route cannot be evaluated.
  - Would be resolved by: proposed Field semantic 'stage'

Visualization Types:

- **Top-N / ranked list** — Categories ordered by a Measure, truncated to the top N.
- **Leaderboard** — Rank, score and movement indicator against the previous period.
- **Funnel** — Drop-off across sequential stages. *(no renderer yet — Reachable only through the "ordered stage data" route, which the publication model cannot express (Finding 1).)*
- **Sankey** — Flow volume between stages or categories. *(no renderer yet — Reachable only through the "ordered stage data" route, which the publication model cannot express (Finding 1).)*
- **Bar chart race** — Ranking animated across time periods. *(no renderer yet — Reachable only through the "ordered stage data" route, which the publication model cannot express (Finding 1).)*

### Geospatial

*"Where is this happening?"*

**Requires:** One location-typed Dimension + one Measure

Conditions checked:

- at least one Measure
- a location-typed Dimension
  - **Cannot be determined today.** §4.2 requires a "location-typed Dimension". The published model has exactly three Field roles — Dimension, Measure, Time Dimension — and no notion of a location type.
  - Would be resolved by: proposed Field semantic 'geographic-location'

Visualization Types:

- **Choropleth map** — Regions shaded by a Measure. *(no renderer yet — The Family cannot be evaluated at all — there is no location-typed Field (Finding 1). Also the only Family needing a mapping library, which is a dependency decision in its own right.)*
- **Point / pin map** — Individual locations plotted as points. *(no renderer yet — The Family cannot be evaluated at all — there is no location-typed Field (Finding 1). Also the only Family needing a mapping library, which is a dependency decision in its own right.)*

### Radial

*"How does this compare against a target or across axes?"*

**Requires:** One or more Measures, optionally with a target

Conditions checked:

- at least one Measure

Visualization Types:

- **Radar / spider chart** — Several Measures on radial axes from a shared centre.
- **Gauge / speedometer** — A single Measure against a range, usually with a target.

> The target is Widget configuration, not a Dataset property, so it does not gate eligibility.

### Single Value

*"What is the number right now?"*

**Requires:** One Measure, optionally one Time Dimension for trend or comparison

Conditions checked:

- at least one Measure

Visualization Types:

- **Stat card** — Large number with a label and a trend arrow or percentage.
- **Sparkline card** — Stat card with an embedded mini line or bar chart. Needs a Time Dimension for the spark.
- **Progress / goal tracker** — Value against a target, as a bar or a ring.
- **Delta card** — Current period against the previous one. Needs a Time Dimension.

### Temporal Pattern

*"What is the pattern across time periods or cohorts?"*

**Requires:** One Time Dimension + one Measure

Conditions checked:

- at least one Time Dimension
- at least one Measure

Visualization Types:

- **Calendar heatmap** — Contribution-grid style: one cell per day, shaded by a Measure. *(no renderer yet — Evaluable, but the fixture Datasets are monthly. A calendar heatmap or cohort grid needs daily-grain data to show anything meaningful.)*
- **Cohort / retention grid** — Cohorts down, elapsed periods across. *(no renderer yet — Evaluable, but the fixture Datasets are monthly. A calendar heatmap or cohort grid needs daily-grain data to show anything meaningful.)*
- **Gantt / timeline chart** — Spans positioned and sized along a time axis. *(no renderer yet — Evaluable, but the fixture Datasets are monthly. A calendar heatmap or cohort grid needs daily-grain data to show anything meaningful.)*

### Chronological

*"What happened, in order?"*

**Requires:** Time-ordered records

Conditions checked:

- at least one Time Dimension

Visualization Types:

- **Activity feed / timeline** — Chronological events, most recent first.
- **Log / event viewer** — Raw or structured event stream.

> Interpreted as "has a Time Dimension", with no Measure required — an activity feed lists events rather than aggregating them. Confirmed by the accompanying widget breakdown, which states the shape as "one dimension + one measure (ranking), or a time-ordered event stream (feed/log)" — establishing the event stream as a shape in its own right rather than as Trend without a Measure.

### Status

*"Is this healthy?"*

**Requires:** One Measure with a threshold, or one state Dimension

Conditions checked:

- one Measure, or a Dimension declared as a state
  - **Cannot be determined today.** §4.2 admits "one state Dimension" as an alternative shape. The published model cannot distinguish a state Dimension from any other Dimension.
  - Would be resolved by: proposed Field semantic 'state'

Visualization Types:

- **Status badge / indicator** — Health, uptime or pass/fail state.
- **Threshold indicator** — Traffic-light presentation of a Measure against configured thresholds.
- **Alert / notification banner** — Prominent banner when a state warrants attention. Display only — Analytics does not alert (§10).

> The threshold is Widget configuration. Analytics displays threshold state but must not alert on it (§10).

## Worked examples

Eligibility of the fixture Datasets, computed by the same predicate the application runs.

### Peniremit settlements

Published by Peniremit · internal
Declared shape: 1 Dimension(s), 1 Time Dimension(s), 1 Measure(s)

| Family | Eligible | Reason |
|---|---|---|
| Tabular | Yes | — |
| Trend | Yes | — |
| Categorical Comparison | Yes | — |
| Composition | Cannot be determined | Needs proposed Field semantic 'additive-total' |
| Distribution | Cannot be determined | Needs proposed Dataset descriptor 'recordVolume' |
| Correlation | No | Missing: at least 2 Measures |
| Ranking & Flow | Yes | — |
| Geospatial | Cannot be determined | Needs proposed Field semantic 'geographic-location' |
| Radial | Yes | — |
| Single Value | Yes | — |
| Temporal Pattern | Yes | — |
| Chronological | Yes | — |
| Status | Yes | — |

### Payroll disbursements

Published by Payroll · confidential · exposes personal data
Declared shape: 1 Dimension(s), 1 Time Dimension(s), 2 Measure(s)

| Family | Eligible | Reason |
|---|---|---|
| Tabular | Yes | — |
| Trend | Yes | — |
| Categorical Comparison | Yes | — |
| Composition | Cannot be determined | Needs proposed Field semantic 'additive-total' |
| Distribution | Cannot be determined | Needs proposed Dataset descriptor 'recordVolume' |
| Correlation | Yes | — |
| Ranking & Flow | Yes | — |
| Geospatial | Cannot be determined | Needs proposed Field semantic 'geographic-location' |
| Radial | Yes | — |
| Single Value | Yes | — |
| Temporal Pattern | Yes | — |
| Chronological | Yes | — |
| Status | Yes | — |

### Active users

Published by IAM · internal
Declared shape: 1 Dimension(s), 1 Time Dimension(s), 1 Measure(s)

| Family | Eligible | Reason |
|---|---|---|
| Tabular | Yes | — |
| Trend | Yes | — |
| Categorical Comparison | Yes | — |
| Composition | Cannot be determined | Needs proposed Field semantic 'additive-total' |
| Distribution | Cannot be determined | Needs proposed Dataset descriptor 'recordVolume' |
| Correlation | No | Missing: at least 2 Measures |
| Ranking & Flow | Yes | — |
| Geospatial | Cannot be determined | Needs proposed Field semantic 'geographic-location' |
| Radial | Yes | — |
| Single Value | Yes | — |
| Temporal Pattern | Yes | — |
| Chronological | Yes | — |
| Status | Yes | — |

### Corridor coverage

Published by Peniremit · public
Declared shape: 2 Dimension(s), 0 Time Dimension(s), 1 Measure(s)

| Family | Eligible | Reason |
|---|---|---|
| Tabular | Yes | — |
| Trend | No | Missing: at least one Time Dimension |
| Categorical Comparison | Yes | — |
| Composition | Cannot be determined | Needs proposed Field semantic 'additive-total' |
| Distribution | Cannot be determined | Needs proposed Dataset descriptor 'recordVolume' |
| Correlation | No | Missing: at least 2 Measures |
| Ranking & Flow | Yes | — |
| Geospatial | Cannot be determined | Needs proposed Field semantic 'geographic-location' |
| Radial | Yes | — |
| Single Value | Yes | — |
| Temporal Pattern | No | Missing: at least one Time Dimension |
| Chronological | No | Missing: at least one Time Dimension |
| Status | Yes | — |

### Journal entries

Published by Accounting · confidential
Declared shape: 2 Dimension(s), 1 Time Dimension(s), 0 Measure(s)

| Family | Eligible | Reason |
|---|---|---|
| Tabular | Yes | — |
| Trend | No | Missing: at least one Measure |
| Categorical Comparison | No | Missing: at least one Measure |
| Composition | No | Missing: at least one Measure |
| Distribution | No | Missing: at least one Measure |
| Correlation | No | Missing: at least 2 Measures |
| Ranking & Flow | Cannot be determined | Needs proposed Field semantic 'stage' |
| Geospatial | No | Missing: at least one Measure |
| Radial | No | Missing: at least one Measure |
| Single Value | No | Missing: at least one Measure |
| Temporal Pattern | No | Missing: at least one Measure |
| Chronological | Yes | — |
| Status | Cannot be determined | Needs proposed Field semantic 'state' |
