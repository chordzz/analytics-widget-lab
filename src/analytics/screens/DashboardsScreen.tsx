/**
 * Dashboards — the landing screen.
 *
 * Opens straight into a board rather than a list of links. The whole point of
 * this module is judging how widgets look together, and a list of names shows
 * none of that.
 *
 * Reads from the boards store, so a board published from the builder appears
 * here immediately, and editing one is a click rather than a different flow.
 *
 * **Editing happens here**, not only in the builder. The `Edit` action has been
 * on every Widget card since `GridBoard` was written, and this screen rendered
 * the same component without `editable` — so the one board you were looking at
 * was the one board you could not change, and the way to change it was a button
 * that navigated somewhere else. Judging widgets together is the point of the
 * screen; leaving it to adjust one defeats that.
 */

import { useState } from 'react'
import { GridBoard } from '../builder/GridBoard'
import { BoardControls } from '../builder/BoardControls'
import { WidgetComposer } from '../builder/WidgetComposer'
import { useBoardControls } from '../builder/useBoardControls'
import { useWidgetComposer } from '../builder/useWidgetComposer'
import { placedWidgets, widgetCountOf } from '../builder/boards'
import { useBoards } from '../builder/useBoards'
import { useAnalyticsData, useMay } from '../data/AnalyticsData'
import type { ScreenId } from '../shell/nav'

export function DashboardsScreen({ onNavigate }: { onNavigate: (screen: ScreenId) => void }) {
  const boards = useBoards()
  const [activeId, setActiveId] = useState<string | null>(null)

  // Prefer a published board, but fall back to whatever exists rather than
  // showing an empty screen just because nothing has been published yet.
  const active =
    boards.boards.find((board) => board.id === activeId) ??
    boards.published[0] ??
    boards.boards[0]

  const controls = useBoardControls(active)
  const composer = useWidgetComposer(active?.id)

  /*
   * A mode, not a permanent state. A published board is something other people
   * are reading, and one stray drag on a board that is always draggable
   * rearranges what they see. Arranging is a thing you decide to do.
   */
  const [arranging, setArranging] = useState(false)

  /*
   * Two conditions, and they fail differently.
   *
   * `dashboard.update` is the permission the API checks on PATCH, and unknown
   * offers the affordance — the API enforces regardless, so a wrongly offered
   * button costs one refusal and a wrongly hidden one costs somebody the
   * feature with nothing on screen to explain it.
   *
   * Authorship is not like that. The API is "creator or Administrator only",
   * and a board reaches somebody else's screen through a Share Grant or a
   * Scope — they are readers. Offering every reader of a shared board an
   * Arrange button that always ends in a refusal is not the generous side of
   * the asymmetry; it is a button that does not work.
   *
   * **Administrators lose it, and that is a known cost.** Nothing in the model
   * says who one is: `ViewerIdentity` carries no flag, `/v1/me` publishes no
   * role, and `analytics.administer` was deliberately ruled out as a superuser
   * key because the spec scopes it to Source System registration. So an
   * Administrator fixing someone else's board has to use the API. Restoring it
   * needs a signal that does not exist yet rather than a different rule here.
   */
  const { viewer } = useAnalyticsData()
  const isAuthor = active?.authorId === viewer.id
  const mayEdit = useMay('dashboard.update') && isAuthor

  // An empty state shown while the store is still answering reads as "you have
  // nothing", which is a different and more alarming claim than "not yet".
  if (boards.loading) return <p className="a-muted">Loading your boards…</p>

  if (!active) {
    return (
      <div className="a-empty">
        <h3>No dashboards yet</h3>
        <p>Build one and it will appear here.</p>
        <button
          type="button"
          className="a-button a-button--primary"
          onClick={() => {
            boards.createBoard()
            onNavigate('create')
          }}
        >
          Create a dashboard
        </button>
      </div>
    )
  }

  if (composer.composing) {
    return (
      <WidgetComposer
        boardName={active.name}
        initial={composer.initial}
        startWith={composer.startWith}
        onCommit={composer.commit}
        onCancel={composer.close}
      />
    )
  }

  return (
    <div>
      <div className="a-tabs">
        {boards.boards.map((board) => (
          <button
            key={board.id}
            type="button"
            className={`a-button ${board.id === active.id ? 'a-button--primary' : ''}`}
            onClick={() => setActiveId(board.id)}
          >
            {board.name}
            {board.status === 'draft' && <span className="a-tabs__flag">· Draft</span>}
          </button>
        ))}
      </div>

      <div className="a-board-head a-board-head--compact">
        <p className="a-muted">
          {active.description ? `${active.description} · ` : ''}
          {widgetCountOf(active)} {widgetCountOf(active) === 1 ? 'widget' : 'widgets'} · updated{' '}
          {active.updated}
        </p>
        {mayEdit && (
          <div className="a-board-head__actions">
            <button
              type="button"
              className={`a-button${arranging ? ' a-button--primary' : ''}`}
              aria-pressed={arranging}
              onClick={() => { setArranging((on) => !on) }}
            >
              {arranging ? 'Done' : 'Arrange'}
            </button>
            {arranging && (
              <button type="button" className="a-button" onClick={() => { composer.open('new') }}>
                Add widget
              </button>
            )}
            <button
              type="button"
              className="a-button"
              onClick={() => {
                boards.openBoard(active.id)
                onNavigate('create')
              }}
            >
              Open in builder
            </button>
          </div>
        )}
      </div>

      {/*
        The same component the builder renders — which is why a board looks
        identical in both, and why switching `editable` on was all that editing
        here required. The gestures stay off until asked for.
      */}
      <BoardControls
        controls={active.controls}
        widgets={placedWidgets(active)}
        values={controls.values}
        onChange={controls.setValues}
      />

      <GridBoard
        widgets={placedWidgets(active)}
        contributionFor={controls.contribution}
        sections={active.sections}
        editable={arranging}
        onEdit={composer.open}
        onDuplicate={(widgetId) => { boards.duplicateWidget(active.id, widgetId) }}
        onRemove={(widgetId) => { boards.removeWidget(active.id, widgetId) }}
        onLayoutChange={(placements) => { boards.applyLayout(active.id, placements) }}
        empty={
          <div className="a-empty">
            <h3>{active.name} is empty</h3>
            <p>Open it in the builder to add widgets.</p>
          </div>
        }
      />
    </div>
  )
}
