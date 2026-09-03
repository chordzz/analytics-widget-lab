/**
 * The board.
 *
 * One component for both the builder and the published view, differing only by
 * whether it is `editable`. Deliberately not an "edit mode" variant of a separate
 * read-only board: a builder that lays widgets out differently from the published
 * board is a builder you cannot trust, and the cheapest way to guarantee they
 * agree is for there to be only one of them.
 *
 * Placement is free — a widget can go anywhere on the twelve-column grid.
 * `react-grid-layout` supplies the gesture and the collision behaviour: drag onto
 * an occupied cell and the occupants are pushed **down**, then everything
 * compacts upward. Not a swap, and no holes left behind. That is Grafana's
 * behaviour, because Grafana is the same library underneath.
 *
 * Three things here are load-bearing and not obvious:
 *
 *   - **The store is the only source of truth.** The layout handed to the grid is
 *     derived from props on every render; nothing is mirrored in local state. The
 *     grid keeps its own working copy during a gesture and hands back the result,
 *     which is committed once.
 *   - **A collapsed board is a view, not a layout.** Below `STACK_BELOW` the
 *     widgets are stacked into one column, and that arrangement is never
 *     persisted — see `commit`.
 *   - **Keyboard moves go through the library's own algorithm.** Arrow keys call
 *     `moveElement` and then the compactor, so a nudge resolves collisions
 *     exactly the way a drag does. Reimplementing it would be a second answer to
 *     the same question, free to disagree with the first.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  GridLayout,
  cloneLayout,
  moveElement,
  useContainerWidth,
  verticalCompactor,
  type Layout,
  type LayoutItem,
} from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'

import { Widget } from '../widgets/Widget'
import { COLUMNS, MARGIN_X, MARGIN_Y, MAX_H, MIN_H, MIN_W, ROW_HEIGHT, clampH, clampW } from './grid'
import type { LayoutEntry, PlacedWidget } from './boards'
import type { Section } from '../../domain/composition'
import { SECTION_ROWS, collapsedLayout, sectionOf } from './sections'
import type { QueryContribution } from '../../composition/correspondence'

const MARGIN: readonly [number, number] = [MARGIN_X, MARGIN_Y]

/*
 * Section headings are grid items, not overlays.
 *
 * A heading has to *reserve* its rows, or it draws on top of whatever widget
 * happens to sit at that row — and an absolutely-positioned label cannot tell
 * the grid it is there. As a `static` item it holds its place, widgets flow
 * around it, and the compactor will not pull anything above it.
 *
 * The prefix is what keeps them out of the store: `toEntries` drops them, so a
 * heading never arrives at `apply-layout` pretending to be a widget placement.
 */
const SECTION_PREFIX = 'section:'
const sectionItemId = (id: string) => `${SECTION_PREFIX}${id}`
const isSectionItem = (i: string) => i.startsWith(SECTION_PREFIX)

/**
 * Below this container width the board stops being a grid.
 *
 * A twelve-column absolute layout means nothing on a phone: three columns of a
 * 360px screen is 90px, narrower than a card is allowed to be. So the widgets
 * stack in reading order and dragging switches off — there is nothing to arrange
 * in one column, and a gesture there would be recorded against a layout whose
 * other columns the user cannot see.
 *
 * Measured against the **container**, not the viewport, for the same reason the
 * cards use container queries: a board in a narrow panel on a wide monitor is
 * narrow. This replaces a `grid-column: span 12 !important` media query, which
 * stopped working the moment the grid began positioning by transform.
 */
const STACK_BELOW = 900

/** The stored placement, as the grid wants it. */
const sectionItems = (sections: readonly { section: Section; y: number }[]): LayoutItem[] =>
  sections.map((entry) => ({
    i: sectionItemId(entry.section.id),
    x: 0,
    y: entry.y,
    w: COLUMNS,
    h: SECTION_ROWS,
    static: true,
  }))

