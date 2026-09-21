/**
 * Renders the Analytics contract documentation from the code that implements
 * it. Kept pure — returns strings, writes nothing — so a test can assert the
 * committed documents still match the source. `scripts/generate-contract-docs.ts`
 * does the writing.
 */

import {
  openDivergences,
  resolvedDivergences,
  type Divergence,
  type DivergenceStatus,
} from './divergences'
import {
  AGGREGATIONS,
  CLASSIFICATIONS,
  FIELD_ROLES,
  publicationRules,
  validatePublication,
} from '../domain/publication-contract'
import { visualizationFamilies } from '../visualization/families'
import { typesInFamily, visualizationTypes } from '../visualization/visualization-types'
import { evaluateFamilies } from '../visualization/registry'
import { catalogueFixtures } from '../catalogue/fixtures'
import { FAMILIES, WIDGET_TYPES } from '../analytics/widgets/catalog'
import { SAMPLES } from '../analytics/widgets/samples'
import { slotsFor } from '../analytics/builder/requirements'
import { queryFor, rowsForWidget } from '../analytics/data/query'
import { requireDataset } from '../analytics/data/datasets'
import type { DatasetQuery } from '../domain/query'
import type { Satisfaction } from '../visualization/data-shape'

/*
 * Build status comes from the product module's catalogue.
 *
 * It used to come from the workbench's renderer registry, whose virtue was that
 * registration is explicit — the documentation could not claim something was
 * built that wasn't. Merge §2 deletes that registry, and `WidgetType.built` is a
 * hand-set boolean, so the guarantee moved rather than disappearing:
 * `analytics/widgets/built.test.ts` scans `Widget.tsx` and fails if a type
 * flagged built has no branch in the render switch, or an unbuilt one does.
 *
 * The module catalogue is the right source now for a simpler reason too — it is
 * what the product actually offers, and `widgets/taxonomy.test.ts` ties its ids
 * to this manifest in both directions.
 */
const BUILT = new Set(WIDGET_TYPES.filter((type) => type.built).map((type) => type.id))
const isBuilt = (typeId: string) => BUILT.has(typeId)

/**
 * Why a Type is not built yet.
 *
 * Editorial rather than derivable, so it is stated here — but a test asserts
 * every unbuilt Type has one, so the list cannot rot silently as Types are
 * added.
 *
 * **These were per Family and wrong after merge §2.** They said things like
 * "Composition cannot be evaluated at all — additivity is undeclared (Finding
 * 1)", which was true of the *workbench fixtures* and is not true of the
 * product module's datasets: those declare the proposed semantics, so all five
 * of Finding 1's Families resolve. Keeping the old reasons would have told a
 * reader that six Types were blocked on a publication-model decision when in
 * fact five were ordinary work.
 *
 * **Those five are now built**, and their entries are deleted rather than left
 * in place. A reason for a Type that draws is not merely unused — it is a
 * standing claim that work is outstanding, in the document we hand publishers
 * to explain what they cannot have. One of them was also wrong about its own
 * subject: `heatmap-matrix` was described as "two Dimensions and a Measure on a
 * colour scale", which is the cohort grid. §4.2 calls it pairwise *Measure*
 * relationships, and that is what was built.
 *
 * What remains is one Type, and it is the only one here whose reason was never
 * an effort estimate.
 */
const UNBUILT_REASON: Record<string, string> = {
  'choropleth-map':
    'Boundary geometry — roughly 100KB of TopoJSON for a usable world atlas, which every host would pay for whether or not it draws maps. A standing dependency decision nobody has taken; the point map covers the Family using centroids in the meantime.',
}

function unbuiltReason(typeId: string, _familyId: string): string {
  return (
    UNBUILT_REASON[typeId] ??
    'Not yet built, and no reason recorded — which is itself the finding. Add one here.'
  )
}

export const rendererCoverage = () => {
  const familiesBuilt = new Set(
    visualizationTypes.filter((t) => isBuilt(t.id)).map((t) => t.familyId),
  )
  return {
    typesBuilt: visualizationTypes.filter((t) => isBuilt(t.id)).length,
    typesTotal: visualizationTypes.length,
    familiesBuilt: familiesBuilt.size,
    familiesTotal: visualizationFamilies.length,
    familiesBuiltIds: familiesBuilt,
  }
}

const GENERATED = (source: string) =>
  `> **Generated file — do not edit.** Produced by \`bun run docs\` from \`${source}\`.\n> ` +
  `Regenerate after any change to the contract rather than editing this document.\n`

