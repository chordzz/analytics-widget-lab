/**
 * The Dashboard's Controls (FR-CO-05).
 *
 * Every Control shows the same two things: the choices a Viewer can make, and
 * how far the Control reaches. The second matters as much as the first — a
 * Control that silently moves some Widgets and not others leaves a Viewer with
 * no way to tell an unaffected Widget from a stale one.
 */

import { useEffect, useState } from 'react'
import { usePorts } from '../composition-root'
import { resolveControlReach } from '../composition/correspondence'
import { withBinding } from '../domain/composition'
import { registeredRendererIds } from '../widget-runtime/renderer'
import { getVisualizationType } from '../visualization/visualization-types'
import type { Control, ControlValues, DateRangeValue } from '../domain/composition'
import type { Dataset } from '../domain/dataset'
import type { Widget } from '../domain/widget'

/** Presets over the fixture range, which is monthly. */
const RANGE_PRESETS: { id: string; label: string; value: DateRangeValue }[] = [
  { id: 'all', label: 'All time', value: {} },
  { id: '12m', label: 'Last 12 months', value: { from: '2025-08', to: '2026-07' } },
  { id: '6m', label: 'Last 6 months', value: { from: '2026-02', to: '2026-07' } },
  { id: '3m', label: 'Last 3 months', value: { from: '2026-05', to: '2026-07' } },
]

export function ControlBar({
  control,
  widgets,
  datasets,
  values,
  onValueChange,
  editing,
  onControlChange,
  onRemove,
}: {
  control: Control
  widgets: Widget[]
  datasets: Record<string, Dataset>
  values: ControlValues
  onValueChange: (controlId: string, value: ControlValues[string]) => void
  editing: boolean
  onControlChange: (next: Control) => void
  onRemove: () => void
}) {
  const rendererIds = new Set(registeredRendererIds())
  const reach = resolveControlReach(control, widgets, datasets, {
    value: values[control.id],
    hasRenderer: (id) => rendererIds.has(id),
  })

  return (
    <div className="rounded-lg border border-[var(--analytics-border)] bg-[var(--analytics-surface)] p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-[var(--analytics-text-secondary)]">{control.label}</span>

        {control.controlType === 'date-range' && (
          <Choices
            options={RANGE_PRESETS.map((p) => ({ value: p.id, label: p.label }))}
            selected={selectedRangePreset(values[control.id])}
            onSelect={(id) =>
              onValueChange(control.id, RANGE_PRESETS.find((p) => p.id === id)!.value)
            }
          />
        )}

        {control.controlType === 'select' && (
          <SelectControlChoices
            control={control}
            widgets={widgets}
            value={typeof values[control.id] === 'string' ? (values[control.id] as string) : ''}
            onSelect={(value) => onValueChange(control.id, value)}
          />
        )}

        {(control.controlType === 'presentation-toggle' ||
          control.controlType === 'view-switcher') && (
          <Choices
            options={control.options ?? []}
            selected={typeof values[control.id] === 'string' ? (values[control.id] as string) : ''}
            onSelect={(value) => onValueChange(control.id, value)}
          />
        )}

        <span className="text-xs text-[var(--analytics-text-muted)] ml-auto text-right">
          Affects {reach.affected.length} of {widgets.length} Widget
          {widgets.length === 1 ? '' : 's'}
          {reach.unaffected.length > 0 && (
            <>
              {' — '}
              {reach.unaffected
                .map((u) => {
                  const widget = widgets.find((w) => w.id === u.widgetId)
                  return `${widget?.title ?? u.widgetId}: ${u.reason}`
                })
                .join('; ')}
            </>
          )}
        </span>

        {editing && (
          <button
            onClick={onRemove}
            className="text-xs rounded border px-2 py-0.5 border-[var(--analytics-border)] text-[var(--analytics-text-secondary)]"
          >
            Remove
          </button>
        )}
      </div>

      {editing && control.correspondence.kind === 'explicit-binding' && (
        <BindingEditor
          control={control}
          widgets={widgets}
          datasets={datasets}
          onControlChange={onControlChange}
        />
      )}
    </div>
  )
}

function selectedRangePreset(value: ControlValues[string]): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return ''
  const range = value as DateRangeValue
  return (
    RANGE_PRESETS.find(
      (p) => (p.value.from ?? '') === (range.from ?? '') && (p.value.to ?? '') === (range.to ?? ''),
    )?.id ?? ''
  )
}

