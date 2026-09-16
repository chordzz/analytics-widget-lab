/**
 * Data sources — what a widget can be pointed at.
 *
 * Shape first, rows second. When picking data for a widget the question is
 * "does this have a time dimension and two measures", not "what is in row 4",
 * so the field summary leads and a sample is available behind it.
 *
 * Since the builder now starts from data, this screen is a legitimate entry
 * point to it rather than just reference material — hence the shortcut in each
 * card's footer, which opens the composer already bound to that source.
 */

import { useId, useState, type ReactNode } from 'react'
import { useAnalyticsData, useCatalogue, useDataset } from '../data/AnalyticsData'
import { CatalogueProblem, NoDatasets } from '../data/CatalogueState'
import { WidgetCard } from '../widgets/WidgetCard'
import { typesFor } from '../builder/requirements'
import { useComposeIntent } from '../builder/useComposeIntent'
import { useBoards } from '../builder/useBoards'
import { AccessRecordPanel } from './AccessRecordPanel'
import type { Dataset, Field } from '../data/types'
import type { DatasetSummary } from '../../catalogue/port'
import type { ScreenId } from '../shell/nav'

export function DataScreen({ onNavigate }: { onNavigate: (screen: ScreenId) => void }) {
  const { summaries, loading, failure } = useCatalogue()
  const { accessRecordIsComplete } = useAnalyticsData()

  if (loading) {
    return (
      <p className="a-muted" style={{ margin: 0 }}>
        Loading the catalogue…
      </p>
    )
  }

  /*
   * Four outcomes, told apart.
   *
   * This screen used to render one sentence for all of them — a `403`, a `503`
   * and a Catalogue with nothing in it all arrived as "0 datasets", under copy
   * that called them mock. They need three different things from whoever is
   * reading: ask for access, wait and retry, publish something. Collapsing them
   * is the same mistake the six render states exist to prevent, on the screen
   * someone opens first to find out whether the backend works at all.
   */
  if (failure) return <CatalogueProblem failure={failure} />
  if (summaries.length === 0) return <NoDatasets />

  return (
    <>
      <div style={{ display: 'grid', gap: 'var(--a-space-4)' }}>
        <p className="a-muted" style={{ margin: 0 }}>
          {summaries.length} data {summaries.length === 1 ? 'source' : 'sources'} you can build
          from.
        </p>

        {summaries.map((summary) => (
          <DatasetCard key={summary.id} summary={summary} onNavigate={onNavigate} />
        ))}
      </div>

      {/*
        Fixtures only. The access record is fed by the retrieval adapter and
        only the fixture one feeds it, so against a real Source System it would
        sit at zero for ever — under a heading promising every retrieval of
        personal data. That reads as "nobody has read any", which is an
        assertion and a false one.

        FR-DA-14 binds the Source System, not us, and the API publishes no
        endpoint for reading such a log. So there is nothing to show and no
        panel: an explanation of its own emptiness is not content.
      */}
      {accessRecordIsComplete && <AccessRecordPanel />}
    </>
  )
}

/**
 * One source, described only when opened.
 *
 * **The listing costs one request now.** It used to cost one *per Dataset*: the
 * screen asked the Catalogue for every Field of every source on every visit, so
 * fifty sources meant fifty-one requests before anything was on screen. All of
 * it to draw two things — the Field pills and the "N widget types can show this"
 * count — that only matter once somebody is considering this particular source.
 *
 * So the collapsed card is drawn from the listing alone, which already carries
 * the shape summary, and the detail is fetched when it is asked for. Which is
 * also the order the screen was designed around: shape first, specifics second.
 */
