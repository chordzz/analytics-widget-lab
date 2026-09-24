/**
 * Dashboard Controls — FR-CO-05, FR-CO-06.
 *
 * Merge Plan Stage 6.3. A Control is a Composition Element: it changes how
 * Widgets present data and draws none of its own (FR-CO-08, which holds
 * structurally because `Control` has nowhere to put a `datasetId`).
 *
 * Three things here are the requirement rather than the design.
 *
 * **A Control never names the Widgets it acts on.** Correspondence is computed
 * per Widget, every render, from the Widget's bound Dataset. So adding a Widget
 * to a board brings it under an existing Control with no reconfiguration, and
 * the stale-configuration bug — a Control holding a list of Widget ids that
 * quietly stops matching — cannot happen.
 *
 * **It says what it does not reach.** FR-CO-06 has two halves, and the second is
 * "leave the others unaffected". A Control that silently moves two Widgets out
 * of three leaves a Viewer to guess whether the third is stale, filtered
 * differently, or broken. `resolveControlReach` computes the sentence; this
 * shows it.
 *
 * **Its values are the Viewer's and are never persisted.** Same rule as the
 * exposed filters in 6.1: setting a date range is reading the Author's
 * dashboard, not editing it.
 */

import { useEffect, useId, useMemo, useState } from 'react'
import { DateField } from '../shell/DateField'
import { resolveControlReach } from '../../composition/correspondence'
import { controlSubjectFor } from '../data/query'
import { useDatasets } from '../data/AnalyticsData'
import type { Control, ControlValues, DateRangeValue } from '../../domain/composition'
import type { Dataset } from '../data/types'
import type { PlacedWidget } from './boards'

export interface BoardControlsProps {
  controls: Control[]
  widgets: PlacedWidget[]
  values: ControlValues
  onChange: (next: ControlValues) => void
  /** Shown to an Author; a Viewer only sets values. */
  onRemove?: (controlId: string) => void
}

export function BoardControls({
  controls,
  widgets,
  values,
  onChange,
  onRemove,
}: BoardControlsProps) {
  const { datasets } = useDatasets()

  const byId = useMemo(() => {
    const map: Record<string, Dataset> = {}
    for (const dataset of datasets) map[dataset.id] = dataset
    return map
  }, [datasets])

  if (controls.length === 0) return null

  const subjects = widgets
    .filter((widget) => byId[widget.datasetId])
    .map((widget) => controlSubjectFor(widget, byId[widget.datasetId]))

  return (
    <div className="a-controls" role="group" aria-label="Dashboard controls">
      {controls.map((control) => (
        <ControlField
          key={control.id}
          control={control}
          subjects={subjects}
          datasets={byId}
          value={values[control.id]}
          onChange={(next) => onChange({ ...values, [control.id]: next })}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}

function ControlField({
  control,
  subjects,
  datasets,
  value,
  onChange,
  onRemove,
}: {
  control: Control
  subjects: ReturnType<typeof controlSubjectFor>[]
  datasets: Record<string, Dataset>
  value: ControlValues[string]
  onChange: (next: ControlValues[string]) => void
  onRemove?: (controlId: string) => void
}) {
  const id = useId()
  const reach = resolveControlReach(control, subjects, datasets, { value })

  return (
    <div className="a-controls__item">
      <div className="a-controls__field">
        <span className="a-filters__label" id={`${id}-label`}>
          {control.label}
        </span>

        {control.controlType === 'date-range' ? (
          <DateRange value={value as DateRangeValue | undefined} onChange={onChange} labelledBy={`${id}-label`} />
        ) : (
          <span className="a-muted">Not yet available</span>
        )}

        {onRemove && (
          <button type="button" className="a-filters__clear" onClick={() => onRemove(control.id)}>
            Remove
          </button>
        )}
      </div>

      <Reach
        affected={reach.affected.length}
        limited={reach.limited}
        unaffected={reach.unaffected}
      />
    </div>
  )
}

/**
 * "Affects 6 of 10 widgets — Sales by region declares no time dimension."
 *
 * The reason comes from `correspondenceFor` and already names the *Dataset*,
 * which is the actual cause: two widgets over `sales-by-region` are both
 * unaffected for the same reason, and naming the widget instead would say it
 * twice and explain neither. Reasons are grouped for the same reason — an
 * Author reads this to know the gap is deliberate, not to audit ten cards.
 */
export function Reach({
  affected,
  limited,
  unaffected,
}: {
  affected: number
  limited: { widgetId: string; reason: string }[]
  unaffected: { widgetId: string; reason: string }[]
}) {
  const total = affected + limited.length + unaffected.length
  if (total === 0) return null

  /*
   * A limited widget is counted as affected, because it is — it moves. What it
   * cannot do is *widen*, so the caveat is said rather than folded into a
   * number. Without it a Viewer who asks for August on a card fetching
   * September sees an empty chart and no reason for it.
   */
  const moved = affected + limited.length
  const caveats = Array.from(new Set(limited.map((entry) => entry.reason))).map(trimStop)

  if (unaffected.length === 0) {
    return (
      <p className="a-controls__reach">
        Affects all {total} widgets.
        {caveats.length > 0 && ` ${caveats.join('; ')}.`}
      </p>
    )
  }

  const distinct = Array.from(new Set(unaffected.map((entry) => entry.reason)))
  // Two, then a count. Four sentences that differ only by which Dataset they
  // name is a wall rather than an explanation, and the Author needs to know the
  // gap is deliberate rather than to read every case of it.
  const shown = distinct.slice(0, 2).map(trimStop)
  const hidden = distinct.length - shown.length

  return (
    <p className="a-controls__reach">
      Affects {moved} of {total} widgets — {shown.join('; ')}
      {hidden > 0 && `; and ${hidden} more`}.
      {caveats.length > 0 && ` ${caveats.join('; ')}.`}
    </p>
  )
}

/** Reasons arrive as sentences; joining them needs the full stops off first. */
const trimStop = (text: string) => text.replace(/\.\s*$/, '')

function DateRange({
  value,
  onChange,
  labelledBy,
}: {
  value: DateRangeValue | undefined
  onChange: (next: DateRangeValue | null) => void
  labelledBy: string
}) {
  const [from, setFrom] = useState(value?.from ?? '')
  const [to, setTo] = useState(value?.to ?? '')

  // Both ends are optional and open-ended: "everything since March" is a range a
  // person asks for, and requiring the other end would make them invent one.
  useEffect(() => {
    const next = from || to ? { from: from || undefined, to: to || undefined } : null
    onChange(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to])

  return (
    <span className="a-controls__range" role="group" aria-labelledby={labelledBy}>
      <DateField label="From" value={from} onChange={setFrom} placeholder="Start" />
      <span className="a-muted">to</span>
      <DateField label="To" value={to} onChange={setTo} placeholder="End" />
      {(from || to) && (
        <button
          type="button"
          className="a-filters__clear"
          onClick={() => {
            setFrom('')
            setTo('')
          }}
        >
          Clear
        </button>
      )}
    </span>
  )
}