// Families whose Data Shape cannot be evaluated against the published model.
const undecidableClauses = visualizationFamilies.flatMap((family) =>
  family.dataShape.clauses
    .filter((clause) => clause.undecidable)
    .map((clause) => ({ family, clause: clause.undecidable! })),
)

// -- 1. Publication contract -------------------------------------------------

const rejectionExample = validatePublication({
  name: 'Settlements',
  fields: [{ key: 'amount', label: 'Amount', role: 'measure' }],
})

export const renderPublicationContract = (): string => `# Analytics — Publication Contract

${GENERATED('src/domain/publication-contract.ts')}
## Purpose

What a Source System must declare for a Dataset to be accepted into the Catalogue and become
consumable. This is the **enforceable** half of the Analytics contract; the backend validates
against it at publication time (FR-GV-04).

## Conformity direction

Source Systems conform to the Analytics publication model. Analytics defines the shape; publishers
meet it. This is deliberate: the alternative — Analytics translating each publisher's native shape —
reinstates the N×M integration problem the capability exists to remove.

## What this contract does *not* do

It never asks whether a Dataset can be drawn as any particular chart.

A Dataset is published to describe data, not to satisfy a visualization. Which Visualization Types a
Dataset can support is **computed at authoring time** from its declared shape, never enforced at
publication and never stored. A Dataset that satisfies no Visualization Family today is still valid
and still publishes — it may satisfy one tomorrow, either because its publisher enriches the
declaration or because a new Family is introduced.

This matters because of a case the requirements call out directly: a publisher exposes a Dataset for
one purpose, and months later an unrelated team builds a completely different Visualization Type
from it with no coordination between them. Validating a Dataset against a widget list would require
the publisher to know that future in advance, which collapses the Data Publisher and Dashboard Author
roles the requirements say must stay separate.

See \`DATA_SHAPES.md\` for what each Family needs. Treat it as guidance for publishers, not as a gate.

## Rules

Every rule below is checked on submission. A submission failing any rule is rejected.

${publicationRules
  .map(
    (rule) => `### ${rule.id} — ${rule.requirement}

${rule.statement}
`,
  )
  .join('\n')}
## Enumerations

| Enumeration | Permitted values |
|---|---|
| Field role | ${FIELD_ROLES.map((r) => `\`${r}\``).join(', ')} |
| Aggregation | ${AGGREGATIONS.map((a) => `\`${a}\``).join(', ')} |
| Classification | ${CLASSIFICATIONS.map((c) => `\`${c}\``).join(', ')} |

A **Time Dimension** is a Dimension whose values represent points in time. It is expressed as the
Field role \`time-dimension\` rather than as a flag on \`dimension\`, and it counts as a Dimension
wherever one is required.

## Rejection behaviour (FR-DP-08)

A rejected submission must identify **precisely what is missing**, and must report every violation in
one pass — a publisher should not discover problems one at a time across repeated submissions.

Worked example. Submitting:

\`\`\`json
{
  "name": "Settlements",
  "fields": [{ "key": "amount", "label": "Amount", "role": "measure" }]
}
\`\`\`

produces:

${rejectionExample.violations.map((v) => `- **${v.rule}** (${v.requirement}) — ${v.detail}`).join('\n')}

## Retrieval obligations

These bind the Source System at read time, not at publication.

| Obligation | Requirement |
|---|---|
| Retrieval must not change the state of the owning Source System. | FR-DP-09 |
| Repeated identical retrievals must produce identical results where the underlying data has not changed. | FR-DP-10 |
| The Catalogue must be browsable — a Dashboard Author can discover which Datasets exist and what each contains — without retrieving the data itself. | FR-DP-11 |
| Catalogue browsing must present only those Datasets the Author is authorized to consume. | FR-DP-12 |
| Access to Datasets carrying a personal-data classification must be recorded, such that who accessed such data and when can later be established. | FR-DA-14 |

## Retrieval response contract

This is a **frontend requirement on the retrieval API**, and it falls out of the render states the
Viewer must be able to tell apart. Three outcomes carry different meanings and must be distinguishable
in the response — the frontend cannot infer them from an empty row set:

| Outcome | Must be signalled distinctly because | Requirement |
|---|---|---|
| **Authorized, rows returned** | The normal case. | — |
| **Authorized, no rows** | Must render as "no data", not as a failure. | FR-VZ-10 |
| **Not authorized for this Dataset** | Must render as an explicit denial — neither an error nor an absence of data. A denial drawn as an empty chart teaches the Viewer the figure is zero; drawn as an error, that the system is broken. Both are worse than saying access was denied. | FR-DA-10, FR-DA-11 |
| **Dataset withdrawn** | Must render as "no longer available". Stale figures must never be presented as current. | FR-DP-13, FR-DP-14 |

Authorization is determined **per Dataset, per Widget, independently** (FR-DA-09). A Viewer authorized
for a Dashboard but not for one Widget's Dataset sees that Widget denied while the rest of the
Dashboard continues to function (FR-DA-10). A denial must never be circumventable through a Widget:
a Viewer must not obtain through any Widget data they could not obtain directly from the bound
Dataset (FR-DA-12).

## Field semantics — the gap, and how it closed

${undecidableClauses.length} Data Shape ${undecidableClauses.length === 1 ? 'requirement' : 'requirements'} across ${new Set(undecidableClauses.map((u) => u.family.id)).size} Visualization ${new Set(undecidableClauses.map((u) => u.family.id)).size === 1 ? 'Family' : 'Families'} could not be
evaluated from a Field's type and role alone. Those Families were withheld from Authors, because the
requirement is to offer only Visualization Types the Dataset is *known* to satisfy — and a type says
how a value is stored while a role says whether it groups or aggregates. Neither can say a number is
a latitude, that a category holds a workflow state, or that a sum means anything.

**The API now carries them.** \`semantic\` landed on 17 September with the six values below, and
\`record_volume\` on 18 September for the one fact that belongs to the Dataset rather than to any
Field. Evaluation consults both by default.

This section stays because the requirement did not go away — it moved to the publisher. A Dataset
that declares no semantics still does not satisfy these Families, and that is now a definite answer
about the declaration rather than a limit of the model.

${undecidableClauses
  .map(
    ({ family, clause }) => `### ${family.name}

