/**
 * C2 — one Widget, owning its own retrieval lifecycle.
 *
 * Each Widget retrieves independently, resolves its own state and is wrapped in
 * its own error boundary. Nothing here consults, waits on, or is affected by
 * any other Widget. That is what lets FR-DA-10 hold: a denied Widget is simply
 * a Widget whose retrieval said `denied`, and its neighbours never find out.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { WidgetFrame } from './WidgetFrame'
import { WidgetErrorBoundary } from './WidgetErrorBoundary'
import { getRenderer } from './renderer'
import { resolveFailure, resolveRenderState } from '../retrieval/render-state'
import type { WidgetRenderState } from '../retrieval/render-state'
import type { DatasetRetrievalPort, ViewerIdentity } from '../retrieval/port'
import type { Dataset } from '../domain/dataset'
import type { DatasetQuery } from '../domain/query'
import type { Widget } from '../domain/widget'
import { NO_EFFECT, applyContribution } from '../composition/correspondence'
import type { ControlEffect } from '../composition/correspondence'

export interface WidgetHostProps {
  widget: Widget
  dataset: Dataset
  retrieval: DatasetRetrievalPort
  viewer: ViewerIdentity
  /**
   * What the Dashboard's Controls do to this Widget (FR-CO-06). Absent, or
   * empty, means no Control reached it — and a Widget that is not reached must
   * behave exactly as though no Control existed.
   */
  effect?: ControlEffect
  onError?: (error: Error) => void
}

type FilterSelections = Record<string, string | number>

/** Turns a Widget's Field mapping into the query its Dataset will answer. */
function buildQuery(widget: Widget, filters: FilterSelections): DatasetQuery {
  const { mapping } = widget

  const groupBy = [
    ...(mapping.timeDimension ? [mapping.timeDimension] : []),
    ...(mapping.dimensions ?? []),
    ...(mapping.columns ?? []),
  ]

  return {
    dimensions: groupBy.length ? groupBy : undefined,
    measures: mapping.measures?.length ? mapping.measures : undefined,
    filters: Object.keys(filters).length ? filters : undefined,
    sort: mapping.timeDimension
      ? [{ field: mapping.timeDimension, direction: 'ascending' }]
      : undefined,
  }
}

export function WidgetHost({
  widget,
  dataset,
  retrieval,
  viewer,
  effect = NO_EFFECT,
  onError,
}: WidgetHostProps) {
  const [state, setState] = useState<WidgetRenderState>({ status: 'loading' })
  const [filters, setFilters] = useState<FilterSelections>({})
  const [attempt, setAttempt] = useState(0)

  const query = useMemo(
    () => applyContribution(buildQuery(widget, filters), effect.query),
    [widget, filters, effect.query],
  )
  const querySignature = JSON.stringify(query)

  useEffect(() => {
    let abandoned = false
    setState({ status: 'loading' })

    retrieval
      .retrieve(widget.datasetId, query, viewer)
      .then((outcome) => {
        if (!abandoned) setState(resolveRenderState(outcome))
      })
      .catch((error) => {
        if (!abandoned) setState(resolveFailure(error))
      })

    return () => {
      abandoned = true
    }
    // querySignature stands in for `query`, which is a fresh object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widget.datasetId, querySignature, viewer.id, retrieval, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // A view switcher may substitute the Type this Widget renders as. The
  // substitution is presentation only — the Widget's own binding is untouched,
  // so the Author's choice survives the Viewer's.
  const effectiveTypeId = effect.visualizationTypeId ?? widget.visualizationTypeId

  // Rendered as an element, never invoked as a function: a renderer may hold
  // its own presentation state (a sort order, an expanded row), and calling it
  // directly would attribute those hooks to this host.
  const Renderer = getRenderer(effectiveTypeId)

  const content =
    state.status !== 'ready' ? null : Renderer ? (
      <Renderer
        rows={state.rows}
        dataset={dataset}
        mapping={widget.mapping}
        presentation={{ ...widget.presentation, ...effect.presentation }}
      />
    ) : (
      <MissingRendererNotice visualizationTypeId={effectiveTypeId} />
    )

  return (
    <WidgetErrorBoundary widgetId={widget.id} onError={onError}>
      <WidgetFrame
        title={widget.title ?? dataset.name}
        description={widget.description}
        sourceSystem={dataset.sourceSystem}
        state={state}
        onRetry={retry}
        filters={
          widget.exposedFilters?.length ? (
            <ExposedFilters
              widget={widget}
              dataset={dataset}
              retrieval={retrieval}
              viewer={viewer}
              selections={filters}
              onChange={setFilters}
            />
          ) : undefined
        }
      >
        {content}
      </WidgetFrame>
    </WidgetErrorBoundary>
  )
}

/**
 * A Visualization Type can be classified (FR-VZ-01) before anything can draw
 * it. That is a configuration problem, not a data state, so it is reported
 * separately from the six — conflating them would tell a Viewer their data is
 * missing when the data is fine.
 */
function MissingRendererNotice({ visualizationTypeId }: { visualizationTypeId: string }) {
  return (
    <div className="h-full min-h-24 flex items-center justify-center text-center">
      <p className="text-xs text-[var(--analytics-text-muted)] m-0">
        No renderer is registered for <code>{visualizationTypeId}</code>. The Dataset and its
        eligibility are fine; this Visualization Type has not been built yet.
      </p>
    </div>
  )
}

/** FR-VZ-06 — the filters the Author chose to expose, and nothing else. */
function ExposedFilters({
  widget,
  dataset,
  retrieval,
  viewer,
  selections,
  onChange,
}: {
  widget: Widget
  dataset: Dataset
  retrieval: DatasetRetrievalPort
  viewer: ViewerIdentity
  selections: FilterSelections
  onChange: (next: FilterSelections) => void
}) {
  const [options, setOptions] = useState<Record<string, (string | number)[]>>({})
  const exposed = widget.exposedFilters ?? []

  useEffect(() => {
    let abandoned = false

    Promise.all(
      exposed.map(async (field) => {
        const values = await retrieval
          .listFilterValues(widget.datasetId, field, viewer)
          .catch(() => [])
        return [field, values] as const
      }),
    ).then((entries) => {
      if (!abandoned) setOptions(Object.fromEntries(entries))
    })

    return () => {
      abandoned = true
    }
  }, [widget.datasetId, exposed.join(','), retrieval, viewer.id])

  return (
    <>
      {exposed.map((field) => {
        const definition = dataset.fields.find((f) => f.key === field)
        const values = options[field] ?? []

        return (
          <label key={field} className="text-xs text-[var(--analytics-text-secondary)]">
            <span className="sr-only">{definition?.label ?? field}</span>
            <select
              className="rounded border border-[var(--analytics-border)] bg-[var(--analytics-surface)] text-[var(--analytics-text)] px-2 py-1 text-xs"
              value={String(selections[field] ?? '')}
              onChange={(event) => {
                const next = { ...selections }
                if (event.target.value === '') delete next[field]
                else next[field] = event.target.value
                onChange(next)
              }}
            >
              <option value="">All {definition?.label ?? field}</option>
              {values.map((value) => (
                <option key={String(value)} value={String(value)}>
                  {String(value)}
                </option>
              ))}
            </select>
          </label>
        )
      })}
    </>
  )
}
