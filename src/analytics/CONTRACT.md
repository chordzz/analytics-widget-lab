# Component contract

What you can rely on when you use this module — as a whole, or one chart at a
time. Written for someone who did not build it.

Everything here is enforced by a test, not by convention. Where a rule has a
guard, the guard is named. If you break one, something goes red before review
does.

---

## Three ways in, in order of how much you get

```tsx
// 1. The whole module. A route, a sidebar, boards, the builder.
<AnalyticsModule />

// 2. One widget from a spec — chrome, states, field mapping, formatting.
<Widget spec={{ id: 'w1', typeId: 'line-chart', datasetId: 'revenue-daily',
                mapping: { x: 'date', series: ['revenue'] } }} />

// 3. One picture, nothing else. A chart on a detail page owes nothing to a dashboard.
<TrendChart data={rows} xKey="date" series={[{ key: 'revenue' }]} variant="area" />
```

Each is a supported entry point. Level 3 is the one most hosts reach for
second, so the primitives are a real public API rather than an implementation
detail — which is what the rest of this document is about.

---

## Two shapes, not one

There are 25 exported components, and they come in two shapes. Trying to force
them into one would mean wrapping a single number in an array so a stat tile
could take `data`.

**Data primitives** take rows and draw them. 22 of the 25.

| Prop | Type | Required | Meaning |
| --- | --- | --- | --- |
| `data` | `readonly Row[]` | yes | The rows. Never mutated, never sorted in place. |
| `*Key` | `string` | varies | Names a field in `data`. See naming, below. |
| `format` | `ValueFormat` | no | How numbers read. Defaults to `'number'`. |
| `height` | `number` | no | Fixed pixel height. Omit to fill the parent. |
| `className` | `string` | no | Applied to the root element. |
| `show*` | `boolean` | no | Optional furniture — `showLegend`, `showGrid`. |

**Tiles** take an already-computed value: `StatTile`, `GaugeTile`,
`StatusTile`. They take `label` and a `value`/`tone`, plus `format` and
`className`. They have no `data` and no `height` — a tile sizes to its content,
and a height prop would only stretch whitespace.

`Legend` is neither; it renders a series list and takes `series`.

*Enforced by `widgets/contract.test.ts`, which reads the prop interfaces as text.
A passing type-check cannot satisfy it — every inconsistency it has caught so far
was perfectly type-correct.*

---

## Naming

Guessing the prop should work. The rules:

- **A field reference is `<role>Key` and is typed `string`.** `xKey`,
  `valueKey`, `latKey`, `startKey`. If a prop names a column, it ends in `Key`;
  if it ends in `Key`, it names a column. `value` is a number, `valueKey` is a
  field name — you should not have to open the file to tell which.
- **The role is the visualisation's own word.** A Sankey takes `fromKey` and
  `toKey`, not `xKey` and `secondaryKey`. Normalising those would be consistent
  and worse: the generic name discards what the slot is actually for.
- **Booleans read as assertions.** `showLegend`, `showShading`, `sortable` —
  never `legend` or `isLegendVisible`.
- **Formatting is always the shared `ValueFormat`,** never a free string. A
  primitive with two independently-formatted axes uses `xFormat`/`yFormat`.

---

## States

The chrome owns the states; the primitive owns the picture. This is the whole
reason the two layers are separate.

| State | Who renders it |
| --- | --- |
| `ready` | The primitive draws. |
| `loading` | `WidgetCard`, as a chart-shaped skeleton so the layout does not jump. |
| `empty` | `WidgetCard`, with a message. |
| `error` | `WidgetCard`. `Widget` also uses it for a bad `typeId` or `datasetId`. |

A primitive never draws a spinner or an error, and **a primitive given no rows
renders `null`** — not an empty frame. Axes and gridlines around no data read as
a broken chart, and whatever wraps the primitive is better placed to say why it
is empty.

That last rule matters most for level-3 use, where nothing is guarding the call.
It is checked by rendering all 25 primitives with no rows and asserting that
nothing throws, nothing draws a frame, and — the one that found real bugs — that
no `NaN` or `Infinity` reaches the markup. `Math.max(...[])` is `-Infinity`,
which becomes `NaN` a line later and lands in an SVG path; React renders it
without complaint, and the chart is simply not there.

*Enforced by `widgets/render.test.tsx`.*

---

## Sizing

**Widgets are placed by column span** on a twelve-column board, so the same
component renders anywhere from a twelfth of the width to all of it.

