/**
 * Drafts — boards not yet published.
 *
 * A list, unusually for this module, because a draft's useful properties are
 * its name, its size and when you last touched it. A wall of miniature boards
 * would be prettier and would answer none of those. The thumbnail strip of
 * widget types is the compromise: enough to recognise a board without
 * pretending to be a preview.
 */

import { placedWidgets, widgetCountOf } from '../builder/boards'
import { useBoards } from '../builder/useBoards'
import { widgetType } from '../widgets/catalog'
import type { Board } from '../builder/boards'
import type { ScreenId } from '../shell/nav'

export function DraftsScreen({ onNavigate }: { onNavigate: (screen: ScreenId) => void }) {
  const boards = useBoards()

  if (boards.loading) return <p className="a-muted">Loading your boards…</p>

  if (boards.drafts.length === 0) {
    return (
      <div className="a-empty">
        <h3>No drafts</h3>
        <p>Boards you start but have not published will wait here.</p>
        <button
          type="button"
          className="a-button a-button--primary"
          onClick={() => {
            boards.createBoard()
            onNavigate('create')
          }}
        >
          Start a dashboard
        </button>
      </div>
    )
  }

  return (
    <ul className="a-list">
      {boards.drafts.map((board) => (
        <DraftRow
          key={board.id}
          board={board}
          onOpen={() => {
            boards.openBoard(board.id)
            onNavigate('create')
          }}
          onPublish={() => boards.publishBoard(board.id)}
          onDelete={() => boards.deleteBoard(board.id)}
        />
      ))}
    </ul>
  )
}

function DraftRow({
  board,
  onOpen,
  onPublish,
  onDelete,
}: {
  board: Board
  onOpen: () => void
  onPublish: () => void
  onDelete: () => void
}) {
  const types = placedWidgets(board)
    .map((widget) => widgetType(widget.typeId)?.label)
    .filter((label): label is string => Boolean(label))

  return (
    <li className="a-list__row">
      <button type="button" className="a-list__main" onClick={onOpen}>
        <span className="a-list__name">{board.name}</span>
        <span className="a-list__meta">
          {widgetCountOf(board)} {widgetCountOf(board) === 1 ? 'widget' : 'widgets'} · updated{' '}
          {board.updated}
        </span>
        {types.length > 0 && (
          <span className="a-list__tags">
            {/* Four is what fits before the row wraps and stops being a row. */}
            {types.slice(0, 4).map((label, index) => (
              <span key={`${label}-${index}`} className="a-tag">
                {label}
              </span>
            ))}
            {types.length > 4 && <span className="a-tag">+{types.length - 4}</span>}
          </span>
        )}
      </button>

      <div className="a-list__actions">
        <button
          type="button"
          className="a-button"
          disabled={widgetCountOf(board) === 0}
          onClick={onPublish}
        >
          Publish
        </button>
        <button type="button" className="a-button a-button--danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </li>
  )
}
