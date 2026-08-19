/**
 * The editable board.
 *
 * The same grid the Dashboards screen renders, plus the handles to change it.
 * Deliberately the same component underneath rather than an "edit mode" variant,
 * because a builder that lays widgets out differently from the published board
 * is a builder you cannot trust.
 *
 * Reordering is native HTML5 drag-and-drop — no dependency, and it brings
 * keyboard-independent pointer handling for free. Because native DnD is
 * genuinely awkward with a keyboard, every drag has a button equivalent in the
 * widget's own menu; the drag is the fast path, not the only path.
 *
 * Resizing is a corner grip driven by pointer events rather than HTML5 drag —
 * a drag needs a drop target and a resize has none, and pointer capture keeps
 * the gesture alive when the cursor outruns the card. The grip is a real button,
 * so the arrow keys move it too.
 */

import { useRef, useState } from 'react'
import { Widget, type WidgetSpec } from '../widgets/Widget'
import { heightForType } from '../widgets/layout'
import { columnPitch, resizeByStep, resizeFromDrag, type Size } from './resize'

/** Matches `--a-space-4`, the board's grid gap. */
const BOARD_GAP = 16
const BOARD_COLUMNS = 12

export interface BoardCanvasProps {
  widgets: WidgetSpec[]
  onEdit: (widget: WidgetSpec) => void
  onDuplicate: (widgetId: string) => void
  onRemove: (widgetId: string) => void
  onResize: (widgetId: string, size: { span?: number; height?: number }) => void
  onMove: (from: number, to: number) => void
  /** Rendered when the board has nothing on it. */
  empty?: React.ReactNode
}

export function BoardCanvas({
  widgets,
  onEdit,
  onDuplicate,
  onRemove,
  onResize,
  onMove,
  empty,
}: BoardCanvasProps) {
  const [dragging, setDragging] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)

  /*
   * The size being dragged right now, held locally so the board follows the
   * pointer at frame rate without writing to the store — and, more to the point,
   * without stamping the board's `updated` date on every pixel of a gesture.
   * It is committed once, on release.
   */
  const [resizing, setResizing] = useState<{ id: string; size: Size } | null>(null)
  const board = useRef<HTMLDivElement>(null)

  if (widgets.length === 0) return <>{empty}</>

  /** The live size of a widget: mid-gesture if it is the one being dragged. */
  const sizeOf = (spec: WidgetSpec): Size =>
    resizing?.id === spec.id
      ? resizing.size
      : { span: spec.span ?? 4, height: spec.height ?? heightForType(spec.typeId) }

  const commit = (id: string, size: Size) => {
    onResize(id, size)
    setResizing(null)
  }

  const drop = (to: number) => {
    if (dragging !== null && dragging !== to) onMove(dragging, to)
    setDragging(null)
    setOver(null)
  }

  return (
    <div className="a-board a-board--editable" ref={board}>
      {widgets.map((spec, index) => {
        const size = sizeOf(spec)

        return (
        <div
          key={spec.id}
          className={[
            'a-board__item',
            'a-placed',
            dragging === index ? 'a-placed--dragging' : '',
            over === index && dragging !== index ? 'a-placed--over' : '',
            resizing?.id === spec.id ? 'a-placed--resizing' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={{ gridColumn: `span ${size.span}`, height: size.height }}
          // A card being resized must not also start a reorder drag.
          draggable={resizing === null}
          onDragStart={(event) => {
            setDragging(index)
            event.dataTransfer.effectAllowed = 'move'
            // Firefox refuses to start a drag without payload.
            event.dataTransfer.setData('text/plain', spec.id)
          }}
          onDragEnd={() => {
            setDragging(null)
            setOver(null)
          }}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
            if (over !== index) setOver(index)
          }}
          onDrop={(event) => {
            event.preventDefault()
            drop(index)
          }}
        >
          <Widget
            spec={spec}
            actions={[
              { label: 'Edit', onSelect: () => onEdit(spec) },
              { label: 'Duplicate', onSelect: () => onDuplicate(spec.id) },
              {
                label: 'Move earlier',
                onSelect: () => index > 0 && onMove(index, index - 1),
              },
              {
                label: 'Move later',
                onSelect: () => index < widgets.length - 1 && onMove(index, index + 1),
              },
              { label: 'Remove', onSelect: () => onRemove(spec.id), destructive: true },
            ]}
          />

          {/*
           * A corner grip, because that is where people reach for one. Width
           * snaps to whole columns — the grid has no finer setting — while
           * height is free within a step, since rows are only pixels.
           */}
          <button
            type="button"
            className="a-placed__grip"
            aria-label={`Resize ${spec.title ?? 'widget'}. Arrow keys adjust.`}
            onPointerDown={(event) => {
              // Ignore anything but a primary press, or a right-click starts a
              // resize that only ends when you press again somewhere else.
              if (event.button !== 0) return
              event.preventDefault()
              event.stopPropagation()

              const grip = event.currentTarget
              const startX = event.clientX
              const startY = event.clientY
              const origin = size
              // Captured once: the board cannot resize mid-gesture, and reading
              // it per-move would measure a board already changed by the drag.
              const pitch = columnPitch(
                board.current?.clientWidth ?? 0,
                BOARD_COLUMNS,
                BOARD_GAP,
              )

              // Pointer capture keeps the events coming to the grip even when
              // the cursor leaves it, which it immediately does.
              grip.setPointerCapture(event.pointerId)

              const move = (moveEvent: PointerEvent) =>
                setResizing({
                  id: spec.id,
                  size: resizeFromDrag(
                    origin,
                    moveEvent.clientX - startX,
                    moveEvent.clientY - startY,
                    pitch,
                  ),
                })

              const end = (endEvent: PointerEvent) => {
                grip.removeEventListener('pointermove', move)
                grip.removeEventListener('pointerup', end)
                grip.removeEventListener('pointercancel', end)
                commit(
                  spec.id,
                  resizeFromDrag(
                    origin,
                    endEvent.clientX - startX,
                    endEvent.clientY - startY,
                    pitch,
                  ),
                )
              }

              grip.addEventListener('pointermove', move)
              grip.addEventListener('pointerup', end)
              grip.addEventListener('pointercancel', end)
            }}
            onKeyDown={(event) => {
              const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
                event.key
              ]
              if (!step) return
              event.preventDefault()
              commit(spec.id, resizeByStep(size, step[0], step[1]))
            }}
          >
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              {/* Two strokes reading as a corner — the conventional grip. */}
              <path d="M9 1v8H1" stroke="currentColor" strokeWidth="1.4" fill="none" />
              <path d="M9 5.5V9H5.5" stroke="currentColor" strokeWidth="1.4" fill="none" />
            </svg>
          </button>

          {resizing?.id === spec.id && (
            <span className="a-placed__readout" aria-hidden="true">
              {size.span} × {size.height}
            </span>
          )}
        </div>
        )
      })}
    </div>
  )
}
