/**
 * Ranking & flow — how volume moves between nodes.
 *
 * Layout is computed here rather than taken from a library: nodes are assigned
 * to columns by longest path from a source, ordered within a column to reduce
 * crossings, and links drawn as cubic ribbons whose thickness is their volume.
 *
 * Node colour is categorical by *column*, not per node — a Sankey with twelve
 * differently-coloured nodes reads as twelve unrelated things rather than one
 * flow. Links inherit their source's hue at low opacity so a path is followable
 * without the ribbons shouting over the nodes.
 */

import { VizFrame, truncateToWidth } from './shared'
import { formatValue } from '../format'
import { seriesColor } from '../../theme/tokens'
import type { Row, ValueFormat } from '../../data/types'

interface Node {
  id: string
  column: number
  value: number
  y: number
  height: number
}

interface Link {
  from: string
  to: string
  value: number
  sourceY: number
  targetY: number
  thickness: number
}

export interface SankeyChartProps {
  data: readonly Row[]
  /** Dimension holding the source node. */
  fromKey: string
  /** Dimension holding the target node. */
  toKey: string
  /** Measure giving each link its volume. */
  valueKey: string
  format?: ValueFormat
  height?: number
  className?: string
}

/** Node labels sit at this size. */
const NODE_LABEL_SIZE = 10

const NODE_WIDTH = 12
const NODE_GAP = 16

export function SankeyChart({
  data,
  fromKey,
  toKey,
  valueKey,
  format = 'number',
  height,
  className,
}: SankeyChartProps) {
  const edges = data.map((row) => ({
    from: String(row[fromKey]),
    to: String(row[toKey]),
    value: Math.max(0, Number(row[valueKey] ?? 0)),
  }))

  return (
    <VizFrame height={height} className={className}>
      {({ width, height: plotHeight }) => {
        const { nodes, links, columns } = layout(edges, width, plotHeight)
        if (nodes.length === 0) return null

        // Reserve a gutter each side for the first and last column's labels.
        const gutter = Math.min(120, Math.max(72, width * 0.18))
        const columnGap =
          columns <= 1 ? width : (width - NODE_WIDTH - gutter * 2) / Math.max(1, columns - 1)
        const columnX = (column: number) =>
          columns <= 1
            ? gutter
            : (column / (columns - 1)) * (width - NODE_WIDTH - gutter * 2) + gutter

        return (
          <svg width={width} height={plotHeight} role="img" aria-label="Sankey flow">
            {links.map((link, index) => {
              const source = nodes.find((n) => n.id === link.from)!
              const target = nodes.find((n) => n.id === link.to)!
              const x0 = columnX(source.column) + NODE_WIDTH
              const x1 = columnX(target.column)
              const mid = (x0 + x1) / 2

              return (
                <path
                  key={index}
                  d={`M${x0},${link.sourceY} C${mid},${link.sourceY} ${mid},${link.targetY} ${x1},${link.targetY}`}
                  fill="none"
                  stroke={seriesColor(source.column)}
                  strokeOpacity={0.28}
                  strokeWidth={link.thickness}
                >
                  <title>{`${link.from} → ${link.to}: ${formatValue(link.value, format)}`}</title>
                </path>
              )
            })}

            {nodes.map((node) => {
              const x = columnX(node.column)
              const first = node.column === 0
              const last = node.column === columns - 1

              /*
               * Label placement is the whole readability problem in a Sankey.
               * End columns have empty margin beside them, so their labels go
               * outside. Interior columns have ribbons on both sides, so a
               * label beside the node lands on top of them — those go above
               * the node instead, where the gap between nodes is.
               */
              const labelProps = first
                ? { x: x - 6, y: node.y + node.height / 2 + 4, anchor: 'end' as const }
                : last
                  ? { x: x + NODE_WIDTH + 6, y: node.y + node.height / 2 + 4, anchor: 'start' as const }
                  : { x: x + NODE_WIDTH / 2, y: node.y - 4, anchor: 'middle' as const }

              // An interior label is centred on its node, so it can only be as
              // wide as the gap to the next column before it runs into that
              // column's label. Truncating beats overlapping; the title carries
              // the full name.
              const budget = first || last ? gutter - 8 : columnGap - 8
              const label = truncateToWidth(node.id, budget, NODE_LABEL_SIZE)

              return (
                <g key={node.id}>
                  <rect
                    x={x}
                    y={node.y}
                    width={NODE_WIDTH}
                    height={node.height}
                    rx={2}
                    fill={seriesColor(node.column)}
                  />
                  <text
                    x={labelProps.x}
                    y={labelProps.y}
                    textAnchor={labelProps.anchor}
                    style={{
                      fontSize: NODE_LABEL_SIZE,
                      fill: 'var(--a-text)',
                      paintOrder: 'stroke',
                      stroke: 'var(--a-surface)',
                      strokeWidth: 3,
                      strokeLinejoin: 'round',
                    }}
                  >
                    {label}
                  </text>
                  <title>{`${node.id}: ${formatValue(node.value, format)}`}</title>
                </g>
              )
            })}
          </svg>
        )
      }}
    </VizFrame>
  )
}

