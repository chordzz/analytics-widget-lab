/**
 * Create — the builder.
 *
 * A board being edited, with the composer opening over it when you add or edit
 * a widget. The board stays the subject of the screen; the composer is the
 * detour. That is the opposite of a wizard, and it is what lets you add six
 * widgets without ever leaving the thing you are building.
 *
 * The composer itself runs data first — see `WidgetComposer`.
 */

import { useEffect, useState } from 'react'
import { GridBoard } from '../builder/GridBoard'
import { WidgetComposer, type ComposerDraft } from '../builder/WidgetComposer'
import { useBoards } from '../builder/useBoards'
import { useComposeIntent } from '../builder/useComposeIntent'
import type { PlacedWidget } from '../builder/boards'
import type { ScreenId } from '../shell/nav'

export function CreateScreen({ onNavigate }: { onNavigate: (screen: ScreenId) => void }) {
  const boards = useBoards()
  const { editing } = boards

  const intent = useComposeIntent()

  /**
   * What the composer is doing, if it is open.
   *
   * `new` — the add flow from scratch.
   * `{ datasetId }` — the add flow, arriving from Data sources with the source
   *   already chosen.
   * a `PlacedWidget` — editing that widget.
   */
  const [composing, setComposing] = useState<'new' | { datasetId: string } | PlacedWidget | null>(
    null,
  )

  // "Build a widget" on Data sources navigates here and leaves the dataset
  // behind it. Taken exactly once — see `takeIntent`.
  useEffect(() => {
    const datasetId = intent.takeIntent()
    if (datasetId) setComposing({ datasetId })
  }, [intent])

  // Arriving with nothing open should start a board, not show an error. The
  // store decides whether that means adopting a blank draft or making one — see
  // `ensure-editing`, which is idempotent precisely because this effect is not.
  useEffect(() => {
    // Not while the store is still answering. Creating a board because the load
    // has not resolved yet leaves a blank draft behind on every single visit,
    // and the one you were actually editing arrives a moment later beside it.
    if (!boards.loading && !editing) boards.ensureEditing()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, boards.loading])

  if (boards.loading) return <p className="a-muted">Loading your boards…</p>
  if (!editing) return null

  const isEditing = (value: typeof composing): value is PlacedWidget =>
    value !== null && value !== 'new' && 'id' in value

  const commit = (draft: ComposerDraft) => {
    if (!isEditing(composing)) {
      boards.addWidget(
        editing.id,
        {
          typeId: draft.typeId,
          datasetId: draft.datasetId,
          title: draft.title,
          mapping: draft.mapping,
        },
        { w: draft.span },
      )
    } else {
      boards.updateWidget(
        editing.id,
        {
          ...composing,
          typeId: draft.typeId,
          datasetId: draft.datasetId,
          title: draft.title,
          mapping: draft.mapping,
        },
        draft.span,
      )
    }
    setComposing(null)
  }

  if (composing) {
    return (
      <WidgetComposer
        initial={
          isEditing(composing)
            ? {
                typeId: composing.typeId,
                datasetId: composing.datasetId,
                title: composing.title ?? '',
                mapping: composing.mapping,
                span: composing.w,
              }
            : undefined
        }
        startWith={composing !== 'new' && !isEditing(composing) ? composing : undefined}
        onCommit={commit}
        onCancel={() => setComposing(null)}
      />
    )
  }

  return (
    <div>
      <div className="a-board-head">
        <input
          className="a-input a-input--title"
          value={editing.name}
          aria-label="Dashboard name"
          onChange={(event) => boards.renameBoard(editing.id, event.target.value)}
        />

        <div className="a-board-head__actions">
          <span className="a-muted">
            {editing.widgets.length} {editing.widgets.length === 1 ? 'widget' : 'widgets'} ·{' '}
            {editing.status === 'published' ? 'Published' : 'Draft'}
          </span>
          <button type="button" className="a-button" onClick={() => setComposing('new')}>
            Add widget
          </button>
          {editing.status === 'draft' ? (
            <button
              type="button"
              className="a-button a-button--primary"
              disabled={editing.widgets.length === 0}
              onClick={() => {
                boards.publishBoard(editing.id)
                onNavigate('dashboards')
              }}
            >
              Publish
            </button>
          ) : (
            <button
              type="button"
              className="a-button"
              onClick={() => boards.unpublishBoard(editing.id)}
            >
              Unpublish
            </button>
          )}
        </div>
      </div>

      <GridBoard
        widgets={editing.widgets}
        editable
        onLayoutChange={(placements) => boards.applyLayout(editing.id, placements)}
        onEdit={(widget) => setComposing(widget)}
        onDuplicate={(id) => boards.duplicateWidget(editing.id, id)}
        onRemove={(id) => boards.removeWidget(editing.id, id)}
        empty={
          <div className="a-empty">
            <h3>Nothing on this board yet</h3>
            <p>
              Start by choosing a data source. You will then be offered only the widgets that can
              actually show it — no guessing, and nothing that fails after you pick it.
            </p>
            <button
              type="button"
              className="a-button a-button--primary"
              onClick={() => setComposing('new')}
            >
              Add the first widget
            </button>
          </div>
        }
      />
    </div>
  )
}
