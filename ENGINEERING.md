# Engineering guide

Everything needed to pick this repository up. Written for someone who did not
build it and has an hour.

Companion documents, all still current:

| Document | What it is for |
| --- | --- |
| [`src/analytics/CONTRACT.md`](src/analytics/CONTRACT.md) | What you may rely on when consuming a widget. Every rule names the test that enforces it. |
| [`src/analytics/README.md`](src/analytics/README.md) | The product module's own tour — layers, create flow, theming. |
| [`docs/PUBLICATION_CONTRACT.md`](docs/PUBLICATION_CONTRACT.md) | **Enforceable.** What a Source System must declare. The backend validates against this. |
| [`docs/DATA_SHAPES.md`](docs/DATA_SHAPES.md) | **Guidance.** What each Visualization Family needs. Not a publication gate. |
| [`README.md`](README.md) | Phase-by-phase record of the requirements work. Historical narrative, not orientation. |
| [`../Analytics_Merge_Plan.md`](../Analytics_Merge_Plan.md) | **The plan for ending the two-application split** — sequenced stages, the divergence register, and the taxonomy reconciliation. Read it with §1 and §5 below. |

---

## 1. The one thing to know before anything else

**This repository contains two applications.** They share a build, a `package.json`
and nothing else. Nearly every wrong assumption about this codebase comes from
reading one and thinking you have read both.

| | The product module | The workbench |
| --- | --- | --- |
| **Route** | `#/analytics` | every other hash |
| **Lives in** | `src/analytics/**` | `src/{domain,visualization,retrieval,widget-runtime,renderers,catalogue,access,governance,authoring,composition,dashboard,contract-docs,ui}` |
| **What it is** | The shippable UI. Sidebar, boards, builder, 34 widget types. | A requirements-proving harness for the Analytics FRD. |
| **Data** | 13 mock datasets behind `CataloguePort` + `DatasetRetrievalPort` | 5 fixture Datasets behind an async port, with per-Dataset failure scenarios |
| **Persistence** | `localStorage`, `analytics.boards.v3` | `localStorage`, behind `DashboardStorePort` |
| **Async?** | Yes — ports, since merge Stage 5. | Yes, throughout. |
| **Authorization?** | No concept of a viewer at all. | `ViewerIdentity` on every port call; denial is a first-class render state. |
| **Design tokens** | 61 `--a-*` tokens in `src/analytics/theme/tokens.css` | 17 `--analytics-*` tokens in `src/index.css` |
| **Backend seam** | **`data/adapters.ts`** — swap the fixtures for HTTP | **Complete, and already documented for the backend** |

The switch is five lines of [`src/App.tsx`](src/App.tsx):

```tsx
if (hash.startsWith('#/analytics')) return <AnalyticsModule />
return <PortsProvider><Shell /></PortsProvider>
```

Both halves say `Dataset`, `Field`, `Dimension`, `Measure`, `Time Dimension` —
the FRD's Ubiquitous Language, used deliberately and identically. They are still
**two different types**: `src/analytics/data/types.ts` versus
`src/domain/dataset.ts`. The module's is lighter on purpose (its own header says
so) because it exists to design widgets, not to model governance.

That split is the central fact for the work ahead. **The port boundary a backend
needs already exists — in the half that is not the product.** Wiring a backend is
mostly the job of bringing it across.

---

## 2. Running it

```bash
bun install
bun dev              # http://localhost:5173  → the workbench
                     # http://localhost:5173/#/analytics → the product module
bun test             # 525 tests, 23 files
bun run typecheck    # tsc -b
bun run docs         # regenerate docs/ from the code that implements it
```

**Build needs Node 20.19+ or 22.12+.** Vite 8 declares that in `engines`, and the
machine this was developed on defaults to Node v16, where `bun run build` dies on
`node:util does not provide an export named 'styleText'`. Two working routes, both
verified:

```bash
bunx --bun vite build
```

```bash
source ~/.nvm/nvm.sh && nvm use 22.23.0 && bun run build
```

Either produces `dist/` at ~937 kB / 265 kB gzipped in one chunk. The 500 kB chunk
warning is expected and unaddressed — code-splitting a demo bundle buys nothing.

