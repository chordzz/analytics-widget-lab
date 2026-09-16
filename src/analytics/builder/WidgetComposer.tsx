/**
 * The create flow: data first, then the widget.
 *
 * Choosing the data source first means every widget offered afterwards can
 * actually be built from it. Nothing is greyed out, nothing is disabled with a
 * tooltip explaining why, and nothing fails after you have committed to it —
 * a widget your data cannot fill is simply not in the list.
 *
 * The alternative — widget first — reads well in the abstract ("I want a
 * funnel") but makes the second step a puzzle: ten tables can technically feed
 * a funnel and only one of them is about funnels. Leading with the data turns
 * that guess into a fact.
 *
 * Everything is one screen with a live preview rather than a wizard with Next
 * buttons. The steps are ordered but not gated: change the data at step three
 * and the preview updates rather than resetting you to the start. The preview
 * is the real widget — the same `Widget` component the board uses — so what you
 * approve is what gets placed.
 */

import { useEffect, useState } from 'react'
import { Widget, type WidgetMapping, type WidgetSpec } from '../widgets/Widget'
import { FAMILIES, widgetType } from '../widgets/catalog'
import { heightForType } from '../widgets/layout'
import { useDatasets } from '../data/AnalyticsData'
import { CatalogueProblem, NoDatasets } from '../data/CatalogueState'
import { FieldMapper, fieldSummary } from './FieldMapper'
import {
  autoMap,
  isComplete,
  satisfies,
  suggestedTypesFor,
  typesFor,
  unavailableTypesFor,
  type UnavailableReason,
  unfilledSlots,
} from './requirements'
import { WIDGET_TYPES } from '../widgets/catalog'
import { requiredParameters } from '../../domain/dataset'
import type { Dataset } from '../data/types'

export interface ComposerDraft {
  typeId: string
  datasetId: string
  title: string
  subtitle?: string
  mapping: WidgetMapping
  span: number
  /** FR-VZ-06 — Fields a Viewer may filter on and reorder by. */
  exposedFilters: string[]
  exposedSorts: string[]
  /** D24 — values the Author fixed for the Dataset's Filter Parameters. */
  parameterBindings: Record<string, string | number>
}

const BUILT_COUNT = WIDGET_TYPES.filter((type) => type.built).length