${clause.requirement}

**Declared with:** ${clause.resolvedBy}
`,
  )
  .join('\n')}
### What declaring them is worth

Measured against the fixture Datasets — eligibility evaluated without the descriptors, and with:

| Dataset | Families without | Families with | Types without | Types with |
|---|---|---|---|---|
${catalogueFixtures
  .map((dataset) => {
    const now = evaluateFamilies(dataset, { ignoreFieldSemantics: true })
    const then = evaluateFamilies(dataset)
    const count = (list: { satisfaction: Satisfaction }[]) =>
      list.filter((e) => e.satisfaction.status === 'satisfied').length
    const types = (list: { satisfaction: Satisfaction; visualizationTypes: unknown[] }[]) =>
      list.filter((e) => e.satisfaction.status === 'satisfied').reduce((n, e) => n + e.visualizationTypes.length, 0)
    return `| ${dataset.name} | ${count(now)} / 13 | ${count(then)} / 13 | ${types(now)} | ${types(then)} |`
  })
  .join('\n')}

The descriptors are not a blanket unlock. A Measure marked additive on one Dataset does not make an
unrelated Dataset eligible for Composition, and a Dataset with no location Field stays ineligible for
Geospatial whether or not the descriptors are adopted.

**This is what publishers gain by declaring.** The descriptors are not a blanket unlock: a Measure
marked additive on one Dataset does not make an unrelated one eligible for Composition, and a Dataset
with no location Field stays ineligible for Geospatial whichever way it is evaluated.

The shape of the extension — one optional descriptor per Field plus one Dataset-level volume, rather
than a flag per Family — is what was asked for and what was built, and it is why adding a fourteenth
Family would need no change to any declaration.

## Open interpretations

- **FR-DP-06** says a Dataset may declare that *one of* its Dimensions is a Time Dimension. This is
  read here as permissive rather than as a cap of one — Datasets commonly carry several timestamps.
  If a cap is intended, say so, because several Data Shapes are phrased "One Time Dimension + …".
- **Categorical Comparison** requires "one Dimension + one or more Measures". Since a Time Dimension
  is a Dimension, a Dataset with only a Time Dimension satisfies it. If a non-temporal Dimension is
  intended, the Data Shape needs restating.
`

// -- 2. Data Shapes ----------------------------------------------------------

const statusWord: Record<Satisfaction['status'], string> = {
  satisfied: 'Yes',
  unsatisfied: 'No',
  indeterminate: 'Cannot be determined',
}