const toLayout = (widgets: readonly PlacedWidget[]): LayoutItem[] =>
  widgets.map((widget) => ({
    i: widget.id,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
    minW: MIN_W,
    minH: MIN_H,
    maxH: MAX_H,
  }))

/**
 * One column, in reading order, each widget keeping its own height.
 *
 * Sorted by row and then column — the order someone reading the wide board would
 * have gone in. `static` so nothing can be dragged into a second column that
 * does not exist.
 */
function stackedLayout(widgets: readonly PlacedWidget[]): LayoutItem[] {
  let y = 0

  return [...widgets]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((widget) => {
      const item = { i: widget.id, x: 0, y, w: COLUMNS, h: widget.h, static: true }
      y += widget.h
      return item
    })
}

const toEntries = (layout: Layout): LayoutEntry[] =>
  layout
    .filter((item) => !isSectionItem(item.i))
    .map((item) => ({ id: item.i, x: item.x, y: item.y, w: item.w, h: item.h }))

export interface GridBoardProps {
  widgets: PlacedWidget[]
  /** Drag and resize. Off for a published board. */
  editable?: boolean
  /** One gesture, every widget it moved. */
  onLayoutChange?: (placements: LayoutEntry[]) => void
  onEdit?: (widget: PlacedWidget) => void
  onDuplicate?: (widgetId: string) => void
  onRemove?: (widgetId: string) => void
  /**
   * What a Dashboard Control contributes to each widget (FR-CO-06).
   *
   * A function rather than a value because correspondence is per Widget: the
   * same Control reaches one card and not the next, and the board is where that
   * is known.
   */
  contributionFor?: (widget: PlacedWidget) => QueryContribution
  /**
   * FR-CO-07 — Containers that organize Widgets spatially.
   *
   * A Section owns a starting row; which widgets fall inside it is derived
   * (`sections.ts`). Rendered as static full-width items so a heading reserves
   * its rows rather than drawing over a widget.
   */
  sections?: Section[]
  onRenameSection?: (sectionId: string, label: string) => void
  onRemoveSection?: (sectionId: string) => void
  /** Rendered when the board has nothing on it. */
  empty?: React.ReactNode
}