/** Opens on an existing widget, or empty to start from the data source. */
export function WidgetComposer({
  initial,
  startWith,
  onCommit,
  onCancel,
  boardName,
}: {
  initial?: ComposerDraft
  /**
   * Skip step one — a new widget, but on a dataset already chosen elsewhere.
   *
   * Kept separate from `initial`, which means "edit this existing widget" and
   * governs the commit label and whether the title counts as authored. Arriving
   * from Data sources is a new widget with a head start, not an edit.
   */
  startWith?: { datasetId: string }
  onCommit: (draft: ComposerDraft) => void
  /** The board this will land on, so the commit button can say so. */
  boardName?: string
  onCancel: () => void
}) {
  const { datasets, loading: loadingDatasets, failure: catalogueFailure } = useDatasets()
  // Still asking is not the same as none: prompting either way beats telling
  // someone there is nothing here a moment before the list arrives.
  const hasSources = loadingDatasets || catalogueFailure !== null || datasets.length > 0
  const byId = (id: string) => datasets.find((entry) => entry.id === id)

  const [datasetId, setDatasetId] = useState(initial?.datasetId ?? startWith?.datasetId ?? '')
  const [typeId, setTypeId] = useState(initial?.typeId ?? '')
  const [mapping, setMapping] = useState<WidgetMapping>(initial?.mapping ?? {})
  const [title, setTitle] = useState(
    initial?.title ?? '',
  )
  /*
   * Whether the title is the person's or ours.
   *
   * The title tracks the data source until someone types their own. Inferring
   * that by comparing the title against the current dataset's name looks
   * equivalent and is not: pressing "Change" clears the dataset first, so by the
   * time a new one is picked there is nothing left to compare against, and the
   * title silently keeps naming data the widget no longer uses.
   */
  const [titled, setTitled] = useState(Boolean(initial?.title))

  /*
   * Seed the title from the handed-off source once the Catalogue has answered.
   *
   * It used to be read synchronously in `useState`, which a port cannot do. The
   * guard is `titled` rather than "is the title empty": someone who clears the
   * field on purpose should not have it filled back in when a describe lands.
   */
  useEffect(() => {
    if (titled || !startWith) return
    const named = byId(startWith.datasetId)?.name
    if (named) setTitle(named)
    // `byId` closes over `datasets`, which is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datasets, startWith, titled])
  const [span, setSpan] = useState(initial?.span ?? 0)
  const [exposedFilters, setExposedFilters] = useState<string[]>(initial?.exposedFilters ?? [])
  const [parameterBindings, setParameterBindings] = useState<Record<string, string | number>>(
    initial?.parameterBindings ?? {},
  )
  const [exposedSorts, setExposedSorts] = useState<string[]>(initial?.exposedSorts ?? [])
  const [query, setQuery] = useState('')

  const dataset = datasetId ? byId(datasetId) : undefined
  const type = typeId ? widgetType(typeId) : undefined

  /*
   * Changing the data keeps the widget when the new data can still fill it —
   * pointing a bar chart at a different table is a normal thing to want, and
   * losing the choice for it would be tedious. When it cannot, the widget is
   * cleared rather than left in place broken.
   */
  const chooseDataset = (nextId: string) => {
    const next = byId(nextId)
    setDatasetId(nextId)
    if (!next) return

    if (typeId && satisfies(typeId, next)) {
      setMapping(autoMap(typeId, next) ?? {})
    } else {
      setTypeId('')
      setMapping({})
    }

    if (!titled) setTitle(next.name)
  }

  const chooseType = (nextId: string) => {
    if (!dataset) return
    setTypeId(nextId)
    setSpan(widgetType(nextId)?.defaultSpan ?? 6)
    setMapping(autoMap(nextId, dataset) ?? {})
    if (!titled) setTitle(dataset.name)
  }

  /*
   * A required Filter Parameter is not an unset filter — it is a query the
   * Source System will refuse. So an unbound one blocks the commit exactly as a
   * missing mapping slot does, rather than producing a Widget that can only
   * ever fail with a validation error nobody can trace back to here.
   */
  const unbound = dataset ? requiredParameters(dataset).filter((p) => !bindingOf(parameterBindings, p.name)) : []

  const complete = Boolean(dataset && type) && isComplete(typeId, mapping) && unbound.length === 0
  const missing = typeId ? unfilledSlots(typeId, mapping) : []

  const preview: WidgetSpec | null =
    dataset && type
      ? {
          id: 'preview',
          typeId,
          datasetId,
          title: title.trim() || type.label,
          mapping,
          // The preview is the real runtime, so it shows the filter row an
          // Author is composing rather than describing it in prose.
          exposedFilters,
          exposedSorts,
          parameterBindings,
        }
      : null

  return (
    <div className="a-composer">
      <div className="a-composer__panel">
        <Step index={1} title="Choose a data source" done={Boolean(dataset)}>
          {dataset ? (
            <div className="a-chosen-type">
              <div>
                <strong>{dataset.name}</strong>
                <p className="a-muted">
                  {dataset.description} · {fieldSummary(dataset)}
                </p>
              </div>
              <button type="button" className="a-button" onClick={() => setDatasetId('')}>
                Change
              </button>
            </div>
          ) : loadingDatasets ? (
            <p className="a-muted">Loading data sources…</p>
          ) : catalogueFailure ? (
            <CatalogueProblem failure={catalogueFailure} />
          ) : datasets.length === 0 ? (
            /*
             * Step 1 with nothing under it was a blank area beneath a numbered
             * heading — which reads as a page that failed to finish rendering
             * rather than as an answer. A widget cannot be built without a
             * source, so this is the end of the road here and it says so.
             */
            <NoDatasets>
              <p style={{ margin: 'var(--a-space-2) 0 0' }}>
                A widget is built from a data source, so there is nothing to compose until
                one exists.
              </p>
            </NoDatasets>
          ) : (
            <div className="a-dataset-list">
              {datasets.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="a-dataset"
                  onClick={() => chooseDataset(entry.id)}
                >
                  <span className="a-dataset__name">{entry.name}</span>
                  <span className="a-dataset__meta">{fieldSummary(entry)}</span>
                  <span className="a-dataset__meta">
                    {typesFor(entry).length} widget types available
                  </span>
                </button>
              ))}
            </div>
          )}
        </Step>

        {dataset && (
          <Step index={2} title="Pick a widget" done={Boolean(type)}>
            {type ? (
              <div className="a-chosen-type">
                <div>
                  <strong>{type.label}</strong>
                  <p className="a-muted">{type.description}</p>
                </div>
                <button type="button" className="a-button" onClick={() => setTypeId('')}>
                  Change
                </button>
              </div>
            ) : (
              <TypePicker
                dataset={dataset}
                query={query}
                onQuery={setQuery}
                onPick={chooseType}
              />
            )}
          </Step>
        )}

        {dataset && type && (
          <Step index={3} title="Map the fields" done={complete}>
            <FieldMapper
              typeId={typeId}
              dataset={dataset}
              mapping={mapping}
              onChange={setMapping}
            />
          </Step>
        )}

        {dataset && type && (
          <Step index={4} title="Label and size it" done>
            <label className="a-field">
              <div className="a-field__label">
                <span>Title</span>
              </div>
              <input
                className="a-input"
                value={title}
                placeholder={type.label}
                onChange={(event) => {
                  setTitled(true)
                  setTitle(event.target.value)
                }}
              />
              <p className="a-field__help">Shown in the card header.</p>
            </label>

            <SpanControl span={span} onChange={setSpan} />

            {dataset && (
              <RequiredParameters
                dataset={dataset}
                bindings={parameterBindings}
                onChange={setParameterBindings}
              />
            )}

            {dataset && (
              <ExposeControl
                dataset={dataset}
                filters={exposedFilters}
                sorts={exposedSorts}
                onChangeFilters={setExposedFilters}
                onChangeSorts={setExposedSorts}
              />
            )}
          </Step>
        )}
      </div>

      <div className="a-composer__preview">
        <div className="a-composer__preview-head">
          <h3>Preview</h3>
          {preview && <span className="a-muted">{span} of 12 columns</span>}
        </div>

        {preview ? (
          <div className="a-composer__frame" style={{ height: heightForType(typeId) }}>
            <Widget spec={preview} />
          </div>
        ) : (
          <div className="a-empty a-empty--inline">
            {/*
              * Quiet when there is nothing to choose from.
              *
              * "Choose a data source to begin" is the right prompt while sources
              * exist and one has not been picked. With an empty Catalogue it
              * instructs someone to do something impossible, next to a panel on
              * the left already explaining why they cannot — so the preview
              * stops asking and says only what it is.
              */}
            <p>{previewPrompt({ hasDataset: Boolean(dataset), hasSources })}</p>
          </div>
        )}

        {(missing.length > 0 || unbound.length > 0) && (
          <p className="a-composer__missing">
            Still needed:{' '}
            {[
              ...missing.map((slot) => slot.label.toLowerCase()),
              ...unbound.map((parameter) => parameter.label.toLowerCase()),
            ].join(', ')}
            .
          </p>
        )}

        <div className="a-composer__actions">
          <button type="button" className="a-button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="a-button a-button--primary"
            disabled={!complete}
            onClick={() =>
              complete &&
              onCommit({
                typeId,
                datasetId,
                title: title.trim() || type!.label,
                mapping,
                span,
                exposedFilters,
                exposedSorts,
                parameterBindings,
              })
            }
          >
            {/*
              Named rather than generic. "Add to dashboard" is true of every
              board and tells an Author nothing about which one they are about
              to change — and by this point they may have arrived from Data
              sources, where they chose.
            */}
            {initial ? 'Save changes' : boardName ? `Add to ${boardName}` : 'Add to dashboard'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Step({
  index,
  title,
  done,
  children,
}: {
  index: number
  title: string
  done: boolean
  children: React.ReactNode
}) {
  return (
    <section className="a-step">
      <h3 className="a-step__title">
        <span className={`a-step__index ${done ? 'a-step__index--done' : ''}`}>
          {done ? '✓' : index}
        </span>
        {title}
      </h3>
      <div className="a-step__body">{children}</div>
    </section>
  )
}

/** Only the widgets this dataset can fill, with its declared fits promoted. */
function TypePicker({
  dataset,
  query,
  onQuery,
  onPick,
}: {
  dataset: Dataset
  query: string
  onQuery: (next: string) => void
  onPick: (typeId: string) => void
}) {
  const available = typesFor(dataset)
  const suggested = suggestedTypesFor(dataset)
  const unavailable = unavailableTypesFor(dataset)
  const term = query.trim().toLowerCase()

  /*
   * Every built type is rendered, and the ones this Dataset cannot fill are
   * locked in place rather than left out.
   *
   * The rule used to be that an unbuildable widget is simply absent, which is
   * right when the absence is obvious and wrong when it is not. Measured against
   * a real declaration it is badly wrong: `peniremit.profit` offers 20 of 37
   * types, and **three whole families disappear** — Composition, Ranking & Flow
   * and Geospatial. An Author who came to build a pie chart finds no pie chart
   * and no explanation, and cannot tell "this product has none" from "not with
   * this data".
   *
   * So a locked card says which of those it is. The reason is the substance,
   * because the three kinds call for different actions: one is ours to raise
   * with the Analytics team, one is the publisher's to declare, and one is
   * nobody's — it is simply the wrong data for that picture.
   */
  const matching = (type: { label: string; description: string; family: string }) =>
    !term ||
    type.label.toLowerCase().includes(term) ||
    type.description.toLowerCase().includes(term) ||
    FAMILIES.find((family) => family.id === type.family)?.label.toLowerCase().includes(term)

  const matches = available.filter(matching)
  const lockedMatches = unavailable.filter((entry) => matching(entry.type))
  const suggestedMatches = matches.filter((type) => suggested.includes(type))

  return (
    <>
      <p className="a-muted a-step__hint">
        {/* Said plainly rather than hidden: the shorter list is the point of
            choosing data first, but you should know it is a shorter list. */}
        {available.length} of {BUILT_COUNT} widget types can show {dataset.name}.
      </p>

      <input
        className="a-input"
        value={query}
        placeholder="Search widgets — funnel, map, over time…"
        onChange={(event) => onQuery(event.target.value)}
      />

      {matches.length === 0 && lockedMatches.length === 0 && (
        <p className="a-muted a-step__hint">Nothing matches “{query}”.</p>
      )}

      {suggestedMatches.length > 0 && (
        <div className="a-type-group">
          <h4 className="a-type-group__title">
            Suggested
            <span className="a-muted"> — what this data is for</span>
          </h4>
          <div className="a-type-grid">
            {suggestedMatches.map((type) => (
              <TypeButton key={type.id} type={type} onPick={onPick} suggested />
            ))}
          </div>
        </div>
      )}

      {FAMILIES.map((family) => {
        const inFamily = matches.filter((type) => type.family === family.id)
        const lockedInFamily = lockedMatches.filter((entry) => entry.type.family === family.id)
        if (inFamily.length === 0 && lockedInFamily.length === 0) return null

        return (
          <div key={family.id} className="a-type-group">
            <h4 className="a-type-group__title">
              {family.label}
              <span className="a-muted"> — {family.question}</span>
            </h4>
            <div className="a-type-grid">
              {inFamily.map((type) => (
                <TypeButton key={type.id} type={type} onPick={onPick} />
              ))}
              {/*
                After the available ones, so the list a person came to use reads
                first — but in the same grid, because a family whose every type
                is locked must still appear. That is the case this exists for.
              */}
              {lockedInFamily.map((entry) => (
                <LockedType key={entry.type.id} type={entry.type} reason={entry.reason} />
              ))}
            </div>
          </div>
        )
      })}
    </>
  )
}

/**
 * A widget type this Dataset cannot fill, shown rather than hidden.
 *
 * Not a disabled button. A `<button disabled>` is unreachable by keyboard and
 * carries no accessible description, so the reason — the whole point of drawing
 * it — would be invisible to anyone not looking at it. This is a plain element
 * that states the shortfall in text.
 */
function LockedType({
  type,
  reason,
}: {
  type: { id: string; label: string; description: string }
  reason: UnavailableReason
}) {
  return (
    <div className="a-type a-type--locked">
      {/*
        No lock glyph. The dashed edge carries it visually and the reason
        carries it in text, where a bare "·" beside the label read as a typo.
      */}
      <span className="a-type__label">{type.label}</span>
      <span className="a-type__description">{type.description}</span>
      <span className={`a-type__reason a-type__reason--${reason.kind}`}>{reason.because}</span>
    </div>
  )
}

function TypeButton({
  type,
  onPick,
  suggested = false,
}: {
  type: { id: string; label: string; description: string }
  onPick: (typeId: string) => void
  suggested?: boolean
}) {
  return (
    <button
      type="button"
      className={`a-type ${suggested ? 'a-type--suggested' : ''}`}
      onClick={() => onPick(type.id)}
    >
      <span className="a-type__label">{type.label}</span>
      <span className="a-type__description">{type.description}</span>
    </button>
  )
}

/**
 * Width as columns, not pixels.
 *
 * A twelve-column board is the only thing a span means, so the control shows
 * twelve segments and you click the width you want. A number input would be
 * more compact and would make you translate "half the board" into "6".
 */
function SpanControl({ span, onChange }: { span: number; onChange: (next: number) => void }) {
  return (
    <div className="a-field">
      <div className="a-field__label">
        <span>Width</span>
        <span className="a-field__note">{span} of 12</span>
      </div>
      <div className="a-span" role="group" aria-label="Widget width in columns">
        {Array.from({ length: 12 }, (_, index) => index + 1).map((column) => (
          <button
            key={column}
            type="button"
            className={`a-span__cell ${column <= span ? 'a-span__cell--on' : ''}`}
            aria-label={`${column} of 12 columns`}
            aria-pressed={column === span}
            onClick={() => onChange(column)}
          />
        ))}
      </div>
      <p className="a-field__help">How much of the board's width this widget takes.</p>
    </div>
  )
}

/** A binding counts only when it holds a value; `''` is an empty select. */
const bindingOf = (bindings: Record<string, string | number>, name: string) => {
  const value = bindings[name]
  return value === '' || value === undefined ? undefined : value
}

/**
 * Values the Author fixes for the Dataset's Filter Parameters — D24.
 *
 * Only the required ones are collected here. An optional parameter is better
 * served by exposing it to Viewers, and offering an Author a form field for
 * every parameter a Dataset publishes would bury the two that matter.
 *
 * This reads as a question rather than a setting because that is what it is:
 * the Source System has said it cannot answer without this, so the Author is
 * being asked to complete the query, not to configure a preference.
 */
function RequiredParameters({
  dataset,
  bindings,
  onChange,
}: {
  dataset: Dataset
  bindings: Record<string, string | number>
  onChange: (next: Record<string, string | number>) => void
}) {
  const required = requiredParameters(dataset)
  if (required.length === 0) return null

  const set = (name: string, raw: string, allowed: (string | number)[] | undefined) => {
    // A numeric parameter's values are compared against JSON numbers upstream,
    // so the original is recovered from the declared list rather than left as
    // the string the select handed back.
    const original = allowed?.find((entry) => String(entry) === raw)
    onChange({ ...bindings, [name]: original ?? raw })
  }

  return (
    <div className="a-field">
      <span className="a-field__label">This data source needs</span>
      <p className="a-field__help">
        {dataset.name} cannot answer without {required.length === 1 ? 'this' : 'these'}. Viewers do
        not change {required.length === 1 ? 'it' : 'them'} — {required.length === 1 ? 'it is' : 'they are'} part
        of what this widget asks for.
      </p>

      {required.map((parameter) => {
        const value = bindings[parameter.name]
        const current = value === undefined ? '' : String(value)

        return (
          <label key={parameter.name} className="a-filters__field">
            <span className="a-filters__label">{parameter.label}</span>
            {parameter.allowedValues && parameter.allowedValues.length > 0 ? (
              <select
                className="a-filters__select"
                value={current}
                onChange={(event) => set(parameter.name, event.target.value, parameter.allowedValues)}
              >
                <option value="">Choose one</option>
                {parameter.allowedValues.map((entry) => (
                  <option key={String(entry)} value={String(entry)}>
                    {String(entry)}
                  </option>
                ))}
              </select>
            ) : (
              /*
               * No declared values, so no list to offer. The publisher knows what
               * this accepts and has not said — Finding 8 — and a free field is
               * the honest fallback rather than a guess drawn from returned rows.
               */
              <input
                type="text"
                className="a-filters__select"
                value={current}
                onChange={(event) => set(parameter.name, event.target.value, undefined)}
                placeholder={parameter.description ?? 'Required'}
              />
            )}
          </label>
        )
      })}
    </div>
  )
}

/**
 * Which of a Dataset's Fields a Viewer may act on — FR-VZ-06.
 *
 * The list is the *publisher's*, not everything the Dataset has. FR-DP-05 lets a
 * Source System say a Field may not be filtered or sorted on, and an Author
 * cannot expose what was withheld. Fields that were withheld are absent rather
 * than shown disabled: a checkbox nobody may ever tick is an invitation to ask
 * why, and the answer is not the Author's to give.
 */
function ExposeControl({
  dataset,
  filters,
  sorts,
  onChangeFilters,
  onChangeSorts,
}: {
  dataset: Dataset
  filters: string[]
  sorts: string[]
  onChangeFilters: (next: string[]) => void
  onChangeSorts: (next: string[]) => void
}) {
  const filterable = dataset.fields.filter((field) => field.filterable)
  const sortable = dataset.fields.filter((field) => field.sortable)

  if (filterable.length === 0 && sortable.length === 0) return null

  const toggle = (list: string[], key: string) =>
    list.includes(key) ? list.filter((entry) => entry !== key) : [...list, key]

  return (
    <div className="a-field">
      <span className="a-field__label">Let viewers</span>
      <p className="a-field__help">
        Viewers change what this widget shows for themselves. It does not change the board.
      </p>

      {filterable.length > 0 && (
        <fieldset className="a-expose">
          <legend className="a-expose__legend">Filter by</legend>
          {filterable.map((field) => (
            <label key={field.key} className="a-expose__item">
              <input
                type="checkbox"
                checked={filters.includes(field.key)}
                onChange={() => onChangeFilters(toggle(filters, field.key))}
              />
              <span>{field.label}</span>
            </label>
          ))}
        </fieldset>
      )}

      {sortable.length > 0 && (
        <fieldset className="a-expose">
          <legend className="a-expose__legend">Sort by</legend>
          {sortable.map((field) => (
            <label key={field.key} className="a-expose__item">
              <input
                type="checkbox"
                checked={sorts.includes(field.key)}
                onChange={() => onChangeSorts(toggle(sorts, field.key))}
              />
              <span>{field.label}</span>
            </label>
          ))}
        </fieldset>
      )}
    </div>
  )
}

/**
 * What the preview says before there is anything to draw.
 *
 * Three states rather than two. The prompt to choose a source is only useful
 * when there is one to choose — with an empty Catalogue it asks for something
 * impossible, beside a panel already explaining why, which reads as the screen
 * disagreeing with itself.
 */
export function previewPrompt({
  hasDataset,
  hasSources,
}: {
  hasDataset: boolean
  hasSources: boolean
}): string {
  if (hasDataset) return 'Pick a widget to see it here.'
  if (!hasSources) return 'Nothing to preview yet.'
  return 'Choose a data source to begin.'
}