export const renderDataShapes = (): string => `# Analytics — Visualization Data Shapes

${GENERATED('src/visualization/families.ts')}
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

There are ${visualizationFamilies.length} Families containing ${visualizationTypes.length} Visualization Types. Types within a Family share one Data
Shape — line, area, spline and step charts do not have four separate requirements, they inherit
Trend's.

Evaluation yields one of three outcomes:

| Outcome | Meaning |
|---|---|
| **Satisfied** | The Dataset meets the shape. The Family's Types are offered. |
| **Not satisfied** | The Dataset provably does not meet the shape — for example it has one Measure where two are required. Nothing is wrong with the Dataset; the Author should pick a different visualization. |
| **Cannot be determined** | The publication contract cannot express what the Family needs. The Types are withheld. This is a gap in the contract, not a defect in the Dataset — see the known gap in \`PUBLICATION_CONTRACT.md\`. |

## Summary

| Family | Question answered | Required Data Shape | Decidable today | Types built |
|---|---|---|---|---|
${visualizationFamilies
  .map((family) => {
    const decidable = family.dataShape.clauses.every((c) => !c.undecidable)
    const types = typesInFamily(family.id)
    const built = types.filter((t) => isBuilt(t.id)).length
    return `| ${family.name} | ${family.question} | ${family.dataShape.summary} | ${decidable ? 'Yes' : 'Partly'} | ${built} of ${types.length} |`
  })
  .join('\n')}

## Visualization Types by Family

Every Type the classification declares, and whether a renderer exists for it
today. Classification is complete — all ${String(visualizationTypes.length)} Types are registered and can be
offered by the eligibility predicate; the build status column is only about
whether something can *draw* the result yet.

| Family | Visualization Type | Renderer |
|---|---|---|
${visualizationFamilies
  .flatMap((family) =>
    typesInFamily(family.id).map(
      (type, index) =>
        `| ${index === 0 ? family.name : ''} | ${type.name} | ${isBuilt(type.id) ? 'Built' : 'Not built'} |`,
    ),
  )
  .join('\n')}

### Still to build

${visualizationTypes
  .filter((type) => !isBuilt(type.id))
  .map((type) => {
    const family = visualizationFamilies.find((f) => f.id === type.familyId)!
    return `- **${type.name}** *(${family.name})* — ${unbuiltReason(type.id, type.familyId)}`
  })
  .join('\n')}

Taken together: ${String(rendererCoverage().typesBuilt)} of ${String(visualizationTypes.length)} Types are built, spanning ${String(rendererCoverage().familiesBuilt)} of ${String(visualizationFamilies.length)}
Families. The order to tackle the rest in follows from the reasons above —
anything blocked on Finding 1 is waiting on a decision about the publication
model, not on frontend effort.

## Families in detail

${visualizationFamilies
  .map(
    (family) => `### ${family.name}

*"${family.question}"*

**Requires:** ${family.dataShape.summary}

Conditions checked:

${family.dataShape.clauses
  .map(
    (clause) =>
      `- ${clause.describe}${
        clause.undecidable
          ? `\n  - **Cannot be determined today.** ${clause.undecidable.requirement}\n  - Would be resolved by: ${clause.undecidable.resolvedBy}`
          : ''
      }`,
  )
  .join('\n')}

Visualization Types:

${typesInFamily(family.id)
  .map(
    (type) =>
      `- **${type.name}** — ${type.description}${isBuilt(type.id) ? '' : ` *(no renderer yet — ${unbuiltReason(type.id, family.id)})*`}`,
  )
  .join('\n')}
${family.note ? `\n> ${family.note}\n` : ''}`,
  )
  .join('\n')}
## Worked examples

Eligibility of the fixture Datasets, computed by the same predicate the application runs.

${catalogueFixtures
  .map((dataset) => {
    const evaluated = evaluateFamilies(dataset)
    const shape = [
      `${dataset.fields.filter((f) => f.role === 'dimension').length} Dimension(s)`,
      `${dataset.fields.filter((f) => f.role === 'time-dimension').length} Time Dimension(s)`,
      `${dataset.fields.filter((f) => f.role === 'measure').length} Measure(s)`,
    ].join(', ')

    return `### ${dataset.name}

Published by ${dataset.sourceSystem} · ${dataset.classification}${dataset.exposesPersonalData ? ' · exposes personal data' : ''}
Declared shape: ${shape}

| Family | Eligible | Reason |
|---|---|---|
${evaluated
  .map(({ family, satisfaction }) => {
    const reason =
      satisfaction.status === 'satisfied'
        ? '—'
        : satisfaction.status === 'unsatisfied'
          ? `Missing: ${satisfaction.unmet.join('; ')}`
          : satisfaction.undecided.map((u) => `Needs ${u.resolvedBy}`).join('; ')
    return `| ${family.name} | ${statusWord[satisfaction.status]} | ${reason} |`
  })
  .join('\n')}
`
  })
  .join('\n')}`

// -- 3. Machine-readable -----------------------------------------------------