export function GridBoard({
  widgets,
  editable = false,
  onLayoutChange,
  onEdit,
  onDuplicate,
  onRemove,
  contributionFor,
  sections = [],
  onRenameSection,
  onRemoveSection,
  empty,
}: GridBoardProps) {
  const { containerRef, width } = useContainerWidth()

  /*
   * `width` is 0 until the container has been measured. Treating that as narrow
   * would collapse the board for one frame on every mount, so an unmeasured
   * board is assumed wide.
   */
  const narrow = width > 0 && width < STACK_BELOW
  const interactive = editable && !narrow

  /*
   * Which Sections are folded shut — the Viewer's, and never persisted.
   *
   * Same rule as the narrow stack below: a collapsed board is a *view* of the
   * Author's board, not a board. Writing it would rearrange what everyone else
   * sees because one person folded a heading.
   */
  const [collapsed, setCollapsed] = useState<string[]>(() =>
    sections.filter((section) => section.defaultCollapsed).map((section) => section.id),
  )

  const folded = useMemo(
    () => collapsedLayout(widgets, sections, narrow ? [] : collapsed),
    [widgets, sections, collapsed, narrow],
  )

  /*
   * Collapsing is off when narrow, because the stack drops the grid entirely and
   * a fold has nothing to reclaim there — the widgets are already one per row.
   */
  const layout = useMemo(
    () =>
      narrow
        ? stackedLayout(widgets)
        : /*
           * Headings first. The compactor walks the layout in order, so with
           * them appended last the widgets are packed to the top and the static
           * headings — which cannot be displaced — end up below the whole board.
           * Declared first they are anchors, and the widgets flow around them.
           */
          [...sectionItems(folded.sections), ...toLayout(folded.widgets)],
    [widgets, folded, narrow],
  )

  const byId = useMemo(() => new Map(widgets.map((widget) => [widget.id, widget])), [widgets])

  /*
   * A gesture in flight must not be persisted mid-flight.
   *
   * The grid reports a layout change whenever the layout changes, which during a
   * drag is every frame. Committing those would stamp the board's `updated` date
   * and write to storage sixty times a second, so changes are swallowed while a
   * gesture is live and committed once when it stops.
   */
  const gesturing = useRef(false)

  const commit = useCallback(
    (next: Layout) => {
      // Never persist the collapsed layout: it is a rendering of the board, not
      // a board. Writing it would flatten the real one into a single column.
      if (!interactive || !onLayoutChange) return
      onLayoutChange(toEntries(next))
    },
    [interactive, onLayoutChange],
  )

  /** Arrow keys: move by one cell, pushing and compacting as a drag does. */
  const nudge = useCallback(
    (id: string, dx: number, dy: number) => {
      if (!interactive) return
      const source = cloneLayout(layout)
      const item = source.find((entry) => entry.i === id)
      if (!item) return

      const moved = moveElement(
        source,
        item,
        Math.max(0, Math.min(COLUMNS - item.w, item.x + dx)),
        Math.max(0, item.y + dy),
        true,
        false,
        'vertical',
        COLUMNS,
        false,
      )
      commit(verticalCompactor.compact(moved, COLUMNS))
    },
    [commit, interactive, layout],
  )

  /** Shift plus an arrow: resize by one cell. */
  const resizeBy = useCallback(
    (id: string, dw: number, dh: number) => {
      if (!interactive) return

      const resized = cloneLayout(layout).map((entry) => {
        if (entry.i !== id) return entry
        const w = clampW(entry.w + dw)
        // A widget widened at the right edge slides left rather than overflowing
        // the board and being rescued a frame later.
        return { ...entry, w, h: clampH(entry.h + dh), x: Math.min(entry.x, COLUMNS - w) }
      })

      commit(verticalCompactor.compact(resized, COLUMNS))
    },
    [commit, interactive, layout],
  )

  const onKeyDown = (event: React.KeyboardEvent, id: string) => {
    if (!interactive) return

    // The actions menu and any form control own their own arrow keys.
    if ((event.target as HTMLElement).closest('.a-menu, input, select, textarea')) return

    const step = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[
      event.key
    ]
    if (!step) return

    event.preventDefault()
    if (event.shiftKey) resizeBy(id, step[0], step[1])
    else nudge(id, step[0], step[1])
  }

  if (widgets.length === 0) return <>{empty}</>

  return (
    <div ref={containerRef} className={`a-grid ${interactive ? 'a-grid--editable' : ''}`}>
      <GridLayout
        layout={layout}
        width={width || 960}
        gridConfig={{
          cols: COLUMNS,
          rowHeight: ROW_HEIGHT,
          margin: MARGIN,
          containerPadding: [0, 0],
        }}
        /*
         * The card header is the handle. With the whole card draggable, a press
         * on the actions menu starts a drag instead of opening the menu — the
         * same conflict that forced the old canvas to disable dragging mid-resize.
         */
        dragConfig={{
          enabled: interactive,
          handle: '.a-card__head',
          cancel: '.a-menu,.a-menu__trigger,button,input,select,textarea',
        }}
        resizeConfig={{ enabled: interactive, handles: ['se'] }}
        compactor={verticalCompactor}
        onDragStart={() => {
          gesturing.current = true
        }}
        onResizeStart={() => {
          gesturing.current = true
        }}
        onDragStop={(next) => {
          gesturing.current = false
          commit(next)
        }}
        onResizeStop={(next) => {
          gesturing.current = false
          commit(next)
        }}
        /*
         * Also fires on mount, with the compacted layout, and that is worth
         * persisting: a migrated board is flowed but not compacted, and
         * committing here is what makes what is stored match what is shown.
         * `apply-layout` returns the same board when nothing moved, so an
         * already-compact board does not redate itself by being opened.
         */
        onLayoutChange={(next) => {
          if (!gesturing.current) commit(next)
        }}
      >
        {layout.map((entry) => {
          if (isSectionItem(entry.i)) {
            const section = sections.find(
              (candidate) => sectionItemId(candidate.id) === entry.i,
            )
            if (!section) return <div key={entry.i} className="a-grid-cell" />

            return (
              <div key={entry.i} className="a-grid-cell">
                <SectionHeading
                  section={section}
                  count={
                    widgets.filter((widget) => sectionOf(widget, sections)?.id === section.id)
                      .length
                  }
                  collapsed={collapsed.includes(section.id)}
                  onToggle={() =>
                    setCollapsed((current) =>
                      current.includes(section.id)
                        ? current.filter((id) => id !== section.id)
                        : [...current, section.id],
                    )
                  }
                  editable={editable}
                  onRename={onRenameSection}
                  onRemove={onRemoveSection}
                />
              </div>
            )
          }

          const spec = byId.get(entry.i)
          if (!spec) return <div key={entry.i} className="a-grid-cell" />

          return (
            <div
              key={entry.i}
              className="a-grid-cell"
              tabIndex={interactive ? 0 : undefined}
              role={interactive ? 'group' : undefined}
              aria-label={
                interactive
                  ? `${spec.title ?? 'Widget'}. Arrow keys move, shift and arrow keys resize.`
                  : undefined
              }
              onKeyDown={(event) => onKeyDown(event, entry.i)}
            >
              <Widget
                spec={spec}
                contribution={contributionFor?.(spec)}
                actions={
                  editable
                    ? [
                        { label: 'Edit', onSelect: () => onEdit?.(spec) },
                        { label: 'Duplicate', onSelect: () => onDuplicate?.(spec.id) },
                        { label: 'Remove', onSelect: () => onRemove?.(spec.id), destructive: true },
                      ]
                    : undefined
                }
              />
            </div>
          )
        })}
      </GridLayout>
    </div>
  )
}

