# Analytics module

A self-contained analytics module. A host portal mounts one component; nothing
leaks out of this folder.

```tsx
import { AnalyticsModule } from './analytics'

<AnalyticsModule />
```

Run it standalone at `#/analytics`.

## Layers

**Primitives** (`widgets/primitives/`) draw a picture from an array and nothing
else — no card, no title, no loading state, no data fetching. Import one
anywhere in the portal: inside a widget, on a detail page, in a report.

```tsx
<TrendChart data={rows} xKey="date" series={[{ key: 'revenue' }]} variant="area" />
```

**Chrome** (`widgets/WidgetCard.tsx`) is one component providing the header,
actions menu and the loading / empty / error treatments for every widget type.
A primitive never draws any of it.

```tsx
<WidgetCard title="Revenue" subtitle="Last 12 months" state="loading" />
```

**`Widget`** (`widgets/Widget.tsx`) is the only place the two meet: it resolves a
`WidgetSpec` — type, dataset, field mapping — to a primitive inside a card.

The prop vocabulary is fixed across the set — `data`, `*Key`, `format`, `height`,
`className`, `show*` — so learning one primitive teaches you the rest. That is a
checked claim, not an aspiration: **[CONTRACT.md](./CONTRACT.md)** states the
rules and names the test that enforces each one. Read it before using a primitive
outside this module.

## Theming

Defaults follow `@SMCDAO/ui`. Three ways to change them, cheapest first:

```tsx
<AnalyticsProvider>                                    // SMCDAO defaults
<AnalyticsProvider theme={{ accent: '#…' }}>           // one role
<AnalyticsProvider theme={{ series: [...] }}>          // a different palette
```

```css
.my-portal { --a-series-1: #…; }                       /* or CSS, scoped */
```

Neutrals and status colours come from the library. The **categorical series
palette does not** — the library never had one, so these eight were selected for
the light and dark surfaces and validated for lightness band, chroma floor,
colour-vision separation and contrast. Slot 1 is SMCDAO's brand blue.

Three rules hold the set together, and each is enforced rather than trusted:

- **No component contains a colour literal.** `theme/tokens.test.ts` greps the
  module and fails on a hex, `rgb()`, or Tailwind colour class outside
  `tokens.css`.
- **Categorical slots are assigned in fixed order, never cycled.** A ninth series
  falls back to neutral rather than reusing slot 1's hue, because two different
  entities in one colour is worse than an honest "Other".
- **Status colours are reserved.** Green means healthy, never "EMEA".

## Layout note

Charts are given explicit pixel dimensions by a self-measuring `Plot`
(`primitives/shared.tsx`) rather than recharts' `ResponsiveContainer`. That
measures a percentage height against its parent and, inside a `flex: 1` box,
reads zero, renders nothing and never recovers — not on resize, not on
re-render. One `ResizeObserver` removes the whole class of bug.

Widgets respond to their **card**, not the viewport — a widget placed at three
columns is narrow on the widest monitor. See the sizing section of
[CONTRACT.md](./CONTRACT.md).

## Layout

```
analytics/
  index.tsx        public surface + a 20-line hash router (delete when the host routes)
  theme/           tokens.css, tokens.ts, AnalyticsProvider, module.css
  data/            13 mock datasets, generated from a fixed seed
  widgets/
    catalog.ts     35 widget types across 13 families, with build status
    samples.ts     one representative spec per type — the gallery and the tests share it
    layout.ts      how much room a widget type needs
    WidgetCard     chrome
    Widget         chrome + primitive, joined
    primitives/    the reusable visualisations
  builder/
    requirements   what each widget type needs from a dataset — the slot table
    boards         the board reducer, selectors and persistence
    useBoards      the store as React sees it
    useComposeIntent  one-shot "build a widget from this source" handoff
    WidgetComposer choose data → pick a widget → map fields, with a live preview
    BoardCanvas    the editable board: drag to reorder, corner grip to resize
    resize         drag-to-size arithmetic, kept pure and testable
    FieldMapper    one control per slot
  shell/           sidebar, nav, module frame
  screens/         Dashboards, Create, Drafts, Gallery, Data sources
```

## The create flow

Data first: choose a source, then pick from the widgets it can actually fill.
Nothing is greyed out, nothing is disabled with a tooltip explaining why, and
nothing fails after you commit to it — a widget your data cannot serve is simply
not in the list.

The widget-first order reads better in the abstract ("I want a funnel") but makes
the second step a puzzle: ten tables can technically feed a funnel and only one
is about funnels. Leading with the data turns that guess into a fact.

Everything a widget type requires is one table — `builder/requirements.ts`. A
**slot** is one role in the visualisation (the x axis, the measure, the target)
with the field kinds it accepts and how many fields it takes. Four things fall
out of that single declaration:

| Question | Answer |
| --- | --- |
| Which widgets are offered for a dataset? | `typesFor` — every required slot can be filled |
| Which fields does a dropdown offer? | the slot's accepted kinds |
| Is "Add to dashboard" enabled? | every required slot is filled |
| What does a freshly-picked widget show? | `autoMap` |

That last one is what makes it feel immediate rather than like filling in a form:
pick a widget and it is already drawing. The mapper is for changing your mind,
not for getting started.

Three rules exist because the obvious version is wrong:

- **Cardinality picks the grouping axis, but only in a long table.** Taking the
  first dimension puts the transactions table's `id` on a box plot's x axis and
  draws two thousand boxes. Below fifty rows the near-unique field is usually the
  label — every row of `project-timeline` *is* a task.
- **Slots compete for fields.** Checking each slot alone lets a two-measure
  dataset satisfy a bubble chart by counting the same field twice.
- **Kind is not meaning.** A slot can demand a *geographic* dimension, or the
  point map is offered regional sales — a dimension and three measures — and
  plots revenue as a latitude.

**Data sources** is a second entry point into the same flow. Each source shows
how many widget types can use it and a **Build a widget** button that opens the
composer already bound to it. The handoff is a one-shot intent in its own
context, not a field on the boards store — that store is persisted, so an intent
kept there would drag you into the composer again on every reload.

Field kinds say what a dataset *can* feed; they cannot say what it is *for*. So
datasets declare intent with `suits: ['funnel']`, which promotes those types to a
**Suggested** shelf above the full list. A hint, never an exclusion. Inferring it
from names was tried and does not hold up: it finds nothing for a Gantt, and
matches "Service health" for a *stat* card because "status" contains "stat".

## Where the design work happens

The **Widgets** screen. Every built widget rendered live, grouped by family, with
size and state switchers. Comparing two treatments takes a second there and takes
assembling a dashboard anywhere else.

## Built so far

34 of 35 widget types, across 13 of 13 families. The gallery lists what is not
built rather than hiding it — the one gap is the choropleth, which is waiting on
a decision about bundling boundary geometry.
