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
import { useDatasets, useRows } from '../data/AnalyticsData'
import { CatalogueProblem, NoDatasets } from '../data/CatalogueState'
import type { WidgetRenderState } from '../../retrieval/render-state'
import { DataTable } from '../widgets/primitives'
import { WidgetCard } from '../widgets/WidgetCard'
import { typesFor } from '../builder/requirements'
import { useComposeIntent } from '../builder/useComposeIntent'
import { AccessRecordPanel } from './AccessRecordPanel'
import type { Dataset } from '../data/types'
import type { ScreenId } from '../shell/nav'

export function DataScreen({ onNavigate }: { onNavigate: (screen: ScreenId) => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const { composeWith } = useComposeIntent()
  const { datasets, loading, failure } = useDatasets()

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
  if (datasets.length === 0) return <NoDatasets />

  return (
    <>
      <div style={{ display: 'grid', gap: 'var(--a-space-4)' }}>
      <p className="a-muted" style={{ margin: 0 }}>
        {datasets.length} data {datasets.length === 1 ? 'source' : 'sources'} you can build from.
      </p>

      {datasets.map((dataset) => {
        const open = openId === dataset.id
        const buildable = typesFor(dataset).length
        const counts = {
          time: dataset.fields.filter((f) => f.role === 'time-dimension').length,
          dimensions: dataset.fields.filter((f) => f.role === 'dimension').length,
          measures: dataset.fields.filter((f) => f.role === 'measure').length,
        }

        return (
          <WidgetCard
            key={dataset.id}
            title={dataset.name}
            subtitle={dataset.sourceSystem}
            actions={[
              {
                label: open ? 'Hide sample' : 'Show sample',
                onSelect: () => setOpenId(open ? null : dataset.id),
              },
            ]}
            footer={
              <div className="a-source-foot">
                <span className="a-muted">
                  {/* The count is the useful half: it says at a glance whether
                      this source is versatile or only good for one thing. */}
                  {buildable} widget {buildable === 1 ? 'type' : 'types'} can show this
                </span>
                <button
                  type="button"
                  className="a-button a-button--primary"
                  onClick={() => {
                    composeWith(dataset.id)
                    onNavigate('create')
                  }}
                >
                  Build a widget
                </button>
              </div>
            }
          >
            <div>
              <p className="a-muted" style={{ margin: '0 0 var(--a-space-3)' }}>
                {dataset.description}
              </p>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--a-space-2)' }}>
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
                      {field.role === 'time-dimension' ? 'time' : field.role === 'measure' ? 'measure' : 'dimension'}
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
                {counts.time} time · {counts.dimensions} dimension
                {counts.dimensions === 1 ? '' : 's'} · {counts.measures} measure
                {counts.measures === 1 ? '' : 's'}
              </p>

              {open && (
                /* `maxHeight` without `overflow` clips nothing — the sample
                   ran on over the cards below it. */
                <div
                  style={{
                    marginTop: 'var(--a-space-4)',
                    maxHeight: 280,
                    overflowY: 'auto',
                  }}
                >
                  <SamplePreview dataset={dataset} />
                </div>
              )}
            </div>
          </WidgetCard>
        )
      })}
      </div>

      <AccessRecordPanel />
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
