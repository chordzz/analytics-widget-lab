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
import { useFilterValues } from '../data/AnalyticsData'
import { fieldOf } from '../data/types'
import type { Dataset } from '../data/types'
import type { ViewerChoices } from '../data/query'

export interface WidgetFiltersProps {
  dataset: Dataset
  /** Field keys the Author exposed. Already the Author's choice, not every Field. */
  filters: readonly string[]
  sorts: readonly string[]
  choices: ViewerChoices
  onChange: (next: ViewerChoices) => void
}

/** Only what the publisher permits, whatever the Author put in the spec. */
const permittedFilters = (dataset: Dataset, keys: readonly string[]) =>
  keys.map((key) => fieldOf(dataset, key)).filter((field) => field?.filterable === true)

const permittedSorts = (dataset: Dataset, keys: readonly string[]) =>
  keys.map((key) => fieldOf(dataset, key)).filter((field) => field?.sortable === true)

export function WidgetFilters({
  dataset,
  filters,
  sorts,
  choices,
  onChange,
}: WidgetFiltersProps) {
  const filterFields = permittedFilters(dataset, filters)
  const sortFields = permittedSorts(dataset, sorts)

  if (filterFields.length === 0 && sortFields.length === 0) return null

  const active =
    Object.values(choices.filters ?? {}).filter((value) => value !== '').length +
    (choices.sort ? 1 : 0)

  return (
    <div className="a-filters" role="group" aria-label="Filters">
      {filterFields.map((field) => (
        <FilterSelect
          key={field!.key}
          datasetId={dataset.id}
          fieldKey={field!.key}
          label={field!.label}
          value={choices.filters?.[field!.key]}
          onChange={(value) =>
            onChange({
              ...choices,
              filters: { ...choices.filters, [field!.key]: value },
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

function FilterSelect({
  datasetId,
  fieldKey,
  label,
  value,
  onChange,
}: {
  datasetId: string
  fieldKey: string
  label: string
  value: string | number | undefined
  onChange: (value: string | number) => void
}) {
  const id = useId()
  const values = useFilterValues(datasetId, fieldKey)

  return (
    <label className="a-filters__field" htmlFor={id}>
      <span className="a-filters__label">{label}</span>
      <select
        id={id}
        className="a-filters__select"
        value={value === undefined ? '' : String(value)}
        onChange={(event) => {
          // The raw option value is a string; a numeric Field has to come back
          // as a number or the query's equality check silently matches nothing.
          const raw = event.target.value
          const original = values.find((entry) => String(entry) === raw)
          onChange(original ?? raw)
        }}
      >
        <option value="">All</option>
        {values.map((entry) => (
          <option key={String(entry)} value={String(entry)}>
            {String(entry)}
          </option>
        ))}
      </select>
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