**Size is a default until someone changes it.** `WidgetSpec.span` and
`WidgetSpec.height` are both optional; absent means "whatever this type is
worth" — `defaultSpan` from the catalogue and `heightForType` for the height. Only
deliberate choices are stored, so a board's untouched widgets keep tracking the
type as it is tuned rather than freezing the default in place the day they were
placed.

In the builder a corner grip resizes both axes at once: width snaps to whole
columns because the grid has no finer setting, height moves in 8px steps because
free-dragging to the pixel produces boards where two widgets differ by three. The
grip is a button, so the arrow keys do the same job. The arithmetic is in
`builder/resize.ts`, kept clear of the component so the boundaries can be
tested — the drag that has not moved yet, the drag past the edge of the grid, and
the board that has not been measured.

**Charts measure themselves.** Recharts' `ResponsiveContainer` reports 0×0 inside
a `flex: 1` parent and never recovers — not on resize, not on re-render. Every
primitive goes through `Plot` in `primitives/shared.tsx`, one `ResizeObserver`,
and each returns exactly one element (`VizFrame`) so a fragment cannot split the
`flex: 1` between the plot and its legend.

**Server rendering works** for the hand-rolled SVG primitives. With no layout to
measure, `Plot` falls back to a default size rather than rendering an empty box.
The recharts-backed ones still need a browser.

**Container queries, not media queries.** The card declares
`container-type: inline-size`, and the viewport tells you nothing about a widget
placed at 3 columns. Two things actually break when narrow, and both respond: the
headline number in a stat tile steps down at 220px and again at 150px, and the
legend tightens. Below 150px the card subtitle is hidden — at that width it is
two ellipsised words costing a line.

The plot also keeps a minimum height so a long legend cannot starve it. Six
series in a narrow card used to wrap to six rows and leave twelve pixels of
chart.

---

## Theming

Defaults follow `@SMCDAO/ui`. Override at whichever level suits:

```tsx
<AnalyticsProvider theme={{ accent: '#…' }}>        // one role
<AnalyticsProvider theme={{ series: [...] }}>       // a different palette
```

```css
.my-portal { --a-series-1: #…; }                    /* or plain CSS */
```

Three rules, each enforced rather than trusted:

- **No component contains a colour literal.** Every value is a token from
  `theme/tokens.css`. *Enforced by `theme/tokens.test.ts`, which greps the module
  for hex, `rgb()`, `hsl()` and Tailwind colour classes outside that one file.*
- **Categorical slots are assigned in fixed order and never cycled.** A ninth
  series falls back to neutral rather than reusing slot 1 — two different
  entities in one colour is worse than an honest "Other".
- **Status colours are reserved.** Green means healthy, never "EMEA".

Light and dark are both selected, not derived. An automatic inversion puts the
light steps on a dark ground, where several fall outside the readable lightness
band.

---

## Data

```ts
type Row = Record<string, string | number | null>

interface Field {
  key: string
  label: string
  kind: 'dimension' | 'time' | 'measure'
  format?: ValueFormat
  geo?: 'country' | 'region' | 'lat' | 'lng'
}
```

`kind` says what a field *is*; it cannot say what it is *for*. Two consequences
worth knowing before you wire your own data in:

- **`geo` is load-bearing.** Latitude is a `measure` by kind, so without the
  marker a ranked list will happily rank countries by how far north they are, and
  a point map will accept a table of regional sales and plot revenue as a
  latitude.
- **`Dataset.suits` is a hint, not a filter.** It lists the widget types a
  dataset is *meant* for, which promotes them in the builder's picker. Nothing is
  ever excluded by it.

---

## What is enforced, and where

| Rule | Guard |
| --- | --- |
| Prop shape, naming, universality | `widgets/contract.test.ts` |
| Every type renders; nothing emits `NaN`; empty means empty | `widgets/render.test.tsx` |
| No colour literals outside `tokens.css` | `theme/tokens.test.ts` |
| Slot table, dataset eligibility, automatic mapping | `builder/requirements.test.ts` |
| Board operations, reordering, persistence | `builder/boards.test.ts` |

---

## Known limits

- **Choropleth is the one unbuilt widget type** of 35. It needs boundary
  geometry — roughly 100KB of TopoJSON for a usable world atlas — which is a
  dependency decision nobody has taken. The catalogue lists it as unbuilt rather
  than hiding it, and the point map covers the geospatial family using centroids.
- **Recharts-backed primitives do not server-render.** Hand-rolled SVG ones do.
- **Persistence is `localStorage`,** under `analytics.boards.v1`. That is honest
  for a UI module with mock data, and it is one function to replace.
- **The hash router in `index.tsx` is a twenty-line shim** for running the module
  standalone. Pass `screen` and `onNavigate` and none of it runs.