export const contractJson = {
  generatedFrom: 'analytics-widgets-lab',
  publication: {
    enumerations: {
      fieldRole: FIELD_ROLES,
      aggregation: AGGREGATIONS,
      classification: CLASSIFICATIONS,
    },
    rules: publicationRules.map(({ id, requirement, statement }) => ({
      id,
      requirement,
      statement,
    })),
  },
  visualization: {
    families: visualizationFamilies.map((family) => ({
      id: family.id,
      name: family.name,
      question: family.question,
      dataShape: {
        summary: family.dataShape.summary,
        clauses: family.dataShape.clauses.map((clause) => ({
          describe: clause.describe,
          decidableFromPublishedModel: !clause.undecidable,
          undecidable: clause.undecidable ?? null,
        })),
      },
      visualizationTypes: typesInFamily(family.id).map(({ id, name, description }) => ({
        implemented: isBuilt(id),
        id,
        name,
        description,
      })),
    })),
  },
  knownGap: undecidableClauses.map(({ family, clause }) => ({
    familyId: family.id,
    familyName: family.name,
    requirement: clause.requirement,
    resolvedBy: clause.resolvedBy,
  })),
}

const STATUS_LABEL: Record<DivergenceStatus, string> = {
  'proposed-extension': 'Proposed extension',
  'deliberate-deviation': 'Deliberate deviation',
  temporary: 'Temporary',
  resolved: 'Resolved',
}

const AUTHORITY_LABEL: Record<Divergence['authority'], string> = {
  frd: 'FRD',
  api: 'API',
  both: 'FRD + API',
}

/**
 * The divergence register — Merge Plan §4.
 *
 * Generated so it cannot drift from the table the code cites. Open entries come
 * first because they are the ones anyone reading this needs to act on; resolved
 * ones are kept because the register is a record of decisions, and a decision
 * that stops applying is still one that was taken.
 */
export const renderDivergences = (): string => {
  const row = (entry: Divergence) =>
    `| **${entry.id}** | ${AUTHORITY_LABEL[entry.authority]} | \`${entry.clause}\` | ${
      entry.divergence
    } | ${STATUS_LABEL[entry.status]}${entry.endedAt ? ` — ${entry.endedAt}` : ''} |`

  const detail = (entry: Divergence) =>
    [
      `### ${entry.id} — ${entry.divergence}`,
      '',
      `**Answers to:** ${AUTHORITY_LABEL[entry.authority]} — \`${entry.clause}\`  `,
      `**Status:** ${STATUS_LABEL[entry.status]}${entry.endedAt ? ` (${entry.endedAt})` : ''}  `,
      entry.findings?.length
        ? `**Findings:** ${entry.findings.map((n) => `Finding ${n}`).join(', ')}  `
        : null,
      entry.where ? `**Where:** \`${entry.where}\`  ` : null,
      '',
      entry.reason,
    ]
      .filter((line) => line !== null)
      .join('\n')

  const open = openDivergences()
  const resolved = resolvedDivergences()

  return `# Analytics — Divergence Register

Every place this implementation does not match the contract it answers to, with
the clause, the reason, and how long it is meant to last.

There are two such contracts, so every entry names one. The **FRD** says what the
capability must do; the **API** — the deployed Analytics service — says what goes
on the wire. Where those two disagree with *each other*, that is not a divergence
but a Finding, and it lives in \`Analytics_API_Alignment.md\` §6.

**Generated from \`src/contract-docs/divergences.ts\` by \`bun run docs\`.** Do not
edit this file. \`src/contract-docs/render.test.ts\` fails if it drifts, so a
divergence that gets fixed cannot stay listed and one that gets introduced cannot
stay unlisted.

Distinct from the **Findings** in \`Analytics_Frontend_Plan.md\` §9: a Finding is a
gap in the requirements, a Divergence is a place our implementation does not match
them. Where the two are related the entry says so.

| Status | Meaning |
| --- | --- |
| Proposed extension | We are asking the FRD to grow. |
| Deliberate deviation | We think the FRD is wrong or under-specified and chose differently. |
| Temporary | Conformance deferred, with a stage that ends it. |
| Resolved | Was one of the above; no longer diverges. Kept for the record. |

## Open — ${open.length}

| # | Answers to | Clause | Divergence | Status |
| --- | --- | --- | --- | --- |
${open.map(row).join('\n')}

## Resolved — ${resolved.length}

| # | Answers to | Clause | Divergence | Status |
| --- | --- | --- | --- | --- |
${resolved.map(row).join('\n')}

---

## Open entries in detail

${open.map(detail).join('\n\n')}

---

## Resolved entries

${resolved.map(detail).join('\n\n')}
`
}

export const renderContractJson = (): string =>
  JSON.stringify(contractJson, null, 2) + '\n'

/** Filenames the generator writes, shared with the drift test. */
// -- 4. Widget data contract -------------------------------------------------