function DatasetCard({
  summary,
  onNavigate,
}: {
  summary: DatasetSummary
  onNavigate: (screen: ScreenId) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <WidgetCard
      title={summary.name}
      subtitle={summary.sourceSystem}
      actions={[
        {
          label: open ? 'Hide details' : 'Show details',
          onSelect: () => setOpen(!open),
        },
      ]}
      footer={
        <div className="a-source-foot">
          <span className="a-muted">
            {summary.timeDimensionCount} time · {summary.dimensionCount} dimension
            {summary.dimensionCount === 1 ? '' : 's'} · {summary.measureCount} measure
            {summary.measureCount === 1 ? '' : 's'}
          </span>
          <BuildWidget datasetId={summary.id} onNavigate={onNavigate} />
        </div>
      }
    >
      <div>
        <p className="a-muted" style={{ margin: 0 }}>
          {summary.description}
        </p>
        {open && <DatasetDetail datasetId={summary.id} />}
      </div>
    </WidgetCard>
  )
}

/**
 * Build a widget from this source, and say where it will go.
 *
 * The button used to navigate and leave the destination implicit — the widget
 * landed on whichever board happened to be open, or on a blank draft the visit
 * quietly created. Both are defensible defaults and neither was stated, so the
 * one thing an Author could not find out was the thing the button did.
 *
 * The destination is chosen here rather than in the composer because it is a
 * decision about *this source*, taken before any of the composing starts — and
 * because a control at the end of a flow is one people discover after they have
 * already committed.
 */
function BuildWidget({
  datasetId,
  onNavigate,
}: {
  datasetId: string
  onNavigate: (screen: ScreenId) => void
}) {
  const { composeWith } = useComposeIntent()
  const boards = useBoards()
  const { viewer } = useAnalyticsData()
  const selectId = useId()

  /*
   * Only boards this Author wrote.
   *
   * `published` carries every board the Viewer may *see*, which is a wider set
   * than the ones they may add a widget to — the API gates updates on the
   * creator, so offering someone else's board would produce a 403 at save time
   * with the widget already composed.
   */
  const mine = boards.boards.filter((board) => board.authorId === viewer.id)

  // The board already open is the likeliest destination and the least
  // surprising default, since it is what the old behaviour did.
  const [target, setTarget] = useState<string>(() => boards.editing?.id ?? '')

  const chosen = mine.some((board) => board.id === target) ? target : ''

  return (
    <div className="a-source-build">
      {mine.length > 0 && (
        <>
          <label className="a-source-build__label" htmlFor={selectId}>
            Add to
          </label>
          <select
            id={selectId}
            className="a-filters__select a-source-build__select"
            value={chosen}
            onChange={(event) => setTarget(event.target.value)}
          >
            {mine.map((board) => (
              <option key={board.id} value={board.id}>
                {board.name}
                {board.status === 'draft' ? ' — draft' : ''}
              </option>
            ))}
            {/* An empty value is the *chosen* new board, not an absent answer —
                `composeWith` reads it as an explicit null. */}
            <option value="">New dashboard</option>
          </select>
        </>
      )}

      <button
        type="button"
        className="a-button a-button--primary"
        onClick={() => {
          composeWith(datasetId, chosen === '' ? null : chosen)
          onNavigate('create')
        }}
      >
        Build a widget
      </button>
    </div>
  )
}

/**
 * What the publisher declared about this source — and nothing they serve.
 *
 * This used to end with twenty live records, which cost a query per expansion
 * and could not work at all for a Dataset with required Filter Parameters: the
 * panel has no Author to ask for a date range and cannot invent one, because an
 * arbitrary slice presented as "a sample" is a claim about the data that nobody
 * made.
 *
 * Records belong to the composer, where a person is making choices and the
 * preview is the real widget answering to them. Here the question is only
 * whether this source is worth taking further, and the declaration answers it:
 * what the Fields are, what one row means, what can be filtered, and how much
 * can be drawn from it.
 */
