# Analytics — Widget Data Contract

> **Generated file — do not edit.** Produced by `bun run docs` from `src/contract-docs/render.ts`.
> Regenerate after any change to the contract rather than editing this document.

For the team building the Source Systems. It answers one question per widget:
**what will the frontend ask you for, and what shape must the answer be?**

Every row is read out of the code that builds the query — the same `queryFor`
the running application calls — so nothing here is an intention.

Read [`PUBLICATION_CONTRACT.md`](PUBLICATION_CONTRACT.md) first for what a
Dataset must *declare*. This document is about what gets *asked* afterwards.

---

## 1. The request

One shape, for every widget:

```ts
interface DatasetQuery {
  /** Group by these Dimensions. Omitted or empty means a single aggregate row. */
  dimensions?: string[]
  measures?: { field: string; aggregation: Aggregation }[]
  timeRange?: { field: string; from?: string; to?: string; granularity?: TimeGranularity }
  /** Keyed by Field key. Only Fields the Dataset declared `filterable`. */
  filters?: Record<string, string | number>
  sort?: { field: string; direction: 'ascending' | 'descending' }[]
  limit?: number
}

type Aggregation = 'sum' | 'average' | 'count' | 'minimum' | 'maximum' | 'distinct-count'
type TimeGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year'
```

**Aggregation is asked for, never applied afterwards.** A widget requests
"sum of revenue by region" and expects grouped, aggregated rows. It must not
receive raw records and reduce them, for two reasons: it would let each widget
decide what "sum" means, and it would ship records a Viewer may not be entitled
to see.

An `aggregation` we send is always one the Dataset declared for that Measure.
If we ask for something undeclared, that is our bug — reject it.

---

## 2. The response

Four outcomes, and they must be distinguishable. This is the single easiest part
of the contract to get wrong, because nothing in the requirements says it about
the API — only about the display.

```ts
type RetrievalOutcome =
  | { kind: 'rows'; rows: DatasetRow[]; totalCount: number }
  | { kind: 'empty' }      // authorized, and the Dataset has nothing to say
  | { kind: 'denied' }     // not authorized for this Dataset
  | { kind: 'withdrawn' }  // the Dataset is gone

type DatasetRow = Record<string, string | number | null>
```

A response of `[]` cannot carry this: empty, denied and withdrawn all look
identical, and the frontend would have to guess. It renders each of the four
differently — a denial says access was denied rather than showing zero, because
showing zero teaches a Viewer the figure *is* zero.

**A genuine failure is an error, not an outcome** — the absence of an answer
rather than one of the answers.

`kind: 'rows'` with an empty `rows` array is treated as a **contract breach**
and surfaced as a failure, not as `empty`. Send `{ kind: 'empty' }`.

---

## 3. What a row must look like

Your integration guide says the relayed body's *"shape must match frontend
visualization requirements"* and then, reasonably, does not say what those are.
This section is that half of the sentence.

**Field names are yours, not ours.** This is the first thing to settle, because
it is the thing teams most often expect us to dictate. We never need a field
called `value`. Every visualisation takes its field references as
configuration — a bar chart is handed `valueKey: 'settlement_value'`, and the
name is bound once when an Author builds the Widget. So `val`, `value`,
`total_amount` and `settlement_value` are all equally fine, and asking you to
rename one would break every existing binding for no gain. What we need is that
a declared name **matches the key you return** — which your guide already
requires.

What we do need is below. Each is an invariant rather than a preference, and
each names the failure it avoids, because every one of these fails *silently*.

### Values carry their declared type

A Field declared `number` must arrive as a JSON number.

```json
{ "region": "EMEA", "revenue": 1234.5 }     // yes
{ "region": "EMEA", "revenue": "1,234.50" } // no
```

A formatted string becomes `NaN` the moment we coerce it, and `NaN` in an SVG
path renders as **nothing at all** — no error, no warning, an empty chart that
looks like missing data. Our own test suite cannot catch this, because it tests
our fixtures and those are well-formed by construction. Same for `boolean`:
`true`, not `"true"` and not `1`.

### Dates are ISO-8601, and one grain per Dataset

`2026-08-07` for a day, `2026-08` for a month, `2026` for a year. Not
`07/08/2026`, not a locale string, not epoch milliseconds.

Date filtering compares these as strings, which is exact and fast for ISO-8601
and wrong for everything else. `07/08/2026` would not throw — it would return
the wrong rows, quietly, which is worse. Mixing grains inside one Dataset breaks
the same comparison.

### Absent means `null`, not a missing key and not `""`