`bun test` and `bun run typecheck` are unaffected by the Node version; they run on
Bun. `oxlint` cannot be launched through `npx`/`bunx` on Node 16 either — use
`bun node_modules/oxlint/bin/oxlint`. It reports one pre-existing error, a
conditional `useMemo` at `src/analytics/widgets/primitives/PivotTable.tsx:61`.

---

## 3. The product module

`src/analytics/` — self-contained. A host mounts one component and is done:

```tsx
import { AnalyticsModule } from './analytics'
<AnalyticsModule />
```

### Three entry points, all supported

```tsx
<AnalyticsModule />                                          // 1. the whole module
<Widget spec={{ id, typeId, datasetId, mapping }} />         // 2. one widget from a spec
<TrendChart data={rows} xKey="date" series={[...]} />       // 3. one picture, nothing else
```

Level 3 is a real public API, not an implementation detail — see
[`CONTRACT.md`](src/analytics/CONTRACT.md). It is also the reason the layering
below is worth the trouble.

### Four layers, and what each one is forbidden from knowing

```
primitives/     draw a picture from an array          — knows nothing of cards, datasets, fetching
WidgetCard      chrome: header, actions, states       — knows nothing of what it wraps
Widget          spec → primitive inside a card        — the only place the two meet
GridBoard       many widgets, placed                  — knows nothing of what a widget contains
```

A primitive never draws a spinner or an error, and **given no rows it renders
`null`** rather than an empty frame. Axes around no data read as a broken chart.
That rule is what makes level-3 use safe, and it is checked by rendering all 25
primitives with no rows and asserting nothing throws, nothing draws, and no `NaN`
reaches the markup (`Math.max(...[])` is `-Infinity`, which lands in an SVG path
and renders as silently nothing).

### Directory map

```
src/analytics/
  index.tsx           public exports + a 20-line hash router (dead when the host routes)
  theme/              tokens.css (61 tokens), tokens.ts, AnalyticsProvider, module.css
  data/
    types.ts          Dataset, Field, Row, ValueFormat — the module's data shape
    generate.ts       mulberry32 seeded generators — same rows every run, deliberately
    datasets.ts       13 datasets, each sized so its family renders honestly
  widgets/
    catalog.ts        35 types across 13 families, with build status
    layout.ts         heightForType — how tall a type wants to be, in pixels
    samples.ts        one spec per built type; gallery and tests share it
    WidgetCard.tsx    chrome. states: ready | loading | empty | error
    Widget.tsx        chrome + primitive joined. renderBody is the big switch
    primitives/       25 components across 21 files
  builder/
    grid.ts           grid units. px <-> rows, clamps, firstFit, flowLayout. Pure.
    boards.ts         the reducer, selectors, persistence, the v1 -> v2 migration
    useBoards.tsx     that reducer as React context
    useComposeIntent  one-shot "build a widget from this source" handoff
    requirements.ts   the slot table — what each type needs from a dataset
    WidgetComposer    data → widget → field mapping, with a live preview
    FieldMapper       one control per slot
    GridBoard.tsx     the board, for the builder and the published view alike
  shell/              sidebar, nav model, module frame
  screens/            Dashboards, Create, Drafts, Gallery (Widgets), Data sources
```

### The spec/placement split

The single most load-bearing type decision in the module.

```ts
interface WidgetSpec  { id, typeId, datasetId, title?, subtitle?, mapping, options? }
interface PlacedWidget extends WidgetSpec, Placement {}   // + x, y, w, h
```

`WidgetSpec` **names no column and no size.** A chart on a detail page has no
board to be placed on, so requiring it to declare a position would break entry
points 2 and 3. A widget *on a board* always has a position, so there is no such
thing as a placed widget whose position has to be guessed at render time.

`PlacedWidget` lives in `builder/boards.ts`, not in `widgets/`. That direction of
dependency is the point: the board knows about specs, specs know nothing about
boards.

### The grid

`builder/grid.ts` is pure and is the only place that converts between grid units
and pixels. Twelve columns, `ROW_HEIGHT = 24`, `MARGIN = 16`, `MIN_H = 4` rows
(144px — three rows clips a stat card), `MAX_H = 18`.