/** Assigns columns by longest path, then stacks nodes and threads links. */
function layout(
  edges: { from: string; to: string; value: number }[],
  _width: number,
  height: number,
): { nodes: Node[]; links: Link[]; columns: number } {
  const ids = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))]
  if (ids.length === 0) return { nodes: [], links: [], columns: 0 }

  // Longest path from any source — the shortest path would stack a node that
  // also receives from a later column on top of its own inputs.
  const column = new Map<string, number>(ids.map((id) => [id, 0]))
  for (let pass = 0; pass < ids.length; pass += 1) {
    let changed = false
    for (const edge of edges) {
      const next = (column.get(edge.from) ?? 0) + 1
      if (next > (column.get(edge.to) ?? 0)) {
        column.set(edge.to, next)
        changed = true
      }
    }
    if (!changed) break
  }

  const columns = Math.max(...ids.map((id) => column.get(id) ?? 0)) + 1

  const throughput = (id: string) => {
    const out = edges.filter((e) => e.from === id).reduce((s, e) => s + e.value, 0)
    const into = edges.filter((e) => e.to === id).reduce((s, e) => s + e.value, 0)
    return Math.max(out, into)
  }

  const byColumn = new Map<number, string[]>()
  for (const id of ids) {
    const col = column.get(id) ?? 0
    byColumn.set(col, [...(byColumn.get(col) ?? []), id])
  }

  const nodes: Node[] = []
  for (const [col, members] of byColumn) {
    const ordered = [...members].sort((a, b) => throughput(b) - throughput(a))
    const total = ordered.reduce((sum, id) => sum + throughput(id), 0) || 1
    // Interior labels sit above their node, so the stack starts below the top
    // edge and the gaps have to be big enough to hold a line of text.
    const top = 10
    const available = height - top - NODE_GAP * Math.max(0, ordered.length - 1)

    let y = top
    for (const id of ordered) {
      const value = throughput(id)
      const nodeHeight = Math.max(4, (value / total) * available)
      nodes.push({ id, column: col, value, y, height: nodeHeight })
      y += nodeHeight + NODE_GAP
    }
  }

  // Thread each link onto its endpoints, consuming vertical space in order so
  // ribbons leaving one node do not overlap each other.
  const usedOut = new Map<string, number>()
  const usedIn = new Map<string, number>()

  const links: Link[] = edges
    .slice()
    .sort((a, b) => b.value - a.value)
    .map((edge) => {
      const source = nodes.find((n) => n.id === edge.from)!
      const target = nodes.find((n) => n.id === edge.to)!

      const outShare = (edge.value / Math.max(1, source.value)) * source.height
      const inShare = (edge.value / Math.max(1, target.value)) * target.height

      const outOffset = usedOut.get(edge.from) ?? 0
      const inOffset = usedIn.get(edge.to) ?? 0
      usedOut.set(edge.from, outOffset + outShare)
      usedIn.set(edge.to, inOffset + inShare)

      return {
        from: edge.from,
        to: edge.to,
        value: edge.value,
        sourceY: source.y + outOffset + outShare / 2,
        targetY: target.y + inOffset + inShare / 2,
        thickness: Math.max(1, Math.min(outShare, inShare)),
      }
    })

  return { nodes, links, columns }
}