```json
{ "region": "EMEA", "revenue": null }  // yes — no value
{ "region": "EMEA" }                   // no  — key omitted
{ "region": "EMEA", "revenue": "" }    // no  — empty string
```

An omitted key and an explicit `null` take different paths through several
visualisations, and `""` coerces to `0` in a Measure — which draws a bar of
height zero where there should be a gap. A zero and a nothing are different
claims about the world.

### One row grain, and say what it is

A row should mean one thing for the whole Dataset: one row per day, or per
region, or per transaction. Section 5 lists the volume each widget can usefully
draw — a calendar heatmap wants about 365 rows, a stat card wants one — and that
is guidance, not a limit for you to enforce.

The thing to avoid is a Dataset whose grain shifts with its filters, because a
widget bound to it is correct on one query and meaningless on the next.

### Order, or tell us there is none

Nine of the 42 widget types need rows in order — every
trend, the chronological pair, and the temporal ones. A line chart drawn from
unordered rows is not untidy, it is wrong: the line doubles back on itself.

Since the query carries no `sort`, we need one of two answers per Dataset.
Either the endpoint returns a stable order and says so, or it does not and we
sort in the browser. Both are workable; not knowing which is not.

### A `location` Field should say which kind it is

`FieldType: 'location'` covers two different things, and they feed different
visualisations. A region name (`"Kenya"`) shades a choropleth; a coordinate
(`-1.29`) places a point on a map, and a point needs *two* Fields that know
which of them is latitude. Today nothing distinguishes them, so a point map can
be offered a table of regional sales and plot revenue as a latitude. We have
raised this upstream; until it is settled, please say in the Field's
`description` which one you mean.

---

## 4. Aggregation grain — the thing to settle with us

Of the 42 built widget types, **3 currently send an aggregated
query and 39 ask for records.**

That is not a recommendation, it is a report — and it needs a conversation
before it meets a real database.

The reason is our fixtures: most are already stored at the grain the chart draws.
`sales-by-region` is one row per region, so a bar chart over it asks for records
and gets exactly the six bars it wants. Against a raw table the same widget would
pull every transaction and group in the browser, which is both slow and the thing
§2 of the publication contract forbids.

**What this means for you:**

- The 3 single-aggregate types are correct as they stand and safe against any volume.
- For the rest, tell us where your data's grain sits. If a Dataset is already
  aggregated to the grain we draw, records are fine and the `rows` count in
  §5 is what to expect. If it is raw, we need to send `dimensions` +
  `measures` and we will fix the query — the mapping already carries the
  information, so it is our change, not yours.
- The row counts in §5 are what our *fixtures* return. Treat them as the volume
  a widget can usefully draw, not as a limit you should enforce: a calendar
  heatmap wants 365 points and a stat card wants 1.

This is tracked on our side as divergences **D13** and **D14** in
[`DIVERGENCES.md`](DIVERGENCES.md).

---

## 5. Every widget, and what it asks for

`needs` is what a Dataset must offer for the widget to be *offered* at all —
the Field roles, and how many of each. A widget whose required slots cannot be
filled is never shown to an Author, so a Dataset missing a Time Dimension simply
does not produce trend charts.

### Single value — `single-value`

| Type | Needs | Request today | Grain | Fixture rows |
|---|---|---|---|---|
| `stat-card`<br>Stat card | **Measure** — 1 × Measure<br>**Change** — up to 1 × Measure | `sum(revenue)` | single aggregate | 1 |
| `sparkline-card`<br>Sparkline card | **Measure** — 1 × Measure<br>**Period** — 1 × Time Dimension | order by `date` ↑ | records | 365 |
| `delta-card`<br>Delta card | **Measure** — 1 × Measure<br>**Period** — 1 × Time Dimension | order by `month` ↑ | records | 24 |
| `progress-tracker`<br>Progress tracker | **Actual** — 1 × Measure<br>**Target** — 1 × Measure | order by `month` ↑ | records | 24 |

### Trend — `trend`

| Type | Needs | Request today | Grain | Fixture rows |
|---|---|---|---|---|
| `line-chart`<br>Line chart | **Time axis** — 1 × Time Dimension<br>**Measures** — 1–5 × Measure | order by `month` ↑ | records | 24 |
| `area-chart`<br>Area chart | **Time axis** — 1 × Time Dimension<br>**Measures** — 1–5 × Measure | order by `date` ↑ | records | 365 |
| `spline-chart`<br>Spline chart | **Time axis** — 1 × Time Dimension<br>**Measures** — 1–5 × Measure | order by `month` ↑ | records | 24 |
| `step-chart`<br>Step chart | **Time axis** — 1 × Time Dimension<br>**Measures** — 1–5 × Measure | order by `month` ↑ | records | 24 |

