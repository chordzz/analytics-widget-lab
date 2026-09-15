/**
 * Data sources — what a widget can be pointed at.
 *
 * Shape first, rows second. When picking data for a widget the question is
 * "does this have a time dimension and two measures", not "what is in row 4",
 * so the field summary leads and a sample is available behind it.
 *
 * Since the builder now starts from data, this screen is a legitimate entry
 * point to it rather than just reference material — hence the shortcut in each
 * card's footer, which opens the composer already bound to that source.
 */

import { useState } from 'react'
import { useCatalogue, useDataset, useRows } from '../data/AnalyticsData'
import { CatalogueProblem, NoDatasets } from '../data/CatalogueState'
import type { WidgetRenderState } from '../../retrieval/render-state'
import { DataTable } from '../widgets/primitives'
import { WidgetCard } from '../widgets/WidgetCard'
import { typesFor } from '../builder/requirements'
import { useComposeIntent } from '../builder/useComposeIntent'
import { AccessRecordPanel } from './AccessRecordPanel'
import type { Dataset } from '../data/types'
import type { DatasetSummary } from '../../catalogue/port'
import type { ScreenId } from '../shell/nav'

export function DataScreen({ onNavigate }: { onNavigate: (screen: ScreenId) => void }) {
  const { summaries, loading, failure } = useCatalogue()

  if (loading) {
    return (
      <p className="a-muted" style={{ margin: 0 }}>
        Loading the catalogue…
      </p>
    )
  }

  /*
   * Four outcomes, told apart.
   *
   * This screen used to render one sentence for all of them — a `403`, a `503`
   * and a Catalogue with nothing in it all arrived as "0 datasets", under copy
   * that called them mock. They need three different things from whoever is
   * reading: ask for access, wait and retry, publish something. Collapsing them
   * is the same mistake the six render states exist to prevent, on the screen
   * someone opens first to find out whether the backend works at all.
   */
  if (failure) return <CatalogueProblem failure={failure} />
  if (summaries.length === 0) return <NoDatasets />

  return (
    <>
      <div style={{ display: 'grid', gap: 'var(--a-space-4)' }}>
        <p className="a-muted" style={{ margin: 0 }}>
          {summaries.length} data {summaries.length === 1 ? 'source' : 'sources'} you can build
          from.
        </p>

        {summaries.map((summary) => (
          <DatasetCard key={summary.id} summary={summary} onNavigate={onNavigate} />
        ))}
      </div>

      <AccessRecordPanel />
    </>
  )
}

/**
 * One source, described only when opened.
 *
 * **The listing costs one request now.** It used to cost one *per Dataset*: the
 * screen asked the Catalogue for every Field of every source on every visit, so
 * fifty sources meant fifty-one requests before anything was on screen. All of
 * it to draw two things — the Field pills and the "N widget types can show this"
 * count — that only matter once somebody is considering this particular source.
 *
 * So the collapsed card is drawn from the listing alone, which already carries
 * the shape summary, and the detail is fetched when it is asked for. Which is
 * also the order the screen was designed around: shape first, specifics second.
 */