/**
 * A Section heading — FR-CO-07's Container, as a row of the board.
 *
 * Shows how many widgets fall under it, because membership is derived from rows
 * rather than stored: a count is how an Author confirms the boundary landed
 * where they meant it to. A collapsible Section says so; a plain one does not
 * pretend to be clickable.
 */
function SectionHeading({
  section,
  count,
  collapsed,
  onToggle,
  editable,
  onRename,
  onRemove,
}: {
  section: Section
  count: number
  collapsed: boolean
  onToggle: () => void
  editable: boolean
  onRename?: (sectionId: string, label: string) => void
  onRemove?: (sectionId: string) => void
}) {
  const collapsible = section.containerType === 'collapsible-section'

  return (
    <div className="a-section">
      {collapsible ? (
        <button
          type="button"
          className="a-section__toggle"
          aria-expanded={!collapsed}
          onClick={onToggle}
        >
          <span aria-hidden="true" className="a-section__chevron">
            {collapsed ? '\u25B8' : '\u25BE'}
          </span>
          {section.label}
        </button>
      ) : (
        <span className="a-section__label">{section.label}</span>
      )}

      <span className="a-section__count">
        {count} {count === 1 ? 'widget' : 'widgets'}
      </span>

      {editable && onRename && (
        <button
          type="button"
          className="a-filters__clear"
          onClick={() => {
            const next = window.prompt('Section name', section.label)
            if (next !== null) onRename(section.id, next)
          }}
        >
          Rename
        </button>
      )}
      {editable && onRemove && (
        <button type="button" className="a-filters__clear" onClick={() => onRemove(section.id)}>
          Remove
        </button>
      )}
    </div>
  )
}