### Categorical comparison — `categorical-comparison`

| Type | Needs | Request today | Grain | Fixture rows |
|---|---|---|---|---|
| `bar-chart-vertical`<br>Bar chart | **Categories** — 1 × Dimension or Time Dimension<br>**Measures** — 1–4 × Measure | no aggregation — all records | records | 6 |
| `bar-chart-horizontal`<br>Horizontal bar | **Categories** — 1 × Dimension or Time Dimension<br>**Measures** — 1–4 × Measure | no aggregation — all records | records | 12 |
| `grouped-bar-chart`<br>Grouped bar | **Categories** — 1 × Dimension or Time Dimension<br>**Measures** — 2–4 × Measure | no aggregation — all records | records | 6 |
| `stacked-bar-chart`<br>Stacked bar | **Categories** — 1 × Dimension or Time Dimension<br>**Measures** — 2–4 × Measure | no aggregation — all records | records | 6 |

### Composition — `composition`

| Type | Needs | Request today | Grain | Fixture rows |
|---|---|---|---|---|
| `pie-chart`<br>Pie chart | **Segments** — 1 × Dimension<br>**Measure** — 1 × Measure | no aggregation — all records | records | 6 |
| `donut-chart`<br>Donut chart | **Segments** — 1 × Dimension<br>**Measure** — 1 × Measure | no aggregation — all records | records | 6 |
| `treemap`<br>Treemap | **Rectangles** — 1 × Dimension<br>**Measure** — 1 × Measure | no aggregation — all records | records | 12 |
| `stacked-100-bar`<br>Stacked 100% bar | **Categories** — 1 × Dimension or Time Dimension<br>**Measures** — 2–5 × Measure | no aggregation — all records | records | 6 |

### Ranking & flow — `ranking-and-flow`

| Type | Needs | Request today | Grain | Fixture rows |
|---|---|---|---|---|
| `ranked-list`<br>Ranked list | **Entries** — 1 × Dimension<br>**Measure** — 1 × Measure | no aggregation — all records | records | 20 |
| `leaderboard`<br>Leaderboard | **Entries** — 1 × Dimension<br>**Measure** — 1 × Measure | no aggregation — all records | records | 12 |
| `funnel`<br>Funnel | **Stages** — 1 × Dimension<br>**Measure** — 1 × Measure | no aggregation — all records | records | 6 |
| `sankey`<br>Sankey | **From** — 1 × Dimension<br>**To** — 1 × Dimension<br>**Volume** — 1 × Measure | no aggregation — all records | records | 10 |
| `bar-chart-race`<br>Bar chart race | **Period** — 1 × Time Dimension<br>**Racers** — 1 × Dimension<br>**Measure** — 1 × Measure | no aggregation — all records | records | 72 |

### Status — `status`

| Type | Needs | Request today | Grain | Fixture rows |
|---|---|---|---|---|
| `status-list`<br>Status list | **Entities** — 1 × Dimension<br>**State** — 1 × Dimension<br>**Measure** — up to 1 × Measure | no aggregation — all records | records | 9 |
| `status-indicator`<br>Status tile | **Entities** — 1 × Dimension<br>**State** — 1 × Dimension | no aggregation — all records | records | 9 |
| `threshold-indicator`<br>Threshold indicator | **Measure** — 1 × Measure | `average(uptime)` | single aggregate | 1 |
| `alert-banner`<br>Alert banner | **Measure** — 1 × Measure | `average(errorRate)` | single aggregate | 1 |

### Radial — `radial`

| Type | Needs | Request today | Grain | Fixture rows |
|---|---|---|---|---|
| `gauge`<br>Gauge | **Actual** — 1 × Measure<br>**Target** — 1 × Measure | order by `month` ↑ | records | 24 |
| `radar-chart`<br>Radar chart | **Entities** — 1 × Dimension<br>**Measures** — 3–8 × Measure | no aggregation — all records | records | 12 |

### Tabular — `tabular`

| Type | Needs | Request today | Grain | Fixture rows |
|---|---|---|---|---|
| `data-table`<br>Data table | **Columns** — 1–12 × Dimension or Time Dimension or Measure | no aggregation — all records | records | 120 |
| `pivot-table`<br>Pivot table | **Rows** — 1 × Dimension<br>**Columns** — 1 × Dimension<br>**Measure** — up to 1 × Measure | no aggregation — all records | records | 120 |
| `comparison-table`<br>Comparison table | **Entities** — 1 × Dimension<br>**Metrics** — 2–8 × Measure | no aggregation — all records | records | 12 |

