/**
 * The Analytics Administrator surface — UC-07.
 *
 * Two halves, matching the two things an Administrator is accountable for:
 * seeing the whole Catalogue (FR-GV-01), and ruling on submissions before they
 * enter general use (FR-GV-02, FR-GV-03, FR-GV-04).
 *
 * The review queue draws a distinction the requirements imply but never state:
 * an *incomplete* submission and an *overlapping* one are different problems.
 * The first is mechanical and not an Administrator's to waive; the second is
 * exactly the judgement they exist to make.
 */

import { useCallback, useEffect, useState } from 'react'
import { usePorts } from '../composition-root'
import type { Dataset } from '../domain/dataset'
import type { PendingPublication } from '../governance/port'

export function GovernanceSurface() {
  const { ports, viewer } = usePorts()
  const [permitted, setPermitted] = useState<boolean | null>(null)
  const [catalogue, setCatalogue] = useState<Dataset[]>([])
  const [pending, setPending] = useState<PendingPublication[]>([])

  const load = useCallback(async () => {
    const [cat, pend] = await Promise.all([
      ports.governance.reviewCatalogue(),
      ports.governance.pendingPublications(),
    ])
    setCatalogue(cat)
    setPending(pend)
  }, [ports.governance])

  useEffect(() => {
    ports.authorization.mayAdministerCatalogue(viewer).then(setPermitted)
  }, [ports.authorization, viewer])

  useEffect(() => {
    if (permitted) load()
  }, [permitted, load])

  if (permitted === null) return null

  if (!permitted) {
    return (
      <div className="rounded-lg border border-[var(--analytics-border)] bg-[var(--analytics-surface)] p-4">
        <p className="text-sm text-[var(--analytics-text)] m-0">
          Catalogue governance is restricted to the Analytics Administrator user class.
        </p>
        <p className="text-xs text-[var(--analytics-text-secondary)] m-0 mt-1 max-w-2xl">
          {viewer.displayName} does not hold it. Switch to the Analytics administrator to review the
          Catalogue.
        </p>
      </div>
    )
  }

  const awaiting = pending.filter((p) => p.status === 'pending')

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[var(--analytics-border)] bg-[var(--analytics-surface)] p-4">
        <h2 className="text-sm font-medium text-[var(--analytics-text)] m-0">Review queue</h2>
        <p className="text-xs text-[var(--analytics-text-secondary)] m-0 mt-1 max-w-3xl">
          Submissions are held here until ruled on, so an overlap can be caught before the Dataset
          enters general use rather than after two versions of a figure are already circulating.
        </p>
        <p className="text-xs text-[var(--analytics-text-muted)] m-0 mt-2">
          {awaiting.length} awaiting a ruling · {pending.length - awaiting.length} resolved
        </p>
      </section>

      {pending.map((entry) => (
        <PendingCard
          key={entry.dataset.id}
          entry={entry}
          onResolve={async (outcome, note) => {
            await ports.governance.resolve(entry.dataset.id, outcome, note)
            await load()
          }}
        />
      ))}

      <CatalogueReview datasets={catalogue} />
    </div>
  )
}