/**
 * What each widget asks a Source System for.
 *
 * Written for the backend team, and generated rather than hand-kept for the
 * usual reason: every figure below is read out of the code that actually builds
 * the query, so it cannot drift from what the frontend really sends.
 *
 * The interesting column is `request`. It is derived by running `queryFor` over
 * each Type's sample binding, which is the same function the running application
 * uses — so if a widget asks for records rather than an aggregate, that shows up
 * here as a fact rather than as a claim.
 */

interface WidgetContractRow {
  typeId: string
  label: string
  family: string
  /** The roles a Field must have to fill each slot, in the widget's own words. */
  needs: string
  /** What `queryFor` emits for the sample binding. */
  request: string
  /** How the request is shaped: one row, grouped rows, or records. */
  grain: 'single aggregate' | 'grouped aggregate' | 'records'
  /** Rows the fixture returns — an indication of volume, not a limit. */
  rows: number
}

const ROLE_SHORT: Record<string, string> = {
  dimension: 'Dimension',
  'time-dimension': 'Time Dimension',
  measure: 'Measure',
}

const describeSlot = (slot: {
  label: string
  accepts: readonly string[]
  min: number
  max: number
  geo?: boolean
}): string => {
  const roles = slot.accepts.map((role) => ROLE_SHORT[role] ?? role).join(' or ')
  const geo = slot.geo ? ', geographic' : ''

  /*
   * Read as a quantity a person would say. `0 × Measure (optional)` is
   * technically the min but says nothing useful; "up to 1" does.
   */
  const count =
    slot.min === 0
      ? `up to ${slot.max === 99 ? 'n' : String(slot.max)}`
      : slot.max > slot.min
        ? `${String(slot.min)}–${slot.max === 99 ? 'n' : String(slot.max)}`
        : String(slot.min)

  return `**${slot.label}** — ${count} × ${roles}${geo}`
}

const widgetContractRows = (): WidgetContractRow[] =>
  WIDGET_TYPES.filter((type) => type.built)
    .map((type) => {
      const sample = SAMPLES[type.id]
      const spec = { id: 'doc', typeId: type.id, ...sample }
      const dataset = requireDataset(sample.datasetId)
      const query = queryFor(spec, dataset)
      const rows = rowsForWidget(spec, dataset)

      const grain: WidgetContractRow['grain'] = query.measures
        ? query.dimensions
          ? 'grouped aggregate'
          : 'single aggregate'
        : 'records'

      return {
        typeId: type.id,
        label: type.label,
        family: type.family,
        needs: slotsFor(type.id).map(describeSlot).join('<br>') || '—',
        request: requestSummary(query),
        grain,
        rows: rows.length,
      }
    })

