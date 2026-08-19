/**
 * Phase 1 deliverable, made visible: pick a Dataset from the Catalogue and see
 * which Visualization Types the system may offer for it (FR-VZ-05), which it
 * may not, and — crucially — which it cannot decide.
 *
 * The "proposed Field semantics" switch toggles Finding 1's recommended
 * extension on and off, so the cost of the gap is legible rather than
 * theoretical.
 */

import { useMemo, useState } from 'react'
import { catalogueFixtures } from '../catalogue/fixtures'
import { evaluateFamilies, offeredVisualizationTypes } from '../visualization/registry'
import type { Dataset, Field } from '../domain/dataset'
import type { Satisfaction } from '../visualization/data-shape'

const ROLE_LABEL: Record<Field['role'], string> = {
  dimension: 'Dimension',
  'time-dimension': 'Time Dimension',
  measure: 'Measure',
}

const STATUS_TOKEN: Record<Satisfaction['status'], string> = {
  satisfied: 'var(--analytics-status-positive)',
  unsatisfied: 'var(--analytics-status-neutral)',
  indeterminate: 'var(--analytics-status-warning)',
}

const STATUS_LABEL: Record<Satisfaction['status'], string> = {
  satisfied: 'Satisfied',
  unsatisfied: 'Not satisfied',
  indeterminate: 'Cannot be determined',
}