function DatasetCard({
  summary,
  onNavigate,
}: {
  summary: DatasetSummary
  onNavigate: (screen: ScreenId) => void
}) {
  const [open, setOpen] = useState(false)
  const { composeWith } = useComposeIntent()

  return (
    <WidgetCard
      title={summary.name}
      subtitle={summary.sourceSystem}
      actions={[
        {
          label: open ? 'Hide details' : 'Show details',
          onSelect: () => setOpen(!open),
        },
      ]}
      footer={
        <div className="a-source-foot">
          <span className="a-muted">
            {summary.timeDimensionCount} time · {summary.dimensionCount} dimension
            {summary.dimensionCount === 1 ? '' : 's'} · {summary.measureCount} measure
            {summary.measureCount === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            className="a-button a-button--primary"
            onClick={() => {
              composeWith(summary.id)
              onNavigate('create')
            }}
          >
            Build a widget
          </button>
        </div>
      }
    >
      <div>
        <p className="a-muted" style={{ margin: 0 }}>
          {summary.description}
        </p>
        {open && <DatasetDetail datasetId={summary.id} />}
      </div>
    </WidgetCard>
  )
}

/**
 * The Fields, what can be built from them, and a sample.
 *
 * Mounted only while a card is open, which is what makes the listing cheap. It
 * asks the Catalogue and the retrieval port separately, because they are
 * separate ports answering separate questions — and only the second one touches
 * records.
 */
function DatasetDetail({ datasetId }: { datasetId: string }) {
  const { dataset, loading, failure } = useDataset(datasetId)

  if (loading) {
    return (
      <p className="a-muted" style={{ margin: 'var(--a-space-3) 0 0', fontSize: 'var(--a-text-xs)' }}>
        Loading details…
      </p>
    )
  }

  if (failure) {
    return (
      <div style={{ marginTop: 'var(--a-space-3)' }}>
        <CatalogueProblem failure={failure} />
      </div>
    )
  }

  if (!dataset) {
    // The Catalogue answered and has no such Dataset. It was listed a moment
    // ago, so it has been withdrawn since — not a fault, and not an empty one.
    return (
      <p className="a-muted" style={{ margin: 'var(--a-space-3) 0 0', fontSize: 'var(--a-text-xs)' }}>
        This source is no longer available.
      </p>
    )
  }

  const buildable = typesFor(dataset).length

  return (
    <>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 'var(--a-space-2)',
          marginTop: 'var(--a-space-3)',
        }}
      >
        {dataset.fields.map((field) => (
          <span
            key={field.key}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '3px 9px',
              border: '1px solid var(--a-border)',
              borderRadius: 999,
              fontSize: 'var(--a-text-xs)',
              color: 'var(--a-text)',
            }}
          >
            {field.label}
            <span style={{ color: 'var(--a-text-muted)' }}>
              {field.role === 'time-dimension'
                ? 'time'
                : field.role === 'measure'
                  ? 'measure'
                  : 'dimension'}
            </span>
          </span>
        ))}
      </div>

      <p
        style={{
          margin: 'var(--a-space-3) 0 0',
          fontSize: 'var(--a-text-xs)',
          color: 'var(--a-text-muted)',
        }}
      >
        {/* The useful half: whether this source is versatile or good for one thing. */}
        {buildable} widget {buildable === 1 ? 'type' : 'types'} can show this
      </p>

      {/* `maxHeight` without `overflow` clips nothing — the sample ran on over
          the cards below it. */}
      <div style={{ marginTop: 'var(--a-space-4)', maxHeight: 280, overflowY: 'auto' }}>
        <SamplePreview dataset={dataset} />
      </div>
    </>
  )
}

/**
 * A few records from one source.
 *
 * Its own component because it needs a hook, and a hook cannot be called from
 * inside the list's `map`. That is a React rule rather than a design one, but
 * the split it forces is right anyway: the listing is Catalogue work and the
 * sample is retrieval work, and they are different ports.
 */
function SamplePreview({ dataset }: { dataset: Dataset }) {
  const state = useRows(dataset.id, 20)

  if (state.status === 'ready') {
    return <DataTable data={state.rows} columns={dataset.fields} limit={20} />
  }

  /*
   * The same six states a Widget draws, in one line each.
   *
   * This used to say "No records to show" for every one of them, which told a
   * Viewer the Dataset was empty when the truth might be that they are not
   * allowed to read it — FR-DA-11's exact prohibition, reached through a
   * ternary. The sample is the one place on this screen that touches real
   * records, so it is the one place those answers differ.
   */
  return (
    <p className="a-muted" style={{ margin: 0, fontSize: 'var(--a-text-xs)' }}>
      {sampleNote(state)}
    </p>
  )
}

export function sampleNote(state: WidgetRenderState): string {
  switch (state.status) {
    case 'loading':
      return 'Loading a sample…'
    case 'empty':
      return 'No records to show.'
    case 'denied':
      // Not "no records": the Dataset may be full. What is absent is permission,
      // and that is a different thing to tell someone.
      return 'You do not have access to the records behind this source.'
    case 'withdrawn':
      return 'This source has been withdrawn by the product that publishes it.'
    case 'failed':
      return state.message || 'The sample could not be loaded.'
    default:
      return 'No records to show.'
  }
}
