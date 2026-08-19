/**
 * UC-02, end to end.
 *
 * "An operations lead ... opens the Catalogue, sees only the Datasets they are
 * authorized to consume, and finds a Peniremit settlements Dataset with a Time
 * Dimension and a corridor Dimension. They place a Widget, and the composition
 * surface offers only Visualization Types whose Data Shape the Dataset actually
 * satisfies — a trend chart and a categorical comparison, not a scatter plot,
 * because the Dataset has no second Measure. They configure which filters are
 * exposed to viewers, save the Dashboard as a personal draft, review it, then
 * publish it. No engineer was involved."
 *
 * The step order follows that sentence, and FR-VZ-07 is the constraint behind
 * the whole screen: nothing here requires the Source System that published the
 * Dataset to be involved.
 */

import { useEffect, useMemo, useState } from 'react'
import { usePorts } from '../composition-root'
import { WidgetHost } from '../widget-runtime/WidgetHost'
import { evaluateFamilies } from '../visualization/registry'
import { typesInFamily } from '../visualization/visualization-types'
import { registeredRendererIds } from '../widget-runtime/renderer'
import {
  defaultMapping,
  fieldsAcceptedBy,
  slotValues,
  slotsForVisualizationType,
  validateMapping,
  withSlotValues,
} from '../authoring/mapping'
import { emptyDashboard } from '../domain/dashboard'
import type { DashboardScope } from '../domain/dashboard'
import type { Dataset } from '../domain/dataset'
import type { DatasetSummary } from '../catalogue/port'
import type { FieldMapping, Widget } from '../domain/widget'

const DASHBOARD_ID = 'settlements-review'

/** FR-DA-02 — FR-DA-04. Nested scope and role-based scope are out of scope (§10). */
const SCOPE_CHOICES: { id: string; label: string; scope: DashboardScope }[] = [
  { id: 'personal', label: 'Personal', scope: { kind: 'personal' } },
  {
    id: 'operations',
    label: 'Operations',
    scope: { kind: 'organizational-scope', scopeId: 'operations', label: 'Operations' },
  },
  { id: 'organization-wide', label: 'Organization-wide', scope: { kind: 'organization-wide' } },
]