### Distribution — `distribution`

| Type | Needs | Request today | Grain | Fixture rows |
|---|---|---|---|---|
| `histogram`<br>Histogram | **Measure** — 1 × Measure | no aggregation — all records | records | 2000 |
| `box-plot`<br>Box plot | **Groups** — 1 × Dimension<br>**Measure** — 1 × Measure | no aggregation — all records | records | 2000 |
| `violin-plot`<br>Violin plot | **Groups** — 1 × Dimension<br>**Measure** — 1 × Measure | no aggregation — all records | records | 2000 |

### Correlation — `correlation`

| Type | Needs | Request today | Grain | Fixture rows |
|---|---|---|---|---|
| `scatter-plot`<br>Scatter plot | **Measures** — 2 × Measure | no aggregation — all records | records | 12 |
| `bubble-chart`<br>Bubble chart | **Measures** — 3 × Measure | no aggregation — all records | records | 12 |
| `heatmap-matrix`<br>Heatmap matrix | **Measures** — 3–8 × Measure | no aggregation — all records | records | 12 |

### Temporal pattern — `temporal-pattern`

| Type | Needs | Request today | Grain | Fixture rows |
|---|---|---|---|---|
| `calendar-heatmap`<br>Calendar heatmap | **Date** — 1 × Time Dimension<br>**Measure** — 1 × Measure | order by `date` ↑ | records | 365 |
| `cohort-grid`<br>Cohort grid | **Cohorts** — 1 × Time Dimension<br>**Elapsed period** — 1 × Dimension or Time Dimension<br>**Measure** — 1 × Measure | no aggregation — all records | records | 78 |
| `timeline-chart`<br>Gantt chart | **Rows** — 1 × Dimension<br>**Start and end** — 2 × Measure<br>**Grouping** — up to 1 × Dimension<br>**Progress** — up to 1 × Measure | no aggregation — all records | records | 9 |

### Chronological — `chronological`

| Type | Needs | Request today | Grain | Fixture rows |
|---|---|---|---|---|
| `activity-feed`<br>Activity feed | **When** — 1 × Time Dimension<br>**Actor** — 1 × Dimension<br>**Action** — 1 × Dimension | no aggregation — all records | records | 60 |
| `event-log-view`<br>Event log | **When** — 1 × Time Dimension<br>**Columns** — 1–8 × Dimension or Time Dimension or Measure | no aggregation — all records | records | 60 |

### Geospatial — `geospatial`

| Type | Needs | Request today | Grain | Fixture rows |
|---|---|---|---|---|
| `point-map`<br>Point map | **Place** — 1 × Dimension, geographic<br>**Latitude** — 1 × Measure, geographic<br>**Longitude** — 1 × Measure, geographic<br>**Measure** — 1 × Measure | no aggregation — all records | records | 20 |

---

## 6. Field roles, for reference

Three roles, and the distinction is load-bearing rather than cosmetic:

| Role | What it is | Notes |
|---|---|---|
| `dimension` | Identifies or categorizes a record | |
| `time-dimension` | A Dimension whose values are points in time | Counts as a Dimension wherever one is required |
| `measure` | Can be meaningfully aggregated | Must declare which `aggregations` are meaningful |

Two things a Dataset declares that change what we can offer:

- **`filterable` gates every filter.** A Viewer-facing filter or a Dashboard
  Control can only act on a Field you marked filterable. We enforce this twice —
  the picker will not offer it, and the query builder drops it — so an unmarked
  Field is unreachable by design.
- **`semantic` unlocks four Families.** Role says what a Field *is* and cannot
  say what it is *for*. A point map needs to know which Measure is a latitude;
  without it, a ranked list will happily rank countries by how far north they
  are. See `PUBLICATION_CONTRACT.md` for the values.

---

## 7. What we will not ask you for

- **Writes.** Every widget is read-only, enforced by the props carrying no
  callback — there is nothing a widget *could* call to mutate.
- **Joins.** A widget draws from exactly one Dataset. If two Datasets need
  relating, that is a Dataset the Source System publishes, not a query we send.
- **Formatting.** Send numbers as numbers. `format` on a Field tells us how to
  render them.
- **Anything a Viewer may not see.** Authorization is resolved per Dataset per
  call, on your side. We ask; we do not carry a rule about who may read what.
