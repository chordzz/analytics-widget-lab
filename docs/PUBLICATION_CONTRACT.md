# Analytics — Publication Contract

> **Generated file — do not edit.** Produced by `bun run docs` from `src/domain/publication-contract.ts`.
> Regenerate after any change to the contract rather than editing this document.

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

See `DATA_SHAPES.md` for what each Family needs. Treat it as guidance for publishers, not as a gate.

## Rules

Every rule below is checked on submission. A submission failing any rule is rejected.

### PC-01 — Definitions — Dataset

A Dataset must carry a stable identifier and a human-readable name.

### PC-02 — FR-DP-02

A Dataset must identify the Source System that owns it. Ownership is singular and unambiguous.

### PC-03 — FR-DP-03

A Dataset must describe its Fields such that, for each Field, a consumer can determine whether it is a Dimension or a Measure. Every Field carries a unique key, a label, and a role.

### PC-04 — FR-DP-04

Every Measure must declare which aggregations are meaningful for it. Declaring an aggregation asserts that its result carries meaning, not merely that it computes.

### PC-05 — FR-DP-05

Every Field must state explicitly whether it may be used to filter records and whether it may be used to order them. Omission is not a default — it is an undeclared Field.

### PC-06 — FR-DP-07

A Dataset must carry a data classification indicating the sensitivity of the data it exposes.

### PC-07 — FR-DP-07

A Dataset must state explicitly whether it exposes personal data. This drives the access recording obligation in FR-DA-14, so it cannot be left to inference.

### PC-08 — Proposed extension — D30

A Dataset must declare its row grain: the Fields whose combination identifies one row, or an empty list where the endpoint answers with a single summary row. An Author choosing a Dataset cannot otherwise tell a one-row summary from two thousand records, and the two feed almost disjoint sets of Visualization Types.

### PC-09 — Proposed extension — D31

Every Filter Parameter must state whether it is required, and must declare its accepted values wherever those are enumerable. A parameter whose values are not declared renders as an empty control: the Viewer is offered a filter with nothing to pick.

## Enumerations

| Enumeration | Permitted values |
|---|---|
| Field role | `dimension`, `time-dimension`, `measure` |
| Aggregation | `sum`, `average`, `count`, `minimum`, `maximum`, `distinct-count` |
| Classification | `public`, `internal`, `confidential`, `restricted` |

A **Time Dimension** is a Dimension whose values represent points in time. It is expressed as the
Field role `time-dimension` rather than as a flag on `dimension`, and it counts as a Dimension
wherever one is required.

## Rejection behaviour (FR-DP-08)

A rejected submission must identify **precisely what is missing**, and must report every violation in
one pass — a publisher should not discover problems one at a time across repeated submissions.

Worked example. Submitting:

```json
{
  "name": "Settlements",
  "fields": [{ "key": "amount", "label": "Amount", "role": "measure" }]
}
```

produces:

- **PC-01** (Definitions — Dataset) — No Dataset identifier was supplied.
- **PC-02** (FR-DP-02) — No owning Source System was identified.
- **PC-04** (FR-DP-04) — Measure 'amount' declares no meaningful aggregations.
- **PC-05** (FR-DP-05) — Field 'amount' does not declare whether it is filterable.
- **PC-05** (FR-DP-05) — Field 'amount' does not declare whether it is sortable.
- **PC-06** (FR-DP-07) — No data classification was supplied.
- **PC-07** (FR-DP-07) — The Dataset does not state whether it exposes personal data.
- **PC-08** (Proposed extension — D30) — The Dataset does not declare what one row represents.

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

5 Data Shape requirements across 5 Visualization Families cannot be
evaluated against this contract as it currently stands. Those Families are therefore withheld from
Authors, because the requirement is to offer only Visualization Types the Dataset is *known* to
satisfy.

### Composition

§4.2 requires a Measure "summing to a meaningful total". Additivity is a property of meaning, not of type — FR-DP-04 declares which aggregations are meaningful, but not whether the resulting total is itself meaningful as a whole.

**Proposed resolution:** proposed Field semantic 'additive-total'

### Distribution

§4.2 requires the Measure be spread "across many records". Record volume is not part of the published model.

**Proposed resolution:** proposed Dataset descriptor 'recordVolume'

### Ranking & Flow

§4.2 admits "ordered stage data" as an alternative shape. Stage ordering is not expressible in the published model, so the funnel/sankey route cannot be evaluated.

**Proposed resolution:** proposed Field semantic 'stage'

### Geospatial

§4.2 requires a "location-typed Dimension". The published model has exactly three Field roles — Dimension, Measure, Time Dimension — and no notion of a location type. It also cannot say that two Measures are a coordinate pair rather than two figures.

**Proposed resolution:** proposed Field semantics 'geographic-area', or 'geographic-latitude' with 'geographic-longitude'

### Status

§4.2 admits "one state Dimension" as an alternative shape. The published model cannot distinguish a state Dimension from any other Dimension.

**Proposed resolution:** proposed Field semantic 'state'

### Impact

Measured against the fixture Datasets, adopting the proposed descriptors changes eligibility as
follows:

| Dataset | Families satisfied today | With the proposed descriptors | Types offered today | With |
|---|---|---|---|---|
| Peniremit settlements | 9 / 13 | 11 / 13 | 30 | 37 |
| Payroll disbursements | 10 / 13 | 12 / 13 | 33 | 40 |
| Active users | 9 / 13 | 10 / 13 | 30 | 33 |
| Corridor coverage | 6 / 13 | 8 / 13 | 21 | 27 |
| Journal entries | 2 / 13 | 3 / 13 | 5 | 8 |

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