function DatasetDetail({ datasetId }: { datasetId: string }) {
  const { dataset, loading, failure } = useDataset(datasetId)

  if (loading) {
    return (
      <p className="a-muted" style={{ margin: 'var(--a-space-3) 0 0', fontSize: 'var(--a-text-xs)' }}>
        Loading details…
      </p>
    )
  }

  if (failure) {
    return (
      <div style={{ marginTop: 'var(--a-space-3)' }}>
        <CatalogueProblem failure={failure} />
      </div>
    )
  }

  if (!dataset) {
    // The Catalogue answered and has no such Dataset. It was listed a moment
    // ago, so it has been withdrawn since — not a fault, and not an empty one.
    return (
      <p className="a-muted" style={{ margin: 'var(--a-space-3) 0 0', fontSize: 'var(--a-text-xs)' }}>
        This source is no longer available.
      </p>
    )
  }

  const buildable = typesFor(dataset).length
  const parameters = dataset.filterParameters ?? []

  return (
    <div className="a-source-detail">
      <Detail label="Fields">
        <div className="a-source-detail__pills">
          {dataset.fields.map((field) => (
            <span key={field.key} className="a-source-pill">
              {field.label}
              <span className="a-source-pill__role">{roleLabel(field.role)}</span>
              {field.role === 'measure' && field.aggregations.length > 0 && (
                /* What the publisher says this number can meaningfully do —
                   FR-DP-04, and the thing that decides which widgets can use it. */
                <span className="a-source-pill__note">{field.aggregations.join(', ')}</span>
              )}
            </span>
          ))}
        </div>
      </Detail>

      <Detail label="One row is">{grainNote(dataset)}</Detail>

      {parameters.length > 0 && (
        <Detail label="Filters this source accepts">
          <div className="a-source-detail__pills">
            {parameters.map((parameter) => (
              <span key={parameter.name} className="a-source-pill">
                {parameter.label}
                {parameter.required && (
                  /* Not a preference. The endpoint cannot answer without it, so
                     a widget over this source must supply one at composition
                     time or not be composable at all. */
                  <span className="a-source-pill__role">required</span>
                )}
                {parameter.allowedValues && (
                  <span className="a-source-pill__note">
                    {parameter.allowedValues.join(' · ')}
                  </span>
                )}
              </span>
            ))}
          </div>
        </Detail>
      )}

      <Detail label="Sensitivity">
        {sensitivityNote(dataset)}
      </Detail>

      <Detail label="Can be drawn as">
        {/* The useful half: whether this source is versatile or good for one thing. */}
        {buildable} widget {buildable === 1 ? 'type' : 'types'}
      </Detail>
    </div>
  )
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="a-source-detail__row">
      <span className="a-source-detail__label">{label}</span>
      <div className="a-source-detail__value">{children}</div>
    </div>
  )
}

const roleLabel = (role: Field['role']): string =>
  role === 'time-dimension' ? 'time' : role === 'measure' ? 'measure' : 'dimension'

/**
 * What one row represents — BE-2, and the thing an Author most needs before
 * binding a widget.
 *
 * `[]` is meaningful and absent is not: an empty grain says the endpoint answers
 * with a single summary row, which is exactly what a stat card wants and exactly
 * what a line chart cannot use. An absent one says the publisher has not told us.
 */
export function grainNote(dataset: Dataset): string {
  if (dataset.grain === undefined) return 'Not declared by the publisher.'
  if (dataset.grain.length === 0) return 'A single summary row over whatever you filter to.'

  const labels = dataset.grain.map((key) => dataset.fields.find((f) => f.key === key)?.label ?? key)
  return `One row per ${labels.join(' per ')}.`
}

/** Both halves, because they answer different questions. */
export function sensitivityNote(dataset: Dataset): string {
  const protection = `${dataset.classification[0].toUpperCase()}${dataset.classification.slice(1)}`
  // A Dataset can be confidential *and* personal; the API keeps them apart for
  // that reason, so saying only one of them would be half an answer.
  return dataset.exposesPersonalData
    ? `${protection}, and holds personal data.`
    : `${protection}.`
}