function PendingCard({
  entry,
  onResolve,
}: {
  entry: PendingPublication
  onResolve: (outcome: 'admitted' | 'rejected', note: string) => Promise<void>
}) {
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const blocked = entry.violations.length > 0
  const resolved = entry.status !== 'pending'

  const act = async (outcome: 'admitted' | 'rejected') => {
    setError(null)
    try {
      await onResolve(outcome, note.trim() || '(no note)')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not record the ruling.')
    }
  }

  return (
    <section className="rounded-lg border border-[var(--analytics-border)] bg-[var(--analytics-surface)] p-4 space-y-3">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-sm font-medium text-[var(--analytics-text)] m-0">
            {entry.dataset.name}
          </h3>
          <p className="text-xs text-[var(--analytics-text-muted)] m-0 mt-0.5">
            {entry.dataset.sourceSystem} · submitted by {entry.submittedBy}
          </p>
        </div>
        <StatusChip entry={entry} />
      </header>

      <p className="text-xs text-[var(--analytics-text-secondary)] m-0">
        {entry.dataset.description}
      </p>

      {/* FR-GV-04 — mechanical, and not the Administrator's to waive. */}
      {blocked && (
        <div className="rounded border p-2" style={{ borderColor: 'var(--analytics-status-negative)' }}>
          <p className="text-xs m-0" style={{ color: 'var(--analytics-status-negative)' }}>
            Does not satisfy the publication contract. It cannot enter general use until the
            publisher fixes this — it is not a judgement call.
          </p>
          <ul className="text-xs text-[var(--analytics-text-secondary)] m-0 mt-1 pl-4">
            {entry.violations.map((violation, index) => (
              <li key={index}>
                <span className="text-[var(--analytics-text-muted)]">{violation.requirement}</span>{' '}
                {violation.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* FR-GV-02, FR-GV-03 — the judgement call. */}
      {entry.overlaps.length > 0 && (
        <div className="rounded border p-2" style={{ borderColor: 'var(--analytics-status-warning)' }}>
          <p className="text-xs m-0" style={{ color: 'var(--analytics-status-warning)' }}>
            Overlaps {new Set(entry.overlaps.map((o) => o.incumbentId)).size} Dataset
            {new Set(entry.overlaps.map((o) => o.incumbentId)).size === 1 ? '' : 's'} already in the
            Catalogue.
          </p>
          <ul className="list-none p-0 m-0 mt-1 space-y-1">
            {entry.overlaps.map((overlap, index) => (
              <li key={index} className="text-xs text-[var(--analytics-text-secondary)]">
                <span className="text-[var(--analytics-text)]">{overlap.incumbentName}</span>{' '}
                <span className="text-[var(--analytics-text-muted)]">
                  ({overlap.kind} match, {Math.round(overlap.confidence * 100)}%)
                </span>
                <br />
                {overlap.detail}
              </li>
            ))}
          </ul>
        </div>
      )}

      {entry.overlaps.length === 0 && !blocked && (
        <p className="text-xs text-[var(--analytics-text-muted)] m-0">
          No overlap detected against the current Catalogue.
        </p>
      )}

      {resolved ? (
        <p className="text-xs text-[var(--analytics-text-secondary)] m-0">
          Ruled: <strong>{entry.resolution?.outcome}</strong> — {entry.resolution?.note}
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Note — why this ruling"
            className="flex-1 min-w-48 rounded border border-[var(--analytics-border)] bg-[var(--analytics-surface)] text-[var(--analytics-text)] px-2 py-1 text-xs"
          />
          <button
            onClick={() => act('admitted')}
            disabled={blocked}
            title={blocked ? 'Blocked by the publication contract' : undefined}
            className="text-xs rounded border px-2 py-1 border-[var(--analytics-border)] text-[var(--analytics-text)] disabled:opacity-40"
          >
            Admit to general use
          </button>
          <button
            onClick={() => act('rejected')}
            className="text-xs rounded border px-2 py-1 border-[var(--analytics-border)] text-[var(--analytics-text)]"
          >
            Reject &amp; coordinate
          </button>
        </div>
      )}

      {error && (
        <p className="text-xs m-0" style={{ color: 'var(--analytics-status-negative)' }}>
          {error}
        </p>
      )}
    </section>
  )
}

function StatusChip({ entry }: { entry: PendingPublication }) {
  const colour =
    entry.status === 'in-general-use'
      ? 'var(--analytics-status-positive)'
      : entry.status === 'rejected'
        ? 'var(--analytics-status-neutral)'
        : 'var(--analytics-status-warning)'

  const label =
    entry.status === 'in-general-use'
      ? 'In general use'
      : entry.status === 'rejected'
        ? 'Rejected'
        : 'Pending review'

  return (
    <span
      className="text-xs rounded-full border px-2 py-0.5"
      style={{ color: colour, borderColor: colour }}
    >
      {label}
    </span>
  )
}

function CatalogueReview({ datasets }: { datasets: Dataset[] }) {
  return (
    <section className="rounded-lg border border-[var(--analytics-border)] bg-[var(--analytics-surface)] p-4">
      <h2 className="text-sm font-medium text-[var(--analytics-text)] m-0">Complete Catalogue</h2>
      <p className="text-xs text-[var(--analytics-text-secondary)] m-0 mt-1 max-w-3xl">
        Every published Dataset, not only those this identity may consume. Reviewing a description
        is not consuming data — nothing on this surface returns records, which is what makes the
        wider view safe.
      </p>

      <div className="overflow-x-auto mt-3">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-[var(--analytics-text-muted)]">
              <th className="font-normal py-1">Dataset</th>
              <th className="font-normal py-1">Source System</th>
              <th className="font-normal py-1">Classification</th>
              <th className="font-normal py-1">Fields</th>
            </tr>
          </thead>
          <tbody className="text-[var(--analytics-text-secondary)] align-top">
            {datasets.map((dataset) => (
              <tr key={dataset.id} className="border-t border-[var(--analytics-border)]">
                <td className="py-1.5 pr-3">
                  <span className="text-[var(--analytics-text)]">{dataset.name}</span>
                  <br />
                  <span className="text-[var(--analytics-text-muted)]">{dataset.description}</span>
                </td>
                <td className="py-1.5 pr-3 whitespace-nowrap">{dataset.sourceSystem}</td>
                <td className="py-1.5 pr-3 whitespace-nowrap">
                  {dataset.classification}
                  {dataset.exposesPersonalData && (
                    <>
                      <br />
                      <span style={{ color: 'var(--analytics-status-warning)' }}>personal data</span>
                    </>
                  )}
                </td>
                <td className="py-1.5">
                  {dataset.fields.map((field) => (
                    <div key={field.key}>
                      <span className="text-[var(--analytics-text)]">{field.label}</span>{' '}
                      <span className="text-[var(--analytics-text-muted)]">
                        {field.role}
                        {field.role === 'measure' && ` · ${field.aggregations.join(', ')}`}
                      </span>
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