**The rule that catches everyone: a row costs `ROW_HEIGHT + MARGIN_Y`, not
`ROW_HEIGHT`.** The margin sits between every row unit, not only between widgets,
so `px / ROW_HEIGHT` inflates every widget about threefold. `rowsForPx` and
`pxForRows` are exact inverses; nothing else should convert by hand.

Two placement functions, both pure and both tested:

- `firstFit` — where a newly added widget goes. Scans left to right, top to
  bottom. Appending below everything is one line shorter and always strands the
  widget under a half-empty row.
- `flowLayout` — the *old* one-dimensional board in one function: lay widths out
  left to right, wrap when full, each shelf as tall as its tallest item. Used by
  the v1 migration, because that is exactly how CSS grid was already drawing
  those boards.

### The board

`builder/GridBoard.tsx` — one component for the builder and the published view,
differing only by `editable`. Not two components: a builder that lays widgets out
differently from the published board is a builder you cannot trust, and the
cheapest way to guarantee they agree is for there to be only one.

`react-grid-layout` v2.2.4 supplies the gesture and the collision behaviour: drop
onto an occupied cell and the occupants are pushed **down**, then everything
compacts upward. Not a swap, no holes. That is Grafana's behaviour, because
Grafana is the same library.

Four things here are load-bearing:

- **The store is the only source of truth.** The layout is derived from props
  every render; nothing is mirrored in local state.
- **One gesture, one commit.** The grid reports a layout change every frame of a
  drag. Persisting those would redate the board and write to storage sixty times
  a second, so changes are swallowed while a gesture is live (`gesturing` ref)
  and committed once on release.
- **Below 900px of *container* width the board is a stack, and the stack is never
  saved.** Twelve absolute columns mean nothing on a phone. That arrangement is a
  *rendering* of the board, not a board; writing it would flatten the real one.
  Measured against the container, not the viewport — and it cannot be done in CSS
  at all, because a `grid-column` override has nothing to say about a transform.
- **Keyboard moves go through the library's own algorithm.** Arrow keys call
  `moveElement` then `verticalCompactor.compact`, so a nudge resolves collisions
  exactly the way a drag does. A second implementation would be free to disagree
  with the first.

> ⚠️ **`react-grid-layout` v2 is not v1, and almost every tutorial online
> describes v1.** v2 takes config objects (`gridConfig`, `dragConfig`,
> `resizeConfig`), uses pluggable compactors instead of `compactType`, and
> exposes a `useContainerWidth` hook. Read the installed types, not a blog post.

### The boards store

`builder/boards.ts` is a pure reducer; `builder/useBoards.tsx` is that reducer as
React context. The split is deliberate — placement and publishing are testable
without mounting anything, and a host portal with its own state management can
drive the functions directly.

Every mutating call stamps `updated` in the hook, so the reducer stays pure and
the clock is injectable.

Two subtleties worth knowing before you touch it:

- **`ensure-editing` is a reducer action, not an effect.** "Create a board if none
  is open" in a `useEffect` runs twice under React's development double-invoke,
  against the same stale state, and produces two blank drafts. Deciding it in the
  reducer makes it idempotent by construction.
- **`apply-layout` returns the *same board object* when nothing moved.** The grid
  reports a layout on mount and after every compaction; stamping `updated` for
  those would redate every board merely by opening it, and re-persist forever.

### Persistence and the migration

Two functions, `loadState` and `saveState`, at the bottom of `boards.ts`. They are
the whole persistence surface.

`analytics.boards.v3` holds `{ boards, editingId }`. `editingId` is persisted with
the boards on purpose: without it, reloading the builder finds nothing open,
starts a new board, and quietly abandons your work behind an empty draft.

Two older keys are still **read, never written**, and left in place after
migrating rather than cleared — they cost a few kilobytes and they are the only
way back. `analytics.boards.v1` is a `span`, an array order and no position.
`analytics.boards.v2` has free placement but the module's own Visualization Type
ids, before it adopted the FRD's; seven of those were renamed, and because
`typeId` is persisted, reading a v2 board without translating it turns every bar
chart into an error card. `RENAMED_TYPES` in `widgets/catalog.ts` is the map, and
`renamed()` in `boards.ts` applies it — **before** `sized()`, because the fallback
width and height are looked up by type.

