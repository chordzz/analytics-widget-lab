/**
 * The filters an Author exposed, as a Viewer uses them.
 *
 * Merge Plan Stage 6.1 — FR-VZ-06. Two things about this are easy to get wrong
 * and are decided here rather than left to each caller.
 *
 * **A Viewer's choice is not an edit.** Narrowing a chart to one region is
 * reading the Author's dashboard, not changing it. These values live in the
 * widget's own state and are never persisted, or one person looking would change
 * what everybody else sees.
 *
 * **The control is not the enforcement point.** It only offers Fields the Author
 * exposed *and* the publisher marked filterable, but `queryFor` checks both
 * again. The dropdown and the query are different code, and a rule enforced only
 * where it is displayed is a rule that survives exactly until someone adds a
 * second way to set it.
 */

import { useId } from 'react'
import { DateField } from '../shell/DateField'
import { fieldOf } from '../data/types'
import type { FilterParameter } from '../../domain/dataset'
import type { Dataset } from '../data/types'
import type { ViewerChoices } from '../data/query'

export interface WidgetFiltersProps {
  dataset: Dataset
  /** Filter Parameter names the Author exposed. Their choice, not every parameter. */
  filters: readonly string[]
  sorts: readonly string[]
  choices: ViewerChoices
  onChange: (next: ViewerChoices) => void
  /**
   * What the Author bound, which a Viewer's own choice overrides.
   *
   * Shown as the starting value rather than as an empty control, because a
   * required parameter with no value is a query the Source System refuses — so
   * an empty box here would offer a Viewer a way to break the widget.
   */
  bindings?: Record<string, string | number>
}

/**
 * Only what the publisher permits, whatever the Author put in the spec.
 *
 * Resolved against **Filter Parameters** — the names the endpoint accepts —
 * rather than against filterable Fields, which describe the response. The two
 * lists do not line up, and checking the wrong one is what let a Widget be
 * composed exposing `date` and rejected on save.
 */
const permittedFilters = (dataset: Dataset, names: readonly string[]) =>
  names
    .map((name) => (dataset.filterParameters ?? []).find((parameter) => parameter.name === name))
    .filter((parameter): parameter is FilterParameter => parameter !== undefined)

const permittedSorts = (dataset: Dataset, keys: readonly string[]) =>
  keys.map((key) => fieldOf(dataset, key)).filter((field) => field?.sortable === true)

export function WidgetFilters({
  dataset,
  filters,
  sorts,
  choices,
  onChange,
  bindings,
}: WidgetFiltersProps) {
  const filterParameters = permittedFilters(dataset, filters)
  const sortFields = permittedSorts(dataset, sorts)

  if (filterParameters.length === 0 && sortFields.length === 0) return null

  const active =
    Object.values(choices.filters ?? {}).filter((value) => value !== '').length +
    (choices.sort ? 1 : 0)

  return (
    <div className="a-filters" role="group" aria-label="Filters">
      {filterParameters.map((parameter) => (
        <ParameterControl
          key={parameter.name}
          parameter={parameter}
          // The Author's binding is the starting point, not a floor: a Viewer
          // changing it is the whole point of exposing it.
          value={choices.filters?.[parameter.name] ?? bindings?.[parameter.name]}
          onChange={(value) =>
            onChange({
              ...choices,
              filters: { ...choices.filters, [parameter.name]: value },
            })
          }
        />
      ))}

      {sortFields.length > 0 && (
        <SortSelect
          fields={sortFields.map((field) => ({ key: field!.key, label: field!.label }))}
          value={choices.sort}
          onChange={(sort) => onChange({ ...choices, sort })}
        />
      )}

      {active > 0 && (
        <button
          type="button"
          className="a-filters__clear"
          onClick={() => onChange({})}
          // Without this a Viewer who has narrowed a chart has no way back to
          // what the Author published, short of reloading the page.
        >
          Clear
        </button>
      )}
    </div>
  )
}

/**
 * One control for one Filter Parameter, chosen by what the publisher declared.
 *
 * Three shapes, in order of how much the declaration tells us:
 *
 *   - **enumerated values** — a select, since the publisher listed exactly what
 *     the endpoint accepts
 *   - **a date** — a date picker. `input[type=date]` reads and writes
 *     `YYYY-MM-DD` whatever the viewer's locale displays, which is already the
 *     ISO-8601 the endpoint wants, so the value travels verbatim
 *   - **anything else** — a text or number box, which is the honest fallback
 *     when the publisher has not said what the values are (Finding 8)
 */
function ParameterControl({
  parameter,
  value,
  onChange,
}: {
  parameter: FilterParameter
  value: string | number | undefined
  onChange: (value: string | number) => void
}) {
  const id = useId()
  const current = value === undefined ? '' : String(value)
  const allowed = parameter.allowedValues

  return (
    <label className="a-filters__field" htmlFor={id}>
      <span className="a-filters__label">{parameter.label}</span>

      {allowed && allowed.length > 0 ? (
        <select
          id={id}
          className="a-filters__select"
          value={current}
          onChange={(event) => {
            // The raw option value is a string; a numeric parameter has to come
            // back as a number or the endpoint compares a string to a number.
            const raw = event.target.value
            onChange(allowed.find((entry) => String(entry) === raw) ?? raw)
          }}
        >
          {/*
            A required parameter has no "All": the endpoint cannot answer
            without a value, so offering the empty option would hand a Viewer a
            way to break the widget.
          */}
          {!parameter.required && <option value="">All</option>}
          {allowed.map((entry) => (
            <option key={String(entry)} value={String(entry)}>
              {String(entry)}
            </option>
          ))}
        </select>
      ) : parameter.valueType === 'date' ? (
        /*
         * The same field the board's Control uses, so a date looks like a date
         * wherever it is asked for. It reads and writes `YYYY-MM-DD` exactly as
         * `input[type=date]` did — the format is what the endpoint takes, and a
         * picker that emitted a locale string would fail every query silently.
         */
        <DateField label={parameter.label} value={current} onChange={onChange} />
      ) : (
        <input
          id={id}
          type={parameter.valueType === 'number' ? 'number' : 'text'}
          className="a-filters__select"
          value={current}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </label>
  )
}

function SortSelect({
  fields,
  value,
  onChange,
}: {
  fields: { key: string; label: string }[]
  value: ViewerChoices['sort']
  onChange: (sort: ViewerChoices['sort']) => void
}) {
  const id = useId()

  /*
   * Field and direction in one control rather than two.
   *
   * A separate direction picker is meaningless until a field is chosen, and a
   * disabled control beside an empty one reads as broken. One list of concrete
   * orderings — "Revenue, high to low" — is also how a person actually thinks
   * about it.
   */
  const current = value ? `${value.field}:${value.direction}` : ''

  return (
    <label className="a-filters__field" htmlFor={id}>
      <span className="a-filters__label">Sort</span>
      <select
        id={id}
        className="a-filters__select"
        value={current}
        onChange={(event) => {
          const raw = event.target.value
          if (!raw) return onChange(undefined)
          const [field, direction] = raw.split(':')
          onChange({ field, direction: direction as 'ascending' | 'descending' })
        }}
      >
        <option value="">Default</option>
        {fields.map((field) => (
          <optgroup key={field.key} label={field.label}>
            <option value={`${field.key}:descending`}>{field.label}, high to low</option>
            <option value={`${field.key}:ascending`}>{field.label}, low to high</option>
          </optgroup>
        ))}
      </select>
    </label>
  )
}