/** A `DatasetQuery` as one readable cell. */
function requestSummary(query: DatasetQuery): string {
  const parts: string[] = []
  if (query.dimensions?.length) parts.push(`group by \`${query.dimensions.join('`, `')}\``)
  if (query.measures?.length) {
    parts.push(
      query.measures.map((m) => `\`${m.aggregation}(${m.field})\``).join(', '),
    )
  }
  if (query.timeRange) parts.push(`range on \`${query.timeRange.field}\``)
  if (query.sort?.length) {
    parts.push(
      `order by ${query.sort.map((s) => `\`${s.field}\` ${s.direction === 'ascending' ? '↑' : '↓'}`).join(', ')}`,
    )
  }
  if (query.limit !== undefined) parts.push(`limit ${String(query.limit)}`)
  return parts.length > 0 ? parts.join('; ') : 'no aggregation — all records'
}

export const renderWidgetDataContract = (): string => {
  const rows = widgetContractRows()
  const byGrain = (grain: string) => rows.filter((r) => r.grain === grain)
  const families = Array.from(new Set(rows.map((r) => r.family)))

  return `# Analytics — Widget Data Contract

${GENERATED('src/contract-docs/render.ts')}
For the team building the Source Systems. It answers one question per widget:
**what will the frontend ask you for, and what shape must the answer be?**

Every row is read out of the code that builds the query — the same \`queryFor\`
the running application calls — so nothing here is an intention.

Read [\`PUBLICATION_CONTRACT.md\`](PUBLICATION_CONTRACT.md) first for what a
Dataset must *declare*. This document is about what gets *asked* afterwards.

---

## 1. The request

One shape, for every widget:

\`\`\`ts
interface DatasetQuery {
  /** Group by these Dimensions. Omitted or empty means a single aggregate row. */
  dimensions?: string[]
  measures?: { field: string; aggregation: Aggregation }[]
  timeRange?: { field: string; from?: string; to?: string; granularity?: TimeGranularity }
  /** Keyed by Field key. Only Fields the Dataset declared \`filterable\`. */
  filters?: Record<string, string | number>
  sort?: { field: string; direction: 'ascending' | 'descending' }[]
  limit?: number
}

type Aggregation = 'sum' | 'average' | 'count' | 'minimum' | 'maximum' | 'distinct-count'
type TimeGranularity = 'day' | 'week' | 'month' | 'quarter' | 'year'
\`\`\`

**Aggregation is asked for, never applied afterwards.** A widget requests
"sum of revenue by region" and expects grouped, aggregated rows. It must not
receive raw records and reduce them, for two reasons: it would let each widget
decide what "sum" means, and it would ship records a Viewer may not be entitled
to see.

An \`aggregation\` we send is always one the Dataset declared for that Measure.
If we ask for something undeclared, that is our bug — reject it.

---

## 2. The response

Four outcomes, and they must be distinguishable. This is the single easiest part
of the contract to get wrong, because nothing in the requirements says it about
the API — only about the display.

\`\`\`ts
type RetrievalOutcome =
  | { kind: 'rows'; rows: DatasetRow[]; totalCount: number }
  | { kind: 'empty' }      // authorized, and the Dataset has nothing to say
  | { kind: 'denied' }     // not authorized for this Dataset
  | { kind: 'withdrawn' }  // the Dataset is gone

type DatasetRow = Record<string, string | number | null>
\`\`\`

A response of \`[]\` cannot carry this: empty, denied and withdrawn all look
identical, and the frontend would have to guess. It renders each of the four
differently — a denial says access was denied rather than showing zero, because
showing zero teaches a Viewer the figure *is* zero.

**A genuine failure is an error, not an outcome** — the absence of an answer
rather than one of the answers.

\`kind: 'rows'\` with an empty \`rows\` array is treated as a **contract breach**
and surfaced as a failure, not as \`empty\`. Send \`{ kind: 'empty' }\`.

---

## 3. What a row must look like

Your integration guide says the relayed body's *"shape must match frontend
visualization requirements"* and then, reasonably, does not say what those are.
This section is that half of the sentence.

**Field names are yours, not ours.** This is the first thing to settle, because
it is the thing teams most often expect us to dictate. We never need a field
called \`value\`. Every visualisation takes its field references as
configuration — a bar chart is handed \`valueKey: 'settlement_value'\`, and the
name is bound once when an Author builds the Widget. So \`val\`, \`value\`,
\`total_amount\` and \`settlement_value\` are all equally fine, and asking you to
rename one would break every existing binding for no gain. What we need is that
a declared name **matches the key you return** — which your guide already
requires.

What we do need is below. Each is an invariant rather than a preference, and
each names the failure it avoids, because every one of these fails *silently*.

### Values carry their declared type

A Field declared \`number\` must arrive as a JSON number.

\`\`\`json
{ "region": "EMEA", "revenue": 1234.5 }     // yes
{ "region": "EMEA", "revenue": "1,234.50" } // no
\`\`\`

A formatted string becomes \`NaN\` the moment we coerce it, and \`NaN\` in an SVG
path renders as **nothing at all** — no error, no warning, an empty chart that
looks like missing data. Our own test suite cannot catch this, because it tests
our fixtures and those are well-formed by construction. Same for \`boolean\`:
\`true\`, not \`"true"\` and not \`1\`.

### Dates are ISO-8601, and one grain per Dataset

\`2026-08-07\` for a day, \`2026-08\` for a month, \`2026\` for a year. Not
\`07/08/2026\`, not a locale string, not epoch milliseconds.

Date filtering compares these as strings, which is exact and fast for ISO-8601
and wrong for everything else. \`07/08/2026\` would not throw — it would return
the wrong rows, quietly, which is worse. Mixing grains inside one Dataset breaks
the same comparison.

### Absent means \`null\`, not a missing key and not \`""\`

\`\`\`json
{ "region": "EMEA", "revenue": null }  // yes — no value
{ "region": "EMEA" }                   // no  — key omitted
{ "region": "EMEA", "revenue": "" }    // no  — empty string
\`\`\`

An omitted key and an explicit \`null\` take different paths through several
visualisations, and \`""\` coerces to \`0\` in a Measure — which draws a bar of
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

Nine of the ${String(rows.length)} widget types need rows in order — every
trend, the chronological pair, and the temporal ones. A line chart drawn from
unordered rows is not untidy, it is wrong: the line doubles back on itself.

Since the query carries no \`sort\`, we need one of two answers per Dataset.
Either the endpoint returns a stable order and says so, or it does not and we
sort in the browser. Both are workable; not knowing which is not.

### A \`location\` Field should say which kind it is

\`FieldType: 'location'\` covers two different things, and they feed different
visualisations. A region name (\`"Kenya"\`) shades a choropleth; a coordinate
(\`-1.29\`) places a point on a map, and a point needs *two* Fields that know
which of them is latitude. Today nothing distinguishes them, so a point map can
be offered a table of regional sales and plot revenue as a latitude. We have
raised this upstream; until it is settled, please say in the Field's
\`description\` which one you mean.

---

## 4. Aggregation grain — the thing to settle with us

Of the ${String(rows.length)} built widget types, **${String(byGrain('single aggregate').length)} currently send an aggregated
query and ${String(byGrain('records').length)} ask for records.**

That is not a recommendation, it is a report — and it needs a conversation
before it meets a real database.

The reason is our fixtures: most are already stored at the grain the chart draws.
\`sales-by-region\` is one row per region, so a bar chart over it asks for records
and gets exactly the six bars it wants. Against a raw table the same widget would
pull every transaction and group in the browser, which is both slow and the thing
§2 of the publication contract forbids.

**What this means for you:**

- The ${String(byGrain('single aggregate').length)} single-aggregate types are correct as they stand and safe against any volume.
- For the rest, tell us where your data's grain sits. If a Dataset is already
  aggregated to the grain we draw, records are fine and the \`rows\` count in
  §5 is what to expect. If it is raw, we need to send \`dimensions\` +
  \`measures\` and we will fix the query — the mapping already carries the
  information, so it is our change, not yours.
- The row counts in §5 are what our *fixtures* return. Treat them as the volume
  a widget can usefully draw, not as a limit you should enforce: a calendar
  heatmap wants 365 points and a stat card wants 1.

This is tracked on our side as divergences **D13** and **D14** in
[\`DIVERGENCES.md\`](DIVERGENCES.md).

---

## 5. Every widget, and what it asks for

\`needs\` is what a Dataset must offer for the widget to be *offered* at all —
the Field roles, and how many of each. A widget whose required slots cannot be
filled is never shown to an Author, so a Dataset missing a Time Dimension simply
does not produce trend charts.

${families
  .map((family) => {
    const inFamily = rows.filter((r) => r.family === family)
    const label = FAMILIES.find((entry) => entry.id === family)?.label ?? family
    return `### ${label} — \`${family}\`

| Type | Needs | Request today | Grain | Fixture rows |
|---|---|---|---|---|
${inFamily
  .map(
    (r) =>
      `| \`${r.typeId}\`<br>${r.label} | ${r.needs} | ${r.request} | ${r.grain} | ${String(r.rows)} |`,
  )
  .join('\n')}`
  })
  .join('\n\n')}

---

## 6. Field roles, for reference

Three roles, and the distinction is load-bearing rather than cosmetic:

| Role | What it is | Notes |
|---|---|---|
| \`dimension\` | Identifies or categorizes a record | |
| \`time-dimension\` | A Dimension whose values are points in time | Counts as a Dimension wherever one is required |
| \`measure\` | Can be meaningfully aggregated | Must declare which \`aggregations\` are meaningful |

Two things a Dataset declares that change what we can offer:

- **\`filterable\` gates every filter.** A Viewer-facing filter or a Dashboard
  Control can only act on a Field you marked filterable. We enforce this twice —
  the picker will not offer it, and the query builder drops it — so an unmarked
  Field is unreachable by design.
- **\`semantic\` unlocks four Families.** Role says what a Field *is* and cannot
  say what it is *for*. A point map needs to know which Measure is a latitude;
  without it, a ranked list will happily rank countries by how far north they
  are. See \`PUBLICATION_CONTRACT.md\` for the values.

---

## 7. What we will not ask you for

- **Writes.** Every widget is read-only, enforced by the props carrying no
  callback — there is nothing a widget *could* call to mutate.
- **Joins.** A widget draws from exactly one Dataset. If two Datasets need
  relating, that is a Dataset the Source System publishes, not a query we send.
- **Formatting.** Send numbers as numbers. \`format\` on a Field tells us how to
  render them.
- **Anything a Viewer may not see.** Authorization is resolved per Dataset per
  call, on your side. We ask; we do not carry a rule about who may read what.
`
}

export const DOC_FILES = {
  publicationContract: 'PUBLICATION_CONTRACT.md',
  dataShapes: 'DATA_SHAPES.md',
  divergences: 'DIVERGENCES.md',
  widgetData: 'WIDGET_DATA_CONTRACT.md',
  contractJson: 'analytics-contract.json',
} as const
