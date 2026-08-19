/**
 * The composed Dashboard — UC-03.
 *
 * Two things are on show here beyond simply rendering Widgets:
 *
 *  - Widgets bound to Datasets from unrelated Source Systems sit together
 *    without comment (FR-CO-03). The absence of any special handling is the
 *    feature.
 *  - A Control at the top reaches the Widgets whose Datasets support it and
 *    leaves the rest alone (FR-CO-06) — and *says* which, because a Viewer
 *    otherwise cannot tell an unaffected Widget from a stale one.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { usePorts } from '../composition-root'
import { WidgetHost } from '../widget-runtime/WidgetHost'
import { describeScope } from '../domain/dashboard'
import { canViewDashboard } from '../access/dashboard-access'
import {
  DASHBOARD_COLUMNS,
  clampSpan,
  dateRangeControl,
  presentationToggleControl,
  section,
  selectControl,
  viewSwitcherControl,
} from '../domain/composition'
import { effectFor } from '../composition/correspondence'
import { ControlBar, switchableTypeOptions } from './ControlBar'
import { AccessPanel } from './AccessPanel'
import { registeredRendererIds } from '../widget-runtime/renderer'
import type { Control, ControlValues } from '../domain/composition'
import type { Dashboard } from '../domain/dashboard'
import type { Dataset } from '../domain/dataset'

export function DashboardView({ reloadToken }: { reloadToken: number }) {
  const { ports, viewer } = usePorts()
  const [dashboards, setDashboards] = useState<Dashboard[]>([])
  const [datasets, setDatasets] = useState<Record<string, Dataset>>({})
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    const loaded = await ports.dashboards.list(viewer)
    setDashboards(loaded)

    // Descriptions come from the Catalogue, not from retrieval — describing a
    // Dataset costs no data (FR-DP-11).
    const ids = new Set(loaded.flatMap((d) => Object.values(d.widgets).map((w) => w.datasetId)))
    const described = await Promise.all(
      [...ids].map(async (id) => [id, await ports.catalogue.describe(id, viewer)] as const),
    )
    setDatasets(Object.fromEntries(described.filter(([, d]) => d !== null) as [string, Dataset][]))
  }, [ports, viewer])

  useEffect(() => {
    let abandoned = false
    load().catch(() => {
      if (!abandoned) setDashboards([])
    })
    return () => {
      abandoned = true
    }
  }, [load, reloadToken])

  const mutate = async (next: Dashboard) => {
    await ports.dashboards.save(next, viewer)
    setDashboards((current) => current.map((d) => (d.id === next.id ? next : d)))
  }

  if (dashboards.length === 0) {
    return (
      <p className="text-sm text-[var(--analytics-text-muted)]">
        No Dashboards visible to {viewer.displayName}. Author one on the Authoring tab, or switch
        Viewer.
      </p>
    )
  }

  return (
    <div className="space-y-8">
      {dashboards.map((dashboard) => (
        <DashboardPanel
          key={dashboard.id}
          dashboard={dashboard}
          datasets={datasets}
          editing={editing}
          onToggleEditing={() => setEditing((e) => !e)}
          onChange={mutate}
        />
      ))}
    </div>
  )
}

function DashboardPanel({
  dashboard,
  datasets,
  editing,
  onToggleEditing,
  onChange,
}: {
  dashboard: Dashboard
  datasets: Record<string, Dataset>
  editing: boolean
  onToggleEditing: () => void
  onChange: (next: Dashboard) => void
}) {
  const { ports, viewer } = usePorts()
  const [controlValues, setControlValues] = useState<ControlValues>({})

  const widgets = useMemo(
    () =>
      [...dashboard.placements]
        .sort((a, b) => a.order - b.order)
        .map((placement) => ({ placement, widget: dashboard.widgets[placement.widgetId] }))
        .filter((entry) => entry.widget !== undefined),
    [dashboard],
  )

  const isAuthor = dashboard.authorId === viewer.id

  const addControl = (control: Control) =>
    onChange({ ...dashboard, controls: [...dashboard.controls, control] })

  const replaceControl = (next: Control) =>
    onChange({
      ...dashboard,
      controls: dashboard.controls.map((c) => (c.id === next.id ? next : c)),
    })

  const removeControl = (id: string) =>
    onChange({ ...dashboard, controls: dashboard.controls.filter((c) => c.id !== id) })

  const has = (type: string) => dashboard.controls.some((c) => c.controlType === type)

  const addSection = () =>
    onChange({
      ...dashboard,
      sections: [...dashboard.sections, section(`s${dashboard.sections.length + 1}`, 'Section')],
    })

  const setSpan = (widgetId: string, span: number) =>
    onChange({
      ...dashboard,
      placements: dashboard.placements.map((p) =>
        p.widgetId === widgetId ? { ...p, span: clampSpan(span) } : p,
      ),
    })

  const move = (widgetId: string, delta: number) => {
    const sorted = [...dashboard.placements].sort((a, b) => a.order - b.order)
    const index = sorted.findIndex((p) => p.widgetId === widgetId)
    const target = index + delta
    if (index < 0 || target < 0 || target >= sorted.length) return
    ;[sorted[index], sorted[target]] = [sorted[target], sorted[index]]
    onChange({
      ...dashboard,
      placements: sorted.map((placement, order) => ({ ...placement, order })),
    })
  }

  return (
    <section className="space-y-3">
      <header className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-medium text-[var(--analytics-text)] m-0">{dashboard.name}</h2>
          <p className="text-xs text-[var(--analytics-text-muted)] m-0 mt-0.5">
            {describeScope(dashboard.scope)} · {widgets.length} Widget
            {widgets.length === 1 ? '' : 's'} ·{' '}
            {new Set(widgets.map((w) => datasets[w.widget.datasetId]?.sourceSystem)).size} Source
            System
            {new Set(widgets.map((w) => datasets[w.widget.datasetId]?.sourceSystem)).size === 1
              ? ''
              : 's'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <StatusBadge status={dashboard.status} />
          {isAuthor && (
            <button
              onClick={onToggleEditing}
              className="text-xs rounded border px-2 py-1 border-[var(--analytics-border)] text-[var(--analytics-text)]"
            >
              {editing ? 'Done' : 'Edit layout'}
            </button>
          )}
          {isAuthor && dashboard.status === 'draft' && (
            <button
              onClick={async () => {
                await ports.dashboards.publish(dashboard.id, viewer)
                onChange({ ...dashboard, status: 'published' })
              }}
              className="text-xs rounded border px-2 py-1 border-[var(--analytics-border)] text-[var(--analytics-text)]"
            >
              Publish
            </button>
          )}
        </div>
      </header>

      {editing && isAuthor && (
        <div className="flex flex-wrap gap-2 rounded border border-dashed border-[var(--analytics-border)] p-2">
          <button
            onClick={() => addControl(dateRangeControl('range'))}
            disabled={has('date-range')}
            className="text-xs rounded border px-2 py-1 border-[var(--analytics-border)] text-[var(--analytics-text)] disabled:opacity-40"
          >
            Add date-range Control
          </button>
          <button
            onClick={() => addControl(selectControl('filter', 'Filter'))}
            disabled={has('select')}
            className="text-xs rounded border px-2 py-1 border-[var(--analytics-border)] text-[var(--analytics-text)] disabled:opacity-40"
          >
            Add filter Control
          </button>
          <button
            onClick={() => addControl(presentationToggleControl('values'))}
            disabled={has('presentation-toggle')}
            className="text-xs rounded border px-2 py-1 border-[var(--analytics-border)] text-[var(--analytics-text)] disabled:opacity-40"
          >
            Add presentation toggle
          </button>
          <button
            onClick={() =>
              addControl(
                viewSwitcherControl('view', switchableTypeOptions(), [
                  'categorical-comparison',
                  'tabular',
                  'trend',
                ]),
              )
            }
            disabled={has('view-switcher')}
            className="text-xs rounded border px-2 py-1 border-[var(--analytics-border)] text-[var(--analytics-text)] disabled:opacity-40"
          >
            Add view switcher
          </button>
          <button
            onClick={addSection}
            className="text-xs rounded border px-2 py-1 border-[var(--analytics-border)] text-[var(--analytics-text)]"
          >
            Add Section
          </button>
          <span className="text-xs text-[var(--analytics-text-muted)] self-center">
            Composition Elements draw no data of their own.
          </span>
        </div>
      )}

      {editing && isAuthor && <AccessPanel dashboard={dashboard} onChange={onChange} />}

      {dashboard.controls.map((control) => (
        <ControlBar
          key={control.id}
          control={control}
          widgets={widgets.map((w) => w.widget)}
          datasets={datasets}
          values={controlValues}
          onValueChange={(id, value) =>
            setControlValues((current) => ({ ...current, [id]: value }))
          }
          editing={editing && isAuthor}
          onControlChange={replaceControl}
          onRemove={() => removeControl(control.id)}
        />
      ))}

      <div className={`grid grid-cols-${DASHBOARD_COLUMNS} gap-4`} style={{ display: 'grid', gridTemplateColumns: `repeat(${DASHBOARD_COLUMNS}, minmax(0, 1fr))` }}>
        {widgets.map(({ placement, widget }) => {
          const dataset = datasets[widget.datasetId]

          const rendererIds = new Set(registeredRendererIds())
          const effect = dataset
            ? effectFor(dashboard.controls, controlValues, widget, dataset, (id) =>
                rendererIds.has(id),
              )
            : undefined
          const reached = Boolean(
            effect &&
              (effect.query.timeRange ||
                effect.query.filters ||
                Object.keys(effect.presentation).length > 0 ||
                effect.visualizationTypeId),
          )

          return (
            <div
              key={placement.widgetId}
              style={{ gridColumn: `span ${placement.span} / span ${placement.span}` }}
              className="min-w-0 space-y-1"
            >
              <div className="h-64">
                {dataset ? (
                  <WidgetHost
                    widget={widget}
                    dataset={dataset}
                    retrieval={ports.retrieval}
                    viewer={viewer}
                    effect={effect}
                  />
                ) : (
                  <UnavailableWidget title={widget.title ?? 'Widget'} />
                )}
              </div>

              <div className="flex items-center justify-between gap-2 px-1">
                <span className="text-xs text-[var(--analytics-text-muted)]">
                  {dataset?.sourceSystem}
                  {dashboard.controls.length > 0 && dataset && (
                    <> · {reached ? 'Control applied' : 'Control does not apply'}</>
                  )}
                </span>

                {editing && isAuthor && (
                  <span className="flex items-center gap-1">
                    <TinyButton onClick={() => move(placement.widgetId, -1)}>←</TinyButton>
                    <TinyButton onClick={() => move(placement.widgetId, 1)}>→</TinyButton>
                    <TinyButton onClick={() => setSpan(placement.widgetId, placement.span - 3)}>
                      −
                    </TinyButton>
                    <span className="text-xs text-[var(--analytics-text-muted)] tabular-nums">
                      {placement.span}/{DASHBOARD_COLUMNS}
                    </span>
                    <TinyButton onClick={() => setSpan(placement.widgetId, placement.span + 3)}>
                      +
                    </TinyButton>
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function TinyButton({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      className="text-xs rounded border w-5 h-5 leading-none border-[var(--analytics-border)] text-[var(--analytics-text-secondary)]"
    >
      {children}
    </button>
  )
}

function StatusBadge({ status }: { status: Dashboard['status'] }) {
  const tone =
    status === 'published'
      ? 'var(--analytics-status-positive)'
      : 'var(--analytics-status-warning)'
  return (
    <span
      className="text-xs rounded-full border px-2 py-0.5"
      style={{ color: tone, borderColor: tone }}
    >
      {status === 'published' ? 'Published' : 'Draft'}
    </span>
  )
}

function UnavailableWidget({ title }: { title: string }) {
  return (
    <section className="rounded-lg border border-[var(--analytics-border)] bg-[var(--analytics-surface)] p-4 h-full flex flex-col">
      <h3 className="text-sm font-medium text-[var(--analytics-text)] m-0">{title}</h3>
      <div
        className="flex-1 mt-3 rounded border border-dashed flex flex-col items-center justify-center text-center gap-1 p-4"
        style={{
          borderColor: 'var(--analytics-status-neutral)',
          color: 'var(--analytics-status-neutral)',
        }}
        role="status"
      >
        <p className="text-sm font-medium m-0">Access denied</p>
        <p className="text-xs m-0 opacity-80 max-w-xs">
          You are not authorized for the Dataset behind this Widget. The rest of this Dashboard is
          unaffected.
        </p>
      </div>
    </section>
  )
}

// Re-exported so the access rule stays reachable from one place in tests.
export { canViewDashboard }
