/**
 * The field mapper — which column plays which role.
 *
 * One control per slot, offering only fields the slot accepts. That constraint
 * is the point: a mapper that lets you put a timestamp on a gauge produces a
 * broken widget and blames you for it. Here the wrong answer is not reachable.
 *
 * Multi-field slots are ordered, and the order is meaningful — a scatter plot's
 * first measure is its x axis, a Gantt's first is where the bar starts — so they
 * get an explicit list with move controls rather than a multi-select, which
 * would hide the ordering entirely.
 */

import { candidatesFor, slotsFor, type Slot } from './requirements'
import type { Dataset, Field } from '../data/types'
import type { WidgetMapping } from '../widgets/Widget'

export function FieldMapper({
  typeId,
  dataset,
  mapping,
  onChange,
}: {
  typeId: string
  dataset: Dataset
  mapping: WidgetMapping
  onChange: (next: WidgetMapping) => void
}) {
  const entries = slotsFor(typeId)
  if (entries.length === 0) return null

  const set = (id: keyof WidgetMapping, value: string | string[] | undefined) =>
    onChange({ ...mapping, [id]: value })

  return (
    <div className="a-fields">
      {entries.map((entry) =>
        entry.max > 1 ? (
          <MultiSlot
            key={entry.id}
            slot={entry}
            dataset={dataset}
            chosen={(mapping[entry.id] as string[] | undefined) ?? []}
            onChange={(next) => set(entry.id, next.length > 0 ? next : undefined)}
          />
        ) : (
          <SingleSlot
            key={entry.id}
            slot={entry}
            dataset={dataset}
            chosen={mapping[entry.id] as string | undefined}
            onChange={(next) => set(entry.id, next)}
          />
        ),
      )}
    </div>
  )
}

function SlotLabel({ slot, note }: { slot: Slot; note?: string }) {
  return (
    <div className="a-field__label">
      <span>
        {slot.label}
        {slot.min === 0 && <span className="a-field__optional"> optional</span>}
      </span>
      {note && <span className="a-field__note">{note}</span>}
    </div>
  )
}

function SingleSlot({
  slot,
  dataset,
  chosen,
  onChange,
}: {
  slot: Slot
  dataset: Dataset
  chosen?: string
  onChange: (next: string | undefined) => void
}) {
  const options = candidatesFor(dataset, slot)
  const missing = slot.min > 0 && !chosen

  return (
    <label className={`a-field ${missing ? 'a-field--missing' : ''}`}>
      <SlotLabel slot={slot} />
      <select
        className="a-select"
        value={chosen ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        {/* An optional slot can be emptied again; a required one starts blank
            only until a dataset is chosen, and autoMap fills it immediately. */}
        {(slot.min === 0 || !chosen) && <option value="">{slot.min === 0 ? 'None' : 'Choose a field'}</option>}
        {options.map((field) => (
          <option key={field.key} value={field.key}>
            {field.label}
          </option>
        ))}
      </select>
      <p className="a-field__help">{slot.help}</p>
    </label>
  )
}

function MultiSlot({
  slot,
  dataset,
  chosen,
  onChange,
}: {
  slot: Slot
  dataset: Dataset
  chosen: string[]
  onChange: (next: string[]) => void
}) {
  const options = candidatesFor(dataset, slot)
  const available = options.filter((field) => !chosen.includes(field.key))
  const label = (key: string) => options.find((field) => field.key === key)?.label ?? key

  const atMax = chosen.length >= slot.max
  const missing = chosen.length < slot.min

  const move = (index: number, delta: number) => {
    const target = index + delta
    if (target < 0 || target >= chosen.length) return
    const next = [...chosen]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className={`a-field ${missing ? 'a-field--missing' : ''}`}>
      <SlotLabel
        slot={slot}
        note={slot.min === slot.max ? `${slot.min} required` : `${chosen.length} of up to ${slot.max}`}
      />

      <ol className="a-chosen">
        {chosen.map((key, index) => (
          <li key={key} className="a-chosen__item">
            {/* The index is shown because for these slots it is the meaning —
                first measure is the x axis, second is y. */}
            <span className="a-chosen__index">{index + 1}</span>
            <span className="a-chosen__name">{label(key)}</span>
            <span className="a-chosen__controls">
              <button
                type="button"
                className="a-chip-button"
                aria-label={`Move ${label(key)} earlier`}
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="a-chip-button"
                aria-label={`Move ${label(key)} later`}
                disabled={index === chosen.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button
                type="button"
                className="a-chip-button a-chip-button--remove"
                aria-label={`Remove ${label(key)}`}
                onClick={() => onChange(chosen.filter((entry) => entry !== key))}
              >
                ×
              </button>
            </span>
          </li>
        ))}
        {chosen.length === 0 && <li className="a-chosen__empty">Nothing chosen yet.</li>}
      </ol>

      {!atMax && available.length > 0 && (
        <select
          className="a-select"
          value=""
          onChange={(event) => event.target.value && onChange([...chosen, event.target.value])}
        >
          <option value="">Add a field…</option>
          {available.map((field) => (
            <option key={field.key} value={field.key}>
              {field.label}
            </option>
          ))}
        </select>
      )}

      <p className="a-field__help">{slot.help}</p>
    </div>
  )
}

/** Fields a dataset offers, for the dataset picker's summary line. */
export function fieldSummary(dataset: Dataset): string {
  const count = (role: Field['role']) => dataset.fields.filter((field) => field.role === role).length

  const plural = (n: number, one: string, many = `${one}s`) =>
    n === 1 ? `1 ${one}` : `${n.toLocaleString()} ${many}`

  const parts = [
    count('measure') > 0 && plural(count('measure'), 'measure'),
    count('dimension') > 0 && plural(count('dimension'), 'dimension'),
    // "1 time" and "2 time" both read fine; "times" would read as a count of
    // occurrences rather than of fields.
    count('time-dimension') > 0 && `${count('time-dimension')} time`,
  ].filter(Boolean)

  return `${plural(dataset.recordCount ?? 0, 'row')} · ${parts.join(', ')}`
}