function Choices({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string }[]
  selected: string
  onSelect: (value: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onSelect(option.value)}
          className={[
            'text-xs rounded border px-2 py-0.5 border-[var(--analytics-border)]',
            selected === option.value
              ? 'bg-[var(--analytics-surface-hover)] text-[var(--analytics-text)]'
              : 'text-[var(--analytics-text-secondary)]',
          ].join(' ')}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/**
 * Values for an explicit-binding filter.
 *
 * Gathered from every bound Field across every bound Widget, then unioned. The
 * union is honest about what this Control is: the Author has asserted these
 * Fields mean the same thing, and where their value domains only partly
 * overlap, a value present in one Dataset and absent from another will empty
 * that Widget — correctly, and visibly, via the empty state. That is the cost
 * of the binding, and the reason it has to be explicit (Finding 2).
 */
function SelectControlChoices({
  control,
  widgets,
  value,
  onSelect,
}: {
  control: Control
  widgets: Widget[]
  value: string
  onSelect: (value: string) => void
}) {
  const { ports, viewer } = usePorts()
  const [options, setOptions] = useState<string[]>([])

  const bindings =
    control.correspondence.kind === 'explicit-binding' ? control.correspondence.bindings : {}
  const signature = JSON.stringify(bindings)

  useEffect(() => {
    let abandoned = false

    Promise.all(
      Object.entries(bindings).map(async ([widgetId, field]) => {
        const widget = widgets.find((w) => w.id === widgetId)
        if (!widget) return []
        return ports.retrieval
          .listFilterValues(widget.datasetId, field, viewer)
          .catch(() => [] as (string | number)[])
      }),
    ).then((lists) => {
      if (abandoned) return
      setOptions([...new Set(lists.flat().map(String))].sort())
    })

    return () => {
      abandoned = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ports.retrieval, viewer.id])

  if (options.length === 0) {
    return (
      <span className="text-xs text-[var(--analytics-text-muted)] italic">
        Not bound to any Widget yet.
      </span>
    )
  }

  return (
    <select
      value={value}
      onChange={(event) => onSelect(event.target.value)}
      className="rounded border border-[var(--analytics-border)] bg-[var(--analytics-surface)] text-[var(--analytics-text)] px-2 py-1 text-xs"
    >
      <option value="">All</option>
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  )
}

/**
 * Per-Widget Field binding (Finding 2).
 *
 * The Author says, Widget by Widget, which Field this Control acts on. Only
 * Fields the publisher declared filterable are offered, because FR-DP-05 is the
 * publisher's decision and a Control does not overrule it.
 */
function BindingEditor({
  control,
  widgets,
  datasets,
  onControlChange,
}: {
  control: Control
  widgets: Widget[]
  datasets: Record<string, Dataset>
  onControlChange: (next: Control) => void
}) {
  const bindings =
    control.correspondence.kind === 'explicit-binding' ? control.correspondence.bindings : {}

  return (
    <div className="border-t border-[var(--analytics-border)] pt-2 space-y-1">
      <p className="text-xs text-[var(--analytics-text-muted)] m-0">
        Bind this Control to a Field on each Widget. Two Datasets may share a Dimension name over
        different value domains, so this cannot be inferred.
      </p>
      {widgets.map((widget) => {
        const dataset = datasets[widget.datasetId]
        const candidates = dataset?.fields.filter((f) => f.filterable && f.role !== 'measure') ?? []

        return (
          <label
            key={widget.id}
            className="flex items-center gap-2 text-xs text-[var(--analytics-text-secondary)]"
          >
            <span className="w-44 truncate">{widget.title ?? widget.id}</span>
            <select
              value={bindings[widget.id] ?? ''}
              onChange={(event) =>
                onControlChange(withBinding(control, widget.id, event.target.value || null))
              }
              className="rounded border border-[var(--analytics-border)] bg-[var(--analytics-surface)] text-[var(--analytics-text)] px-2 py-0.5 text-xs"
            >
              <option value="">Not bound</option>
              {candidates.map((field) => (
                <option key={field.key} value={field.key}>
                  {field.label}
                </option>
              ))}
            </select>
          </label>
        )
      })}
    </div>
  )
}

/** Visualization Types a view switcher can offer, given what is actually built. */
export function switchableTypeOptions(): { value: string; label: string }[] {
  return registeredRendererIds()
    .map((id) => getVisualizationType(id))
    .filter((type): type is NonNullable<typeof type> => type !== undefined)
    .map((type) => ({ value: type.id, label: type.name }))
}