Migration is not a separate code path, which is the nice part: `sized()` handles
every source with one expression, because a v1 widget is simply a v2 widget with
no position. Positions are then all-or-nothing — a board missing even one gets
flowed left to right, since a layout with a hole in it is not worth half-trusting.

**Known, deliberate divergence:** the published view does not persist mount
compaction — viewing a board must not redate it — so a freshly seeded or migrated
board *shows* compacted while it still *stores* uncompacted. Both views compact
identically, so nothing looks wrong, and it self-heals the first time the board is
opened in the builder.

### The create flow

Data first: choose a source, then pick from the widgets it can actually fill.
Nothing greyed out, nothing disabled with a tooltip — a widget your data cannot
serve is simply not in the list. Widget-first reads better in the abstract ("I
want a funnel") and makes step two a puzzle: ten tables can technically feed a
funnel and one of them is about funnels.

Everything a widget type requires is **one table**, `builder/requirements.ts`. A
*slot* is one role in the visualisation (the x axis, the measure, the target) with
the field kinds it accepts. Four answers fall out of that single declaration:

| Question | Answer |
| --- | --- |
| Which widgets are offered for a dataset? | `typesFor` — every required slot can be filled |
| Which fields does a dropdown offer? | the slot's accepted kinds |
| Is "Add to dashboard" enabled? | `isComplete` — every required slot is filled |
| What does a freshly-picked widget show? | `autoMap` |

Three rules there exist because the obvious version is wrong: cardinality picks
the grouping axis *but only in a long table* (below fifty rows the near-unique
field is usually the label); slots **compete** for fields, or a two-measure
dataset satisfies a bubble chart by counting the same field twice; and **kind is
not meaning**, so a slot can demand a *geographic* dimension or the point map
gets handed regional sales and plots revenue as a latitude.

`Dataset.suits` is the escape hatch for meaning that kinds cannot carry. A hint
that promotes types to a "Suggested" shelf — never an exclusion.

---

## 4. The workbench

`src/{domain,visualization,retrieval,…}` — ports and adapters, built to prove the
FRD is implementable before the backend exists. **Read this section even if you
only care about the product module**, because it is where the backend contract
already lives.

### One composition root

Every fake is constructed in [`src/composition-root.tsx`](src/composition-root.tsx)
and injected through context. No other module imports one, so swapping in real
adapters is a one-file change. That is the entire reason for building the frontend
first — the seam has to be real, or the ports quietly grow assumptions about the
fakes.

### The ports

| Port | File | Guarantees it exists to make |
| --- | --- | --- |
| `CataloguePort` | `catalogue/port.ts` | Discovery **without retrieval**. No method returns rows, so browsing structurally cannot pull data. Shows only Datasets the viewer may consume. |
| `DatasetRetrievalPort` | `retrieval/port.ts` | Four distinguishable outcomes; authorization resolved per Dataset, per call. |
| `DashboardStorePort` | `dashboard/store.ts` | `save` and `publish` are separate operations, so a Dashboard cannot become visible as a side effect of editing it. |
| `AuthorizationPort` | `access/port.ts` | One boundary, shared by all three above, so they cannot drift into disagreeing about who may see what. |

### Six render states, and why four is not enough

`retrieval/render-state.ts` — a pure function, its own tests, six states in and
six out. Nothing downstream may invent a seventh or merge two.

```
loading | ready | empty | denied | withdrawn | failed
```

The reasoning is worth internalising because the product module currently has
**four**, and the two missing ones are not cosmetic:

- Collapsing `denied` into `empty` teaches viewers the figure is zero.
- Collapsing `denied` into an error teaches them the system is broken.
- `withdrawn` must not present stale figures as current.
- A genuine failure is a **rejected promise**, not an outcome — the absence of an
  answer rather than one of the answers.

There is one more subtlety in the resolver: an outcome reporting `rows` that
carries none resolves to `failed`, not `empty`. That is a contract breach by the
Source System, and surfacing it beats quietly drawing a chart of nothing.

### Aggregation belongs to the query

`domain/query.ts`. A widget asks for "sum of settlement_value by corridor" and
receives grouped, aggregated rows. It never receives raw records and reduces them
itself — that would let each widget decide what "sum" means, which is the
divergent-definition failure the whole capability exists to remove, and it would
ship records a viewer may not be entitled to.

**Remember this paragraph.** §5 is largely about the fact that the product module
does exactly what it forbids.

### Generated contract documentation

`bun run docs` regenerates `docs/` from the code that implements it, and
`src/contract-docs/render.test.ts` fails if they drift — so they cannot go stale
silently. `src/domain/publication-contract.ts` is the executable form of the
enforceable half; a backend can mirror its rules directly.

---

## 5. Wiring a backend

**Most of this is done.** Merge Plan stages 1–5 were the same work, and they
landed on `merge/stage-1-taxonomy`. What follows is what the seam looks like now
and what is genuinely left.

### 5.1 Where the boundary is

```
screens / builder / widgets     specs and render states
        │
        ├─ data/AnalyticsData.tsx   provider + hooks   (useDatasets, useWidgetRows, …)
        ├─ data/query.ts            mapping → DatasetQuery
        └─ data/adapters.ts         FixtureCatalogue, FixtureRetrieval   ← replace these
                │
                └─ data/datasets.ts   the 13 fixtures
```

Nothing above `data/` imports the fixture registry, and a source scan in
`data/adapters.test.ts` fails the build if that changes. Swapping in HTTP is a new
pair of classes implementing `CataloguePort` and `DatasetRetrievalPort`, handed to
`AnalyticsDataProvider`.

### 5.2 What each stage settled

| Was | Now |
|---|---|
| `Dataset` carried `rows`; `Widget` read them in a render body | metadata and records are separate calls; `rowsFor` is behind the port |
| `kind`, no governance metadata | the FRD's `role`, plus `filterable`, `sortable`, `aggregations`, `classification`, `exposesPersonalData` |
| four render states | six — `denied` and `withdrawn` have their own treatments |
| `renderBody` reduced columns, picking sum-vs-average from the field's *format* | the Measure declares its aggregations; `queryFor` asks for one |
| `autoMap` scanned records to count distinct values | published statistics (`distinctCount`, `recordCount`) |
| `loadState` / `saveState` in a `useReducer` initialiser | an async `BoardStorePort`, with debounced writes and a real loading state |
| ids from `Math.random()`, `updated` from the browser clock | both from the store |

### 5.3 What is actually left

- **Authorization has shape but no substance.** Every port call carries a
  `ViewerIdentity` and the fixtures authorize everyone. A real
  `AuthorizationPort` is an adapter change, not a call-site change.
- **Two reductions still happen in the browser** — `status-indicator`'s severity
  sort and `Distribution`'s binning. Both are registered as D13 and D14 with the
  FRD extension each would need.
- **Boards are not `Dashboard`s.** No Scope, no Share Grants, and widgets are
  embedded rather than referenced (D10, D16). That is Merge Stage 6.
- **No Controls, Sections or exposed filters.** Also Stage 6, and the largest
  remaining body of work.

## 6. Enforced invariants

Not conventions. Each has a guard, and breaking one turns something red.

| Rule | Guard |
| --- | --- |
| Prop shape, naming, universality across 25 primitives | `widgets/contract.test.ts` |
| Every type renders; nothing emits `NaN`; empty means empty | `widgets/render.test.tsx` |
| No colour literal outside `tokens.css` | `theme/tokens.test.ts` |
| Slot table, dataset eligibility, automatic mapping | `builder/requirements.test.ts` |
| Grid conversions, placement, flow | `builder/grid.test.ts` |
| Board operations, placement, persistence, v1→v2→v3 migration | `builder/boards.test.ts` |
| Fixtures satisfy the enforceable publication contract | `data/publication.test.ts` |
| Aggregation happens in the query; figures did not move | `data/query.test.ts` |
| Four retrieval outcomes stay distinct; nothing above `data/` reaches the fixtures | `data/adapters.test.ts` |
| The six render states are distinguishable on screen | `widgets/states.test.tsx` |
| Async board store: load never erases a saved session | `builder/store.test.ts` |
| Module catalogue matches the FRD manifest | `widgets/taxonomy.test.ts` |
| The six render states | `retrieval/render-state` tests |
| Renderer props contain no callables | `widget-runtime/renderer.test.ts` |
| Generated docs match the code | `contract-docs/render.test.ts` |

`widgets/contract.test.ts` reads the prop interfaces **as text**. A passing
type-check cannot satisfy it — every inconsistency it has caught was perfectly
type-correct.

Two naming rules the tests enforce and you should just absorb: a prop naming a
column is `<role>Key` and is typed `string` (`value` is a number, `valueKey` is a
field name — you should not have to open the file to tell which); and the role is
the visualisation's own word, so a Sankey takes `fromKey`/`toKey`, never
`xKey`/`secondaryKey`.

---

## 7. Traps

Every one of these cost real time.

### Environment

- **Node 16 is the machine default and cannot build.** See §2. It also breaks
  `npx oxlint`.
- **`ResizeObserver` never fires in some embedded preview panes.** A board that
  went narrow and came back wide keeps its stale widths. Reload to re-measure;
  live reflow-on-resize is not verifiable in that environment.
- **Hash navigation does not remount the provider.** Navigating to `#/analytics`
  after seeding `localStorage` by hand does nothing, because React state persists
  and the persist effect rewrites storage from memory. Use
  `window.location.reload()`.
- **Focus does not survive a browser-automation round trip.** A `focus()` in one
  evaluated script is gone by the time a separate keypress call fires. Do
  `focus()`, dispatch, settle and read in **one** evaluation.
- **Reading `localStorage` in the same tick as a dispatch returns the previous
  value**, because the store persists in a `useEffect`. Two "failed" keyboard
  tests were only this.
- **Editing files mid-session leaves stale HMR 404s** for deleted modules, plus a
  spurious `useBoards must be used inside <BoardsProvider>`. `console.clear()`,
  reload, and restart the dev server before believing any of it.

### Code

- **A row costs `ROW_HEIGHT + MARGIN_Y`.** Dividing by `ROW_HEIGHT` inflates every
  widget threefold. Use `rowsForPx`/`pxForRows`.
- **`react-grid-layout` v2 ≠ v1.** Read the installed types.
- **Recharts' `ResponsiveContainer` reports 0×0 inside a `flex: 1` parent and
  never recovers** — not on resize, not on re-render. Everything goes through
  `Plot` in `primitives/shared.tsx`, one `ResizeObserver`, and each primitive
  returns exactly one element (`VizFrame`) so a fragment cannot split the
  `flex: 1` between the plot and its legend.
- **Container queries, not media queries.** The viewport tells you nothing about a
  widget placed at three columns.
- **`Field.geo` is load-bearing.** Latitude is a `measure` by kind, so without the
  marker a ranked list ranks countries by how far north they are.
- **Suspect a test that passes.** Two in this repo were written wrong first and
  proved nothing: a shelf-height case that also passed if only the *last* item's
  height were tracked (fixed by putting the tall widget first), and a
  `rowsForPx(pxForRows(n)) === n` round trip that rounding rescues even without
  the margin fix. `grid.test.ts:39` is the assertion that actually names the bug.

---

## 8. Known gaps

- **The shell is not responsive at phone widths** (verified at 375px). The sidebar takes the full
  width and pushes the board off screen. The *board* collapses correctly; it is
  `shell/` that does not. Pre-existing, and the first thing anyone on a phone
  will see.
- **The choropleth is the one unbuilt widget type** of 35. It needs roughly 100KB
  of TopoJSON, which is a dependency decision nobody has taken. The catalogue
  lists it as unbuilt rather than hiding it; the point map covers the geospatial
  family using centroids.
- **Recharts-backed primitives do not server-render.** The hand-rolled SVG ones
  do — `Plot` falls back to a default size when there is no layout to measure.
- **`PivotTable.tsx:61`** has a conditional `useMemo` — a real
  rules-of-hooks violation, pre-existing, not yet fixed.
- **One bundle, ~937 kB / 265 kB gzipped.** Fine for a demo, and the module is not
  lazily loaded.
- **Two token systems** (`--a-*` and `--analytics-*`) will need reconciling
  whenever the two halves merge.
