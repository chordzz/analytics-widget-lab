/**
 * Geospatial — where is this happening?
 *
 * Points on an equirectangular projection, sized by measure. Deliberately
 * *not* a choropleth: shading regions needs boundary geometry (GeoJSON or
 * TopoJSON, ~100KB for a usable world atlas), which is a dependency decision
 * that has not been taken. Centroids need nothing, so this family gets a built
 * representative today without pre-empting that call.
 *
 * The honest limitation, stated rather than hidden: with no landmasses drawn,
 * this reads as relative position — you can see the European cluster and the
 * West African one — but not which country a point sits in unless it is
 * labelled. A graticule and labels on the largest points are the compensation.
 */

import { VizFrame } from './shared'
import { formatValue } from '../format'
import { token } from '../../theme/tokens'
import type { Row, ValueFormat } from '../../data/types'

/**
 * How many of the largest points get a permanent label.
 *
 * Kept low deliberately: real trading geography clusters, so Europe and the
 * Gulf end up with several points inside a few dozen pixels and every label
 * collides with its neighbour. Three is about what fits before the labels
 * become less legible than no labels at all; everything else has a title.
 */
const LABELLED = 3

export interface PointMapProps {
  data: readonly Row[]
  /** Field naming each place. */
  xKey: string
  /** Latitude, −90 to 90. */
  latKey: string
  /** Longitude, −180 to 180. */
  lngKey: string
  /** Measure bound to point area. */
  valueKey: string
  format?: ValueFormat
  height?: number
  className?: string
}

export function PointMap({
  data,
  xKey,
  latKey,
  lngKey,
  valueKey,
  format = 'number',
  height,
  className,
}: PointMapProps) {
  const points = data
    .map((row) => ({
      label: String(row[xKey]),
      lat: Number(row[latKey] ?? 0),
      lng: Number(row[lngKey] ?? 0),
      value: Math.max(0, Number(row[valueKey] ?? 0)),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng))

  if (points.length === 0) return null

  const peak = Math.max(...points.map((point) => point.value), 1)
  const ranked = [...points].sort((a, b) => b.value - a.value)
  const labelled = new Set(ranked.slice(0, LABELLED).map((point) => point.label))

  return (
    <VizFrame height={height} className={className}>
      {({ width, height: plotHeight }) => {
        // Equirectangular, clipped to ±60° latitude — the poles hold no data
        // and stretching to ±90 wastes a third of the height on empty ocean.
        const project = (lat: number, lng: number) => ({
          x: ((lng + 180) / 360) * width,
          y: ((60 - Math.max(-60, Math.min(60, lat))) / 120) * plotHeight,
        })

        const maxRadius = Math.max(5, Math.min(22, Math.min(width, plotHeight) / 9))

        return (
          <svg width={width} height={plotHeight} role="img" aria-label="Point map">
            {/* Graticule — the only spatial reference available without geometry. */}
            {[-30, 0, 30].map((lat) => (
              <line
                key={`lat-${lat}`}
                x1={0}
                x2={width}
                y1={project(lat, 0).y}
                y2={project(lat, 0).y}
                stroke="var(--a-grid)"
                strokeDasharray={lat === 0 ? undefined : '2 4'}
              />
            ))}
            {[-90, 0, 90].map((lng) => (
              <line
                key={`lng-${lng}`}
                x1={project(0, lng).x}
                x2={project(0, lng).x}
                y1={0}
                y2={plotHeight}
                stroke="var(--a-grid)"
                strokeDasharray={lng === 0 ? undefined : '2 4'}
              />
            ))}

            {/* Largest first, so small points land on top and stay clickable. */}
            {ranked.map((point) => {
              const { x, y } = project(point.lat, point.lng)
              // Area, not radius — radius would exaggerate large values fourfold.
              const radius = Math.max(3, Math.sqrt(point.value / peak) * maxRadius)

              return (
                <g key={point.label}>
                  <circle
                    cx={x}
                    cy={y}
                    r={radius}
                    fill="var(--a-series-1)"
                    fillOpacity={0.55}
                    stroke="var(--a-surface)"
                    strokeWidth={1.5}
                  >
                    <title>{`${point.label}: ${formatValue(point.value, format)}`}</title>
                  </circle>

                  {labelled.has(point.label) && (
                    <text
                      x={x}
                      y={y - radius - 4}
                      textAnchor="middle"
                      style={{
                        fontSize: 10,
                        fill: token('textSecondary'),
                        // A surface-coloured halo, so a label crossing a point
                        // or a graticule stays readable.
                        paintOrder: 'stroke',
                        stroke: 'var(--a-surface)',
                        strokeWidth: 3,
                        strokeLinejoin: 'round',
                      }}
                    >
                      {point.label}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )
      }}
    </VizFrame>
  )
}
