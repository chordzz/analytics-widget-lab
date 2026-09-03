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
import { registerBuiltInRenderers } from '../renderers'
import { registeredRendererIds } from '../widget-runtime/renderer'
import type { Satisfaction } from '../visualization/data-shape'

// Build status is read from the renderer registry rather than listed by hand,
// so the documentation cannot claim something is built that isn't.
registerBuiltInRenderers()
const BUILT = new Set(registeredRendererIds())
const isBuilt = (typeId: string) => BUILT.has(typeId)

/**
 * Why a Type is not built yet. Editorial rather than derivable, so it is stated
 * here — but a test asserts every unbuilt Type has one, so the list cannot rot
 * silently as Types are added.
 */
const UNBUILT_REASON_BY_FAMILY: Record<string, string> = {
  composition:
    'The Family cannot be evaluated at all under the current publication model — additivity is undeclared (Finding 1). Building a renderer would produce something no Dataset is ever offered.',
  distribution:
    'The Family cannot be evaluated at all — record volume is undeclared (Finding 1).',
  geospatial:
    'The Family cannot be evaluated at all — there is no location-typed Field (Finding 1). Also the only Family needing a mapping library, which is a dependency decision in its own right.',
  'temporal-pattern':
    'Evaluable, but the fixture Datasets are monthly. A calendar heatmap or cohort grid needs daily-grain data to show anything meaningful.',
}

/** Types reachable only via a Data Shape route the publication model cannot express. */
const STAGE_ROUTE_TYPES = new Set(['funnel', 'sankey', 'bar-chart-race'])

function unbuiltReason(typeId: string, familyId: string): string {
  if (STAGE_ROUTE_TYPES.has(typeId)) {
    return 'Reachable only through the "ordered stage data" route, which the publication model cannot express (Finding 1).'
  }
  return UNBUILT_REASON_BY_FAMILY[familyId] ?? 'Not yet built. No blocker — straightforward when prioritized.'
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

## Known gap — properties the contract cannot express

${undecidableClauses.length} Data Shape ${undecidableClauses.length === 1 ? 'requirement' : 'requirements'} across ${new Set(undecidableClauses.map((u) => u.family.id)).size} Visualization ${new Set(undecidableClauses.map((u) => u.family.id)).size === 1 ? 'Family' : 'Families'} cannot be
evaluated against this contract as it currently stands. Those Families are therefore withheld from
Authors, because the requirement is to offer only Visualization Types the Dataset is *known* to
satisfy.

${undecidableClauses
  .map(
    ({ family, clause }) => `### ${family.name}

${clause.requirement}

**Proposed resolution:** ${clause.resolvedBy}
`,
  )
  .join('\n')}
### Impact

Measured against the fixture Datasets, adopting the proposed descriptors changes eligibility as
follows:

| Dataset | Families satisfied today | With the proposed descriptors | Types offered today | With |
|---|---|---|---|---|
${catalogueFixtures
  .map((dataset) => {
    const now = evaluateFamilies(dataset)
    const then = evaluateFamilies(dataset, { useProposedSemantics: true })
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

**Recommendation:** extend the publication contract with one optional semantic descriptor per Field,
plus one Dataset-level record-volume hint, rather than adding a separate flag per Family. A single
extension point keeps the contract stable as new Families are introduced.

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
    `| **${entry.id}** | \`${entry.clause}\` | ${entry.divergence} | ${STATUS_LABEL[entry.status]}${
      entry.endedAt ? ` — ${entry.endedAt}` : ''
    } |`

  const detail = (entry: Divergence) =>
    [
      `### ${entry.id} — ${entry.divergence}`,
      '',
      `**Clause:** \`${entry.clause}\`  `,
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

Every place this implementation does not match the FRD, with the clause, the
reason, and how long it is meant to last.

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

| # | Clause | Divergence | Status |
| --- | --- | --- | --- |
${open.map(row).join('\n')}

## Resolved — ${resolved.length}

| # | Clause | Divergence | Status |
| --- | --- | --- | --- |
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
export const DOC_FILES = {
  publicationContract: 'PUBLICATION_CONTRACT.md',
  dataShapes: 'DATA_SHAPES.md',
  divergences: 'DIVERGENCES.md',
  contractJson: 'analytics-contract.json',
} as const
