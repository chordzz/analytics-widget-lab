/**
 * SPIKE — react-grid-layout on React 19. Delete when the question is settled.
 *
 * Answering four things the estimate depended on:
 *
 *   1. Does RGL work at all on React 19? `findDOMNode` was removed in 19 and
 *      react-draggable used it. RGL v2 passes `nodeRef`, which should avoid the
 *      dead path — but "should" is why this exists.
 *   2. Does the card keep its container-query context inside RGL's wrapper?
 *      Our stat tiles and legends respond to `container-type: inline-size` on
 *      `.a-card`, and RGL inserts its own positioned div around every child.
 *   3. Do the self-measuring charts follow a resize? `Plot` watches its own box
 *      with a `ResizeObserver`; RGL resizes by transform and width/height, and
 *      an observer that misses that would leave charts at their old size.
 *   4. What does it cost in bundle size?
 *
 * Reached by setting `localStorage.spikeGrid = '1'` — deliberately not wired
 * into the nav, so removing the spike is deleting this file and three lines.
 */

import { useMemo, useState } from 'react'
import { GridLayout, useContainerWidth, verticalCompactor, type LayoutItem } from 'react-grid-layout'
import 'react-grid-layout/css/styles.css'
import 'react-resizable/css/styles.css'

import { Widget, type WidgetSpec } from '../widgets/Widget'
import { heightForType } from '../widgets/layout'

/**
 * Grid units.
 *
 * SPIKE FINDING: a row costs `rowHeight + marginY`, not `rowHeight` — the margin
 * sits between every row unit, not just between widgets. With `rowHeight: 8` and
 * a 16px margin, a widget asking for 33 rows got 776px instead of 264. Either
 * keep the margin small, or convert pixels through `rowsFor` below. Both here.
 */
const ROW = 24
const MARGIN: [number, number] = [16, 16]
const COLUMNS = 12

/** Pixel height → grid rows, accounting for the inter-row margin. */
const rowsFor = (px: number) => Math.max(1, Math.round((px + MARGIN[1]) / (ROW + MARGIN[1])))

export function GridBoardSpike({ widgets }: { widgets: WidgetSpec[] }) {
  const [layout, setLayout] = useState<LayoutItem[]>(() =>
    widgets.map((spec, index) => ({
      i: spec.id,
      // Our model has no x/y, so this is the migration in miniature: flow
      // left to right, wrap when the row is full.
      x: (index * (spec.span ?? 4)) % COLUMNS,
      y: Math.floor((index * (spec.span ?? 4)) / COLUMNS) * 20,
      w: spec.span ?? 4,
      h: rowsFor(spec.height ?? heightForType(spec.typeId)),
      minW: 2,
      minH: 3,
    })),
  )

  const [events, setEvents] = useState<string[]>([])
  const byId = useMemo(() => new Map(widgets.map((spec) => [spec.id, spec])), [widgets])

  // v2 measures the container for you rather than making you pass a width —
  // one of the things we hand-rolled for the corner grip.
  const { containerRef, width } = useContainerWidth()

  return (
    <div ref={containerRef}>
      <div className="a-board-head">
        <strong>Grid spike</strong>
        <span className="a-muted">
          react-grid-layout v2 · React 19 · drag a card header, resize from the corner
        </span>
      </div>

      <GridLayout
        className="layout"
        layout={layout}
        gridConfig={{ cols: COLUMNS, rowHeight: ROW, margin: MARGIN }}
        // The whole card being draggable is what forced us to disable dragging
        // mid-resize. Grafana solves it with a handle class; so does this.
        dragConfig={{ handle: '.a-card__head', cancel: '.a-menu,.a-menu__trigger' }}
        compactor={verticalCompactor}
        width={width || 960}
        onLayoutChange={(next) => setLayout([...next])}
        onDragStop={(_l, _o, item) =>
          item && setEvents((e) => [`drag → ${item.i} (${item.x},${item.y})`, ...e].slice(0, 6))
        }
        onResizeStop={(_l, _o, item) =>
          item && setEvents((e) => [`resize → ${item.i} ${item.w}×${item.h}`, ...e].slice(0, 6))
        }
      >
        {layout.map((entry) => {
          const spec = byId.get(entry.i)
          /*
           * SPIKE FINDING: the card must be told to fill the grid item.
           * On our own board `.a-board__item > .a-card { flex: 1 }` does this.
           * RGL's wrapper is `.react-grid-item`, which that rule never matches,
           * so the card sized to its content — 178px inside an 800px cell — and
           * the chart measured itself against the wrong box.
           */
          return (
            <div key={entry.i} className="a-grid-cell">
              {spec ? <Widget spec={spec} /> : null}
            </div>
          )
        })}
      </GridLayout>

      <pre className="a-muted" style={{ fontSize: 'var(--a-text-xs)' }}>
        {events.join('\n') || 'No gestures yet.'}
      </pre>
    </div>
  )
}
