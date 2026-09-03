/**
 * Dashboards — the landing screen.
 *
 * Opens straight into a board rather than a list of links. The whole point of
 * this module is judging how widgets look together, and a list of names shows
 * none of that.
 *
 * Reads from the boards store, so a board published from the builder appears
 * here immediately, and editing one is a click rather than a different flow.
 */

import { useState } from 'react'
import { GridBoard } from '../builder/GridBoard'
import { useBoards } from '../builder/useBoards'
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
          {active.widgets.length} {active.widgets.length === 1 ? 'widget' : 'widgets'} · updated{' '}
          {active.updated}
        </p>
        <button
          type="button"
          className="a-button"
          onClick={() => {
            boards.openBoard(active.id)
            onNavigate('create')
          }}
        >
          Edit
        </button>
      </div>

      {/*
        The same component the builder renders, with the gestures switched off.
        A published board that laid its widgets out even slightly differently
        would make the builder untrustworthy.
      */}
      <GridBoard
        widgets={active.widgets}
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
