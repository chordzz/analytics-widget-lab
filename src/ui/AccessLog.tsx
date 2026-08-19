/**
 * FR-DA-14 — the personal-data access record.
 *
 * Present as a surface because the requirement is that it can "later be
 * established who accessed such data and when". A log nothing can read
 * establishes nothing, so the reading half is part of the requirement rather
 * than a nicety.
 */

import { useEffect, useState } from 'react'
import { usePorts } from '../composition-root'
import { catalogueFixtures } from '../catalogue/fixtures'
import type { AccessRecord } from '../access/port'

export function AccessLog() {
  const { ports } = usePorts()
  const [entries, setEntries] = useState<AccessRecord[]>([])

  useEffect(() => {
    const refresh = () => ports.accessRecorder.list().then(setEntries)
    refresh()
    return ports.accessRecorder.subscribe(refresh)
  }, [ports.accessRecorder])

  const personalDataDatasets = catalogueFixtures.filter((d) => d.exposesPersonalData)

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[var(--analytics-border)] bg-[var(--analytics-surface)] p-4">
        <h2 className="text-sm font-medium text-[var(--analytics-text)] m-0">
          Personal-data access record
        </h2>
        <p className="text-xs text-[var(--analytics-text-secondary)] m-0 mt-1 max-w-3xl">
          Access is recorded when a Dataset carrying a personal-data classification is actually
          served — not when it is merely requested. A denied or withdrawn retrieval exposes nothing,
          so there is nothing to account for and nothing is written.
        </p>
        <p className="text-xs text-[var(--analytics-text-muted)] m-0 mt-2">
          Datasets under this obligation:{' '}
          {personalDataDatasets.map((d) => d.name).join(', ') || 'none'}.
        </p>
      </section>

      <section className="rounded-lg border border-[var(--analytics-border)] bg-[var(--analytics-surface)] p-4">
        {entries.length === 0 ? (
          <p className="text-sm text-[var(--analytics-text-muted)] m-0">
            Nothing recorded yet. Open a Dashboard containing a Widget bound to a personal-data
            Dataset, and an entry will appear here.
          </p>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-[var(--analytics-text-muted)]">
                <th className="font-normal py-1">When</th>
                <th className="font-normal py-1">Who</th>
                <th className="font-normal py-1">Dataset</th>
              </tr>
            </thead>
            <tbody className="text-[var(--analytics-text-secondary)]">
              {entries.map((entry, index) => (
                <tr key={index} className="border-t border-[var(--analytics-border)]">
                  <td className="py-1 font-mono">{entry.at.replace('T', ' ').slice(0, 19)}</td>
                  <td className="py-1 text-[var(--analytics-text)]">{entry.viewerName}</td>
                  <td className="py-1">{entry.datasetName}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
