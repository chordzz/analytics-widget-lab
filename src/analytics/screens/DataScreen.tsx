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
import { DataTable } from '../widgets/primitives'
import { WidgetCard } from '../widgets/WidgetCard'
import { typesFor } from '../builder/requirements'
import { useComposeIntent } from '../builder/useComposeIntent'
import type { Dataset } from '../data/types'
import type { ScreenId } from '../shell/nav'

export function DataScreen({ onNavigate }: { onNavigate: (screen: ScreenId) => void }) {
  const [openId, setOpenId] = useState<string | null>(null)
  const { composeWith } = useComposeIntent()
  const { datasets, loading } = useDatasets()

  if (loading) {
    return (
      <p className="a-muted" style={{ margin: 0 }}>
        Loading the catalogue…
      </p>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 'var(--a-space-4)' }}>
      <p className="a-muted" style={{ margin: 0 }}>
        {datasets.length} mock datasets. Rows are generated from a fixed seed, so a widget looks
        identical between runs and screenshots stay comparable.
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
                <div style={{ marginTop: 'var(--a-space-4)', maxHeight: 280 }}>
                  <SamplePreview dataset={dataset} />
                </div>
              )}
            </div>
          </WidgetCard>
        )
      })}
    </div>
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
  const rows = useRows(dataset.id, 20)

  if (rows.length === 0) {
    return (
      <p className="a-muted" style={{ margin: 0, fontSize: 'var(--a-text-xs)' }}>
        No records to show.
      </p>
    )
  }

  return <DataTable data={rows} columns={dataset.fields} limit={20} />
}
