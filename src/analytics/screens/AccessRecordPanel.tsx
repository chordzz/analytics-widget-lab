/**
 * FR-DA-14 — who saw personal data, and when.
 *
 * Merge Plan Stage 6.5. Recording happens at the retrieval boundary
 * (`FixtureRetrieval`); this only shows what was recorded.
 *
 * It sits on **Data sources** rather than behind a nav item of its own, and that
 * is a compromise worth naming: an access record is read by someone accounting
 * for access, not by someone building a widget, so it belongs in an
 * administrative surface. Finding 12 says the Analytics Administrator user class
 * does not exist in IAM, so there is no such surface to put it in and no
 * identity that could be granted it. Data sources is the nearest honest home —
 * it is already where a Dataset's classification is shown — and this moves the
 * day that role lands.
 *
 * The log is append-only by construction: `InMemoryAccessRecorder` has no method
 * to amend or remove an entry, because a record that can be edited establishes
 * nothing.
 */

import { useEffect, useState } from 'react'
import { useAnalyticsData } from '../data/AnalyticsData'
import type { AccessRecord } from '../../access/port'

export function AccessRecordPanel() {
  const entries = useAccessRecord()
  const { accessRecordIsComplete } = useAnalyticsData()

  /*
   * Withheld rather than shown empty when nothing feeds it.
   *
   * The recorder is fed by the retrieval adapter, and only the fixture one does.
   * Against a real Source System every retrieval goes straight past, so the log
   * would sit at zero for ever — under a heading promising "every retrieval of a
   * source that carries personal data". That does not read as *not wired up*, it
   * reads as *nobody has read any personal data*, which is an assertion, and a
   * false one.
   *
   * There is nothing to fetch instead: FR-DA-14 binds the Source System — the
   * publication contract lists it under retrieval obligations — and the API
   * publishes no endpoint for reading such a log. So this says where the record
   * actually lives and stops claiming to be it.
   */
  if (!accessRecordIsComplete) {
    return (
      <section className="a-panel" aria-labelledby="access-record-heading">
        <header className="a-panel__head">
          <div>
            <h3 id="access-record-heading" className="a-panel__title">
              Access record
            </h3>
            <p className="a-panel__note">
              Kept by the product that owns the data, not here.
            </p>
          </div>
        </header>
        <p className="a-muted">
          Retrievals are recorded by each Source System as it serves them (FR-DA-14).
          Analytics forwards the viewer&rsquo;s own token and holds no log of its own, so
          there is nothing for this panel to show.
        </p>
      </section>
    )
  }

  return (
    <section className="a-panel" aria-labelledby="access-record-heading">
      <header className="a-panel__head">
        <div>
          <h3 id="access-record-heading" className="a-panel__title">
            Access record
          </h3>
          <p className="a-panel__note">
            Every retrieval of a source that carries personal data. Newest first.
          </p>
        </div>
        <span className="a-badge">{entries.length}</span>
      </header>

      {entries.length === 0 ? (
        /*
         * An empty log is the normal state on a fresh session, and it has to
         * read as "nothing has happened yet" rather than as a broken panel —
         * so it says which sources would appear here.
         */
        <p className="a-muted">
          Nothing recorded yet. Viewing a widget bound to Activity events or
          Transactions adds an entry.
        </p>
      ) : (
        <ol className="a-record">
          {entries.map((entry, index) => (
            <li key={`${entry.at}-${entry.datasetId}-${index}`} className="a-record__row">
              <span className="a-record__when">{when(entry.at)}</span>
              <span className="a-record__who">{entry.viewerName}</span>
              <span className="a-record__what">{entry.datasetName}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/**
 * The record, refreshed when something is added.
 *
 * `list()` is async and the recorder is append-only, so a snapshot taken on
 * mount goes stale the moment a widget retrieves. Subscribing is what makes the
 * panel show an access that happened while it was open — which is the only way
 * to see that recording works at all.
 */
function useAccessRecord(): AccessRecord[] {
  const { recorder } = useAnalyticsData()
  const [entries, setEntries] = useState<AccessRecord[]>([])

  useEffect(() => {
    let live = true
    const read = () => {
      void recorder.list().then((next) => {
        if (live) setEntries(next)
      })
    }

    read()
    // `subscribe` is on the in-memory implementation rather than the port: a
    // real recorder would be polled or pushed to, and neither belongs in the
    // port's contract yet. Absent, the panel simply shows what it read once.
    const unsubscribe =
      'subscribe' in recorder && typeof recorder.subscribe === 'function'
        ? (recorder.subscribe as (listener: () => void) => () => void)(read)
        : undefined

    return () => {
      live = false
      unsubscribe?.()
    }
  }, [recorder])

  return entries
}

/** Date and time to the minute. Seconds are noise for an audit read. */
function when(iso: string): string {
  const at = new Date(iso)
  return Number.isNaN(at.getTime())
    ? iso
    : at.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
}
