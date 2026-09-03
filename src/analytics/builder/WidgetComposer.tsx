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
import { FieldMapper, fieldSummary } from './FieldMapper'
import {
  autoMap,
  isComplete,
  satisfies,
  suggestedTypesFor,
  typesFor,
  unfilledSlots,
} from './requirements'
import { WIDGET_TYPES } from '../widgets/catalog'
import type { Dataset } from '../data/types'

export interface ComposerDraft {
  typeId: string
  datasetId: string
  title: string
  subtitle?: string
  mapping: WidgetMapping
  span: number
}

const BUILT_COUNT = WIDGET_TYPES.filter((type) => type.built).length

/** Opens on an existing widget, or empty to start from the data source. */
export function WidgetComposer({
  initial,
  startWith,
  onCommit,
  onCancel,
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
  onCancel: () => void
}) {
  const { datasets } = useDatasets()
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

  const complete = Boolean(dataset && type) && isComplete(typeId, mapping)
  const missing = typeId ? unfilledSlots(typeId, mapping) : []

  const preview: WidgetSpec | null =
    dataset && type
      ? { id: 'preview', typeId, datasetId, title: title.trim() || type.label, mapping }
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
            <p>{dataset ? 'Pick a widget to see it here.' : 'Choose a data source to begin.'}</p>
          </div>
        )}

        {missing.length > 0 && (
          <p className="a-composer__missing">
            Still needed: {missing.map((slot) => slot.label.toLowerCase()).join(', ')}.
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
              })
            }
          >
            {initial ? 'Save changes' : 'Add to dashboard'}
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
  const term = query.trim().toLowerCase()

  const matches = term
    ? available.filter(
        (type) =>
          type.label.toLowerCase().includes(term) ||
          type.description.toLowerCase().includes(term) ||
          FAMILIES.find((family) => family.id === type.family)?.label.toLowerCase().includes(term),
      )
    : available

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

      {matches.length === 0 && <p className="a-muted a-step__hint">Nothing matches “{query}”.</p>}

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
        if (inFamily.length === 0) return null

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
            </div>
          </div>
        )
      })}
    </>
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
