/**
 * Ranking & Flow — "What is the order, or where is the drop-off?"
 * Data Shape: one Dimension + one Measure, or ordered stage data.
 *
 * Only the first route is rendered here. The stage route needs a Field declared
 * as an ordered stage, which the publication model cannot express today
 * (Finding 1) — so funnel and sankey stay classified but unbuilt rather than
 * guessing at an ordering.
 *
 * Deliberately not a chart: a ranked list reads better as a list, and it costs
 * no charting library.
 */

import { fieldLabel, seriesColour } from './shared'
import type { RendererProps } from '../widget-runtime/renderer'

const number = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 })

function rankingRenderer(showMovement: boolean) {
  return function RankingRenderer({ rows, dataset, mapping, presentation }: RendererProps) {
    const dimension = mapping.dimensions?.[0]
    const measure = mapping.measures?.[0]

    if (!dimension || !measure) {
      throw new Error('A Ranking Widget needs one Dimension and one Measure.')
    }

    const limit = typeof presentation.topN === 'number' ? presentation.topN : rows.length

    const ranked = [...rows]
      .sort((a, b) => Number(b[measure.field] ?? 0) - Number(a[measure.field] ?? 0))
      .slice(0, limit)

    const peak = Math.max(...ranked.map((row) => Math.abs(Number(row[measure.field] ?? 0))), 1)

    return (
      <div className="h-full overflow-auto @container">
        <ol className="list-none p-0 m-0 space-y-1.5">
          {ranked.map((row, index) => {
            const value = Number(row[measure.field] ?? 0)
            const previous = index > 0 ? Number(ranked[index - 1][measure.field] ?? 0) : value

            return (
              <li key={String(row[dimension] ?? index)} className="text-xs">
                <div className="flex items-baseline gap-2">
                  <span className="text-[var(--analytics-text-muted)] tabular-nums w-5 shrink-0">
                    {index + 1}
                  </span>
                  <span className="text-[var(--analytics-text)] truncate flex-1">
                    {String(row[dimension] ?? '—')}
                  </span>
                  {showMovement && index > 0 && (
                    <span
                      className="tabular-nums shrink-0 hidden @[16rem]:inline"
                      style={{ color: 'var(--analytics-text-muted)' }}
                    >
                      {previous === 0 ? '' : `−${Math.round((1 - value / previous) * 100)}%`}
                    </span>
                  )}
                  <span className="text-[var(--analytics-text)] tabular-nums shrink-0">
                    {number.format(value)}
                  </span>
                </div>
                {/* The bar is the ranking made legible at a glance, not decoration. */}
                <div
                  className="mt-1 h-1 rounded-full"
                  style={{
                    width: `${Math.max((Math.abs(value) / peak) * 100, 2)}%`,
                    background: seriesColour(0),
                  }}
                  aria-hidden="true"
                />
              </li>
            )
          })}
        </ol>
        {ranked.length === 0 && (
          <p className="text-xs text-[var(--analytics-text-muted)] m-0">
            Nothing to rank by {fieldLabel(dataset, measure.field)}.
          </p>
        )}
      </div>
    )
  }
}

export const RankedListRenderer = rankingRenderer(false)
export const LeaderboardRenderer = rankingRenderer(true)
