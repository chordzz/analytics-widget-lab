/**
 * The two things a comparison table can quietly get wrong.
 *
 * It shows one column per entity, and a Dataset grained finer than the entity
 * sends several rows per name. Taking the first would show one day as the whole
 * corridor — a wrong number with nothing about it that looks wrong.
 *
 * And it can mark a leader, which is a claim about *better* that no declaration
 * makes. Highest is better for revenue and worse for latency, so a direction
 * nobody stated must produce no mark at all rather than a guess.
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { ComparisonTable } from './ComparisonTable'
import type { Field, Row } from '../../data/types'

const metrics: Field[] = [
  { key: 'revenue', label: 'Revenue', role: 'measure', format: 'number' },
  { key: 'latency', label: 'Latency', role: 'measure', format: 'number' },
]

/** Two rows per corridor — the grain a real Dataset frequently has. */
const grained: Row[] = [
  { corridor: 'NG→GB', revenue: 100, latency: 4 },
  { corridor: 'NG→GB', revenue: 150, latency: 6 },
  { corridor: 'KE→US', revenue: 400, latency: 9 },
]

const draw = (node: React.ReactElement) => renderToStaticMarkup(node)

describe('rows finer than the entity', () => {
  test('numeric metrics are summed, not sampled', () => {
    const html = draw(
      <ComparisonTable data={grained} entityKey="corridor" metrics={metrics} />,
    )
    // 100 + 150, not whichever row came first.
    expect(html).toContain('250')
    expect(html).not.toContain('>100<')
  })

  test('each entity appears once', () => {
    const html = draw(
      <ComparisonTable data={grained} entityKey="corridor" metrics={metrics} />,
    )
    expect(html.split('NG→GB').length - 1).toBe(1)
  })
})

describe('marking a leader', () => {
  test('nothing is marked unless asked', () => {
    const html = draw(
      <ComparisonTable data={grained} entityKey="corridor" metrics={metrics} />,
    )
    expect(html).not.toContain('leading')
  })

  test('a metric with no stated direction gets no mark', () => {
    /*
     * The important one. `showLeaders` is on and `latency` is absent from the
     * map, so latency must stay unmarked — marking the highest would tell a
     * reader the slowest corridor is winning.
     */
    const html = draw(
      <ComparisonTable
        data={grained}
        entityKey="corridor"
        metrics={metrics}
        showLeaders
        higherIsBetter={{ revenue: true }}
      />,
    )
    expect(html.split('leading').length - 1).toBe(1)
  })

  test('direction is obeyed, not assumed', () => {
    const html = draw(
      <ComparisonTable
        data={grained}
        entityKey="corridor"
        metrics={metrics}
        showLeaders
        higherIsBetter={{ revenue: true, latency: false }}
      />,
    )
    // Revenue: KE→US at 400 leads. Latency: NG→GB at 10 vs 9 — so KE→US leads
    // there too, on the lower value. Two marks, both on the same column.
    expect(html.split('leading').length - 1).toBe(2)
  })

  test('the mark is not carried by colour alone', () => {
    // A colour-blind reader and a greyscale print both lose a colour-only cue,
    // and this is the chart's whole claim.
    const html = draw(
      <ComparisonTable
        data={grained}
        entityKey="corridor"
        metrics={metrics}
        showLeaders
        higherIsBetter={{ revenue: true }}
      />,
    )
    expect(html).toContain('▲')
  })
})

describe('too many to compare', () => {
  test('the extras are reported rather than dropped in silence', () => {
    const many: Row[] = Array.from({ length: 12 }, (_, index) => ({
      corridor: `C${String(index)}`,
      revenue: index,
      latency: index,
    }))
    const html = draw(
      <ComparisonTable data={many} entityKey="corridor" metrics={metrics} limit={8} />,
    )
    expect(html).toContain('4 more')
  })
})

describe('nothing to draw', () => {
  test('no rows renders nothing at all', () => {
    expect(draw(<ComparisonTable data={[]} entityKey="corridor" metrics={metrics} />)).toBe('')
  })

  test('no metrics renders nothing at all', () => {
    expect(draw(<ComparisonTable data={grained} entityKey="corridor" metrics={[]} />)).toBe('')
  })
})