export function AuthoringFlow({ onPublished }: { onPublished: () => void }) {
  const { ports, viewer } = usePorts()

  const [summaries, setSummaries] = useState<DatasetSummary[]>([])
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [typeId, setTypeId] = useState<string | null>(null)
  const [mapping, setMapping] = useState<FieldMapping>({})
  const [exposedFilters, setExposedFilters] = useState<string[]>([])
  const [scopeId, setScopeId] = useState(SCOPE_CHOICES[0].id)
  const [saved, setSaved] = useState<'none' | 'draft' | 'published'>('none')

  // FR-DP-11 / FR-DP-12 — browsing is a Catalogue call. It cannot retrieve
  // data, because the Catalogue port offers no way to.
  useEffect(() => {
    let abandoned = false
    ports.catalogue.browse(viewer).then((results) => {
      if (abandoned) return
      setSummaries(results)
      setDataset(null)
      setTypeId(null)
      setSaved('none')
    })
    return () => {
      abandoned = true
    }
  }, [ports.catalogue, viewer])

  const selectDataset = async (datasetId: string) => {
    const described = await ports.catalogue.describe(datasetId, viewer)
    setDataset(described)
    setTypeId(null)
    setMapping({})
    setExposedFilters([])
    setSaved('none')
  }

  const eligibility = useMemo(() => (dataset ? evaluateFamilies(dataset) : []), [dataset])
  const buildable = useMemo(() => new Set(registeredRendererIds()), [])

  const selectType = (id: string) => {
    if (!dataset) return
    setTypeId(id)
    setMapping(defaultMapping(dataset, id))
    setSaved('none')
  }

  const problems = typeId ? validateMapping(mapping, typeId) : []

  const widget: Widget | null =
    dataset && typeId && problems.length === 0
      ? {
          id: `${dataset.id}-${typeId}`,
          datasetId: dataset.id,
          visualizationTypeId: typeId,
          mapping,
          exposedFilters,
          title: dataset.name,
        }
      : null

  const saveDraft = async () => {
    if (!widget) return
    // Append rather than replace, so a second Widget — from an unrelated Source
    // System — can join the same Dashboard. That is UC-03, and nothing in the
    // composition surface should object to it (FR-CO-03).
    const existing = await ports.dashboards.load(DASHBOARD_ID, viewer)
    const dashboard = existing ?? emptyDashboard(DASHBOARD_ID, 'Monthly review', viewer.id)
    const alreadyPlaced = dashboard.placements.some((p) => p.widgetId === widget.id)

    await ports.dashboards.save(
      {
        ...dashboard,
        // Re-saving reverts a published Dashboard to draft: the Author is
        // changing what Viewers would see, so they review again (FR-CO-04).
        status: 'draft',
        scope: SCOPE_CHOICES.find((c) => c.id === scopeId)!.scope,
        widgets: { ...dashboard.widgets, [widget.id]: widget },
        placements: alreadyPlaced
          ? dashboard.placements
          : [
              ...dashboard.placements,
              { widgetId: widget.id, span: 6, order: dashboard.placements.length },
            ],
      },
      viewer,
    )
    setSaved('draft')
  }

  const publish = async () => {
    await ports.dashboards.publish(DASHBOARD_ID, viewer)
    setSaved('published')
    onPublished()
  }

  return (
    <div className="space-y-4">
      <Step
        n={1}
        title="Discover a Dataset"
        caption="The Catalogue shows what exists and what each Dataset contains, without retrieving any records. Only Datasets you are authorized to consume appear."
      >
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((summary) => (
            <button
              key={summary.id}
              onClick={() => selectDataset(summary.id)}
              aria-current={dataset?.id === summary.id}
              className={[
                'text-left rounded border p-3 border-[var(--analytics-border)]',
                dataset?.id === summary.id
                  ? 'bg-[var(--analytics-surface-hover)]'
                  : 'bg-[var(--analytics-surface)]',
              ].join(' ')}
            >
              <div className="text-sm text-[var(--analytics-text)]">{summary.name}</div>
              <div className="text-xs text-[var(--analytics-text-muted)] mt-0.5">
                {summary.sourceSystem} · {summary.classification}
                {summary.exposesPersonalData && ' · personal data'}
              </div>
              <div className="text-xs text-[var(--analytics-text-secondary)] mt-1">
                {summary.dimensionCount} Dimension{summary.dimensionCount === 1 ? '' : 's'} ·{' '}
                {summary.timeDimensionCount} Time · {summary.measureCount} Measure
                {summary.measureCount === 1 ? '' : 's'}
              </div>
            </button>
          ))}
        </div>
        <p className="text-xs text-[var(--analytics-text-muted)] m-0 mt-2">
          {summaries.length} Dataset{summaries.length === 1 ? '' : 's'} available to{' '}
          {viewer.displayName}.
        </p>
      </Step>

      {dataset && (
        <Step
          n={2}
          title="Choose a Visualization Type"
          caption="Only Types whose Family Data Shape this Dataset satisfies are offered. The rest say why they are not."
        >
          <div className="space-y-2">
            {eligibility.map(({ family, satisfaction }) => {
              const types = typesInFamily(family.id)
              const offered = satisfaction.status === 'satisfied'

              return (
                <div key={family.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className="text-xs w-44 shrink-0"
                    style={{
                      color: offered
                        ? 'var(--analytics-text)'
                        : 'var(--analytics-text-muted)',
                    }}
                  >
                    {family.name}
                  </span>

                  {offered ? (
                    <span className="flex flex-wrap gap-1">
                      {types.map((type) => {
                        const canBuild = buildable.has(type.id)
                        return (
                          <button
                            key={type.id}
                            disabled={!canBuild}
                            onClick={() => selectType(type.id)}
                            title={canBuild ? undefined : 'Classified, but no renderer built yet'}
                            className={[
                              'text-xs rounded-full border px-2 py-0.5 border-[var(--analytics-border)]',
                              typeId === type.id
                                ? 'bg-[var(--analytics-surface-hover)] text-[var(--analytics-text)]'
                                : 'text-[var(--analytics-text-secondary)]',
                              canBuild ? '' : 'opacity-40 cursor-not-allowed',
                            ].join(' ')}
                          >
                            {type.name}
                          </button>
                        )
                      })}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--analytics-text-muted)] italic">
                      {satisfaction.status === 'unsatisfied'
                        ? `Not offered — ${satisfaction.unmet.join('; ')}`
                        : `Not offered — ${satisfaction.undecided
                            .map((u) => `needs ${u.resolvedBy}`)
                            .join('; ')}`}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </Step>
      )}

      {dataset && typeId && (
        <Step
          n={3}
          title="Map Fields"
          caption="Which Field plays which part. Only Fields of the right role are offered for each part."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {slotsForVisualizationType(typeId).map((slot) => {
              const chosen = slotValues(mapping, slot)
              const candidates = fieldsAcceptedBy(dataset, slot)
              const single = slot.max === 1

              return (
                <div key={slot.id}>
                  <p className="text-xs text-[var(--analytics-text-secondary)] m-0 mb-1">
                    {slot.label}
                    {slot.min > 0 && ' *'}
                    {slot.hint && (
                      <span className="text-[var(--analytics-text-muted)]"> — {slot.hint}</span>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {candidates.length === 0 && (
                      <span className="text-xs text-[var(--analytics-text-muted)]">
                        No Field of the required role.
                      </span>
                    )}
                    {candidates.map((field) => {
                      const active = chosen.includes(field.key)
                      return (
                        <button
                          key={field.key}
                          onClick={() => {
                            const next = single
                              ? active
                                ? []
                                : [field.key]
                              : active
                                ? chosen.filter((k) => k !== field.key)
                                : [...chosen, field.key]
                            setMapping(withSlotValues(mapping, slot, next, dataset))
                            setSaved('none')
                          }}
                          className={[
                            'text-xs rounded border px-2 py-0.5 border-[var(--analytics-border)]',
                            active
                              ? 'bg-[var(--analytics-surface-hover)] text-[var(--analytics-text)]'
                              : 'text-[var(--analytics-text-secondary)]',
                          ].join(' ')}
                        >
                          {field.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          {problems.length > 0 && (
            <ul className="text-xs text-[var(--analytics-status-warning)] mt-3 mb-0 pl-4">
              {problems.map((problem, index) => (
                <li key={index}>{problem.detail}</li>
              ))}
            </ul>
          )}
        </Step>
      )}

      {dataset && typeId && (
        <Step
          n={4}
          title="Expose filters to Viewers"
          caption="Only Fields the publisher declared filterable can be exposed. These belong to this Widget; a Dashboard Control is a separate thing."
        >
          <div className="flex flex-wrap gap-2">
            {dataset.fields.filter((f) => f.filterable).length === 0 && (
              <span className="text-xs text-[var(--analytics-text-muted)]">
                This Dataset declares no filterable Fields.
              </span>
            )}
            {dataset.fields
              .filter((field) => field.filterable)
              .map((field) => (
                <label
                  key={field.key}
                  className="text-xs text-[var(--analytics-text-secondary)] flex items-center gap-1.5"
                >
                  <input
                    type="checkbox"
                    checked={exposedFilters.includes(field.key)}
                    onChange={(event) => {
                      setExposedFilters((current) =>
                        event.target.checked
                          ? [...current, field.key]
                          : current.filter((k) => k !== field.key),
                      )
                      setSaved('none')
                    }}
                  />
                  {field.label}
                </label>
              ))}
          </div>
        </Step>
      )}

      {widget && dataset && (
        <Step
          n={5}
          title="Review, then publish"
          caption="The Widget below is the real runtime, not a mock-up. Retain it as a personal draft first; publishing is a separate, deliberate act."
        >
          <div className="max-w-2xl h-64">
            <WidgetHost
              widget={widget}
              dataset={dataset}
              retrieval={ports.retrieval}
              viewer={viewer}
            />
          </div>

          <div className="mt-3">
            <p className="text-xs text-[var(--analytics-text-secondary)] m-0 mb-1">
              Dashboard Scope * — who may see it once published. Publishing does not override this:
              a published Personal Dashboard stays private.
            </p>
            <div className="flex flex-wrap gap-1">
              {SCOPE_CHOICES.map((choice) => (
                <button
                  key={choice.id}
                  onClick={() => {
                    setScopeId(choice.id)
                    setSaved('none')
                  }}
                  className={[
                    'text-xs rounded border px-2 py-0.5 border-[var(--analytics-border)]',
                    scopeId === choice.id
                      ? 'bg-[var(--analytics-surface-hover)] text-[var(--analytics-text)]'
                      : 'text-[var(--analytics-text-secondary)]',
                  ].join(' ')}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <button
              onClick={saveDraft}
              className="text-xs rounded border px-3 py-1 border-[var(--analytics-border)] text-[var(--analytics-text)]"
            >
              Save as personal draft
            </button>
            <button
              onClick={publish}
              disabled={saved === 'none'}
              className="text-xs rounded border px-3 py-1 border-[var(--analytics-border)] text-[var(--analytics-text)] disabled:opacity-40"
            >
              Publish
            </button>
            {saved === 'draft' && (
              <span className="text-xs text-[var(--analytics-text-muted)]">
                Saved as a draft — visible only to you until published.
              </span>
            )}
            {saved === 'published' && (
              <span className="text-xs" style={{ color: 'var(--analytics-status-positive)' }}>
                Published. No engineer was involved.
              </span>
            )}
          </div>
        </Step>
      )}
    </div>
  )
}

function Step({
  n,
  title,
  caption,
  children,
}: {
  n: number
  title: string
  caption: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-lg border border-[var(--analytics-border)] bg-[var(--analytics-surface)] p-4">
      <h2 className="text-sm font-medium text-[var(--analytics-text)] m-0">
        <span className="text-[var(--analytics-text-muted)]">{n}.</span> {title}
      </h2>
      <p className="text-xs text-[var(--analytics-text-secondary)] m-0 mt-1 mb-3 max-w-3xl">
        {caption}
      </p>
      {children}
    </section>
  )
}