export function EligibilityExplorer({ embedded = false }: { embedded?: boolean }) {
  const [useProposedSemantics, setUseProposedSemantics] = useState(false)
  const [datasetId, setDatasetId] = useState(catalogueFixtures[0].id)

  const dataset = catalogueFixtures.find((d) => d.id === datasetId)!
  const options = { useProposedSemantics }

  const eligibility = useMemo(() => evaluateFamilies(dataset, options), [dataset, useProposedSemantics])
  const offered = useMemo(
    () => offeredVisualizationTypes(dataset, options),
    [dataset, useProposedSemantics],
  )
  const asPublished = useMemo(() => evaluateFamilies(dataset), [dataset])

  const satisfiedCount = eligibility.filter((e) => e.satisfaction.status === 'satisfied').length
  const indeterminateCount = asPublished.filter(
    (e) => e.satisfaction.status === 'indeterminate',
  ).length

  return (
    <div className={embedded ? '' : 'min-h-screen bg-[var(--analytics-bg)] p-6'}>
      <div className={embedded ? '' : 'max-w-6xl mx-auto'}>
        <p className="text-xs text-[var(--analytics-text-secondary)] m-0 mb-4 max-w-3xl">
          FR-VZ-05 — when an Author selects a Dataset, only Visualization Types whose Family Data
          Shape the Dataset satisfies may be offered. A Dataset is never bound to a Visualization
          Type; eligibility is computed, never stored.
        </p>

        <div className="grid grid-cols-[260px_1fr] gap-6 items-start">
          {/* Catalogue — FR-DP-11: browsable without retrieving data */}
          <nav aria-label="Catalogue" className="space-y-1">
            <h2 className="text-xs font-medium text-[var(--analytics-text-secondary)] m-0 mb-2">
              Catalogue
            </h2>
            {catalogueFixtures.map((d) => (
              <button
                key={d.id}
                onClick={() => setDatasetId(d.id)}
                aria-current={d.id === datasetId}
                className={[
                  'w-full text-left rounded border px-3 py-2 transition-colors',
                  'border-[var(--analytics-border)]',
                  d.id === datasetId
                    ? 'bg-[var(--analytics-surface-hover)]'
                    : 'bg-[var(--analytics-surface)]',
                ].join(' ')}
              >
                <div className="text-sm text-[var(--analytics-text)]">{d.name}</div>
                <div className="text-xs text-[var(--analytics-text-muted)]">{d.sourceSystem}</div>
              </button>
            ))}
          </nav>

          <main className="space-y-4">
            <DatasetSummary dataset={dataset} />

            <div className="rounded-lg border border-[var(--analytics-border)] bg-[var(--analytics-surface)] p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <p className="text-sm text-[var(--analytics-text)] m-0">
                  <strong>{satisfiedCount}</strong> of 13 Families satisfied ·{' '}
                  <strong>{offered.length}</strong> Visualization Types offered
                  {!useProposedSemantics && indeterminateCount > 0 && (
                    <>
                      {' '}
                      · <strong>{indeterminateCount}</strong> undeterminable
                    </>
                  )}
                </p>

                <label className="flex items-center gap-2 text-xs text-[var(--analytics-text-secondary)]">
                  <input
                    type="checkbox"
                    checked={useProposedSemantics}
                    onChange={(e) => setUseProposedSemantics(e.target.checked)}
                  />
                  Apply proposed Field semantics (Finding 1)
                </label>
              </div>

              {!useProposedSemantics && indeterminateCount > 0 && (
                <p className="text-xs text-[var(--analytics-status-warning)] m-0 mt-2">
                  {indeterminateCount} {indeterminateCount === 1 ? 'Family' : 'Families'} cannot be
                  evaluated against the publication model as the FRD defines it today. Those Types are
                  withheld, because FR-VZ-05 says to offer only what the Dataset is known to satisfy.
                </p>
              )}
            </div>

            <ul className="space-y-2 list-none p-0 m-0">
              {eligibility.map(({ family, satisfaction, visualizationTypes }) => (
                <li
                  key={family.id}
                  className="rounded-lg border border-[var(--analytics-border)] bg-[var(--analytics-surface)] p-3"
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-sm font-medium text-[var(--analytics-text)] m-0">
                        {family.name}
                      </h3>
                      <p className="text-xs text-[var(--analytics-text-muted)] m-0 italic">
                        “{family.question}”
                      </p>
                    </div>
                    <span
                      className="shrink-0 text-xs rounded-full px-2 py-0.5 border"
                      style={{
                        color: STATUS_TOKEN[satisfaction.status],
                        borderColor: STATUS_TOKEN[satisfaction.status],
                      }}
                    >
                      {STATUS_LABEL[satisfaction.status]}
                    </span>
                  </div>

                  <p className="text-xs text-[var(--analytics-text-secondary)] m-0 mt-2">
                    Requires: {family.dataShape.summary}
                  </p>

                  {satisfaction.status === 'satisfied' && (
                    <p className="text-xs text-[var(--analytics-text-secondary)] m-0 mt-1">
                      Offers: {visualizationTypes.map((t) => t.name).join(', ')}
                    </p>
                  )}

                  {satisfaction.status === 'unsatisfied' && (
                    <p className="text-xs text-[var(--analytics-text-muted)] m-0 mt-1">
                      Missing: {satisfaction.unmet.join('; ')}
                    </p>
                  )}

                  {satisfaction.status === 'indeterminate' &&
                    satisfaction.undecided.map((u, i) => (
                      <div key={i} className="mt-2 text-xs">
                        <p className="text-[var(--analytics-status-warning)] m-0">{u.requirement}</p>
                        <p className="text-[var(--analytics-text-muted)] m-0 mt-0.5">
                          Would be resolved by: {u.resolvedBy}
                        </p>
                      </div>
                    ))}

                  {family.note && (
                    <p className="text-xs text-[var(--analytics-text-muted)] m-0 mt-2 border-l-2 border-[var(--analytics-border)] pl-2">
                      {family.note}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </main>
        </div>
      </div>
    </div>
  )
}

function DatasetSummary({ dataset }: { dataset: Dataset }) {
  return (
    <section className="rounded-lg border border-[var(--analytics-border)] bg-[var(--analytics-surface)] p-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <h2 className="text-sm font-medium text-[var(--analytics-text)] m-0">{dataset.name}</h2>
        <span className="text-xs text-[var(--analytics-text-muted)]">
          Published by {dataset.sourceSystem} · {dataset.classification}
          {dataset.exposesPersonalData && ' · personal data'}
        </span>
      </div>
      <p className="text-xs text-[var(--analytics-text-secondary)] m-0 mt-1">{dataset.description}</p>

      <table className="w-full mt-3 text-xs border-collapse">
        <thead>
          <tr className="text-left text-[var(--analytics-text-muted)]">
            <th className="font-normal py-1">Field</th>
            <th className="font-normal py-1">Role</th>
            <th className="font-normal py-1">Aggregations</th>
            <th className="font-normal py-1">Filter / sort</th>
            <th className="font-normal py-1">Semantic</th>
          </tr>
        </thead>
        <tbody className="text-[var(--analytics-text-secondary)]">
          {dataset.fields.map((field) => (
            <tr key={field.key} className="border-t border-[var(--analytics-border)]">
              <td className="py-1 text-[var(--analytics-text)]">{field.label}</td>
              <td className="py-1">{ROLE_LABEL[field.role]}</td>
              <td className="py-1">
                {field.role === 'measure' ? field.aggregations.join(', ') : '—'}
              </td>
              <td className="py-1">
                {[field.filterable && 'filter', field.sortable && 'sort'].filter(Boolean).join(' / ') ||
                  '—'}
              </td>
              <td className="py-1">
                {field.semantic ? (
                  <span className="text-[var(--analytics-status-warning)]">{field.semantic}</span>
                ) : (
                  '—'
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-[var(--analytics-text-muted)] m-0 mt-2">
        The Semantic column is a proposed extension, not part of the published model today.
      </p>
    </section>
  )
}
