/**
 * The module's fixtures, tested through the port contracts.
 *
 * Merge Plan Stage 5. These run without React, which is the point: the
 * asynchronous behaviour is testable on its own, so the component tests do not
 * have to await anything and the parts that can go wrong here are not hidden
 * behind a renderer.
 *
 * The four-outcome shape is what most of this is about. `[]` cannot mean empty,
 * denied and withdrawn at once — Finding 7 — and the only way to hold that is to
 * assert the distinctions rather than trust them.
 */

import { describe, expect, test } from 'bun:test'
import { FixtureCatalogue, FixtureRetrieval, LOCAL_VIEWER, SCENARIOS } from './adapters'
import { datasets, rowsFor } from './datasets'

const catalogue = new FixtureCatalogue()
const retrieval = new FixtureRetrieval()
const viewer = LOCAL_VIEWER

describe('the Catalogue describes without retrieving', () => {
  test('browsing lists every published Dataset', async () => {
    const summaries = await catalogue.browse(viewer)
    expect(summaries).toHaveLength(datasets.length)
  })

  test('a summary carries no records and no Fields', async () => {
    /*
     * FR-DP-11 in the shape of the answer rather than in a promise about it. A
     * summary that quietly included rows would let a listing page pull the whole
     * Catalogue's data, and nobody would notice until the bill arrived.
     */
    const [summary] = await catalogue.browse(viewer)
    expect('rows' in summary).toBe(false)
    expect('fields' in summary).toBe(false)
    expect(summary.measureCount).toBeGreaterThanOrEqual(0)
  })

  test('describing gives the Fields, still no records', async () => {
    const described = await catalogue.describe('revenue-monthly', viewer)
    expect(described?.fields.length).toBeGreaterThan(0)
    expect('rows' in (described ?? {})).toBe(false)
  })

  test('an unknown Dataset describes as null rather than throwing', async () => {
    expect(await catalogue.describe('no-such-dataset', viewer)).toBeNull()
  })
})

describe('retrieval keeps four outcomes apart', () => {
  test('a normal retrieval returns rows and a total', async () => {
    const outcome = await retrieval.retrieve('sales-by-region', {}, viewer)
    expect(outcome.kind).toBe('rows')
    if (outcome.kind !== 'rows') throw new Error('unreachable')
    expect(outcome.rows).toHaveLength(rowsFor('sales-by-region').length)
    expect(outcome.totalCount).toBe(rowsFor('sales-by-region').length)
  })

  test('each scenario produces its own outcome', async () => {
    const port = new FixtureRetrieval({
      scenarios: {
        'sales-by-region': 'denied',
        'revenue-daily': 'withdrawn',
        'revenue-monthly': 'empty',
      },
    })

    expect((await port.retrieve('sales-by-region', {}, viewer)).kind).toBe('denied')
    expect((await port.retrieve('revenue-daily', {}, viewer)).kind).toBe('withdrawn')
    expect((await port.retrieve('revenue-monthly', {}, viewer)).kind).toBe('empty')
    // Unlisted Datasets are unaffected — one widget's scenario is not the board's.
    expect((await port.retrieve('support-tickets', {}, viewer)).kind).toBe('rows')
  })

  test('a failure rejects rather than returning an outcome', async () => {
    /*
     * A failure is the absence of an answer, not one of the answers. Modelling
     * it as a fifth `kind` would let a caller pattern-match it alongside
     * `denied` and forget that nothing is known about the data at all.
     */
    const port = new FixtureRetrieval({ scenarios: { 'revenue-daily': 'failed' } })
    await expect(port.retrieve('revenue-daily', {}, viewer)).rejects.toThrow()
  })

  test('a Dataset that is not there reads as withdrawn, not as broken', async () => {
    // From a Viewer's side those are the same situation, and "broken" is the
    // more alarming of the two readings.
    expect((await retrieval.retrieve('no-such-dataset', {}, viewer)).kind).toBe('withdrawn')
  })

  test('every scenario is reachable', async () => {
    // The requirement is that all of them stay visually distinct, and the only
    // way to hold a team to that is for each to be producible in the running app.
    for (const scenario of SCENARIOS) {
      const port = new FixtureRetrieval({ scenarios: { 'sales-by-region': scenario } })
      const outcome = await port
        .retrieve('sales-by-region', {}, viewer)
        .then((result) => result.kind)
        .catch(() => 'failed' as const)

      expect({ scenario, outcome }).toEqual({
        scenario,
        outcome: scenario === 'normal' ? 'rows' : scenario,
      })
    }
  })
})

describe('retrieval executes the query rather than returning everything', () => {
  test('an aggregating query comes back aggregated', async () => {
    const outcome = await retrieval.retrieve(
      'revenue-monthly',
      { measures: [{ field: 'revenue', aggregation: 'sum' }] },
      viewer,
    )

    expect(outcome.kind).toBe('rows')
    if (outcome.kind !== 'rows') throw new Error('unreachable')
    expect(outcome.rows).toHaveLength(1)
    // `totalCount` describes the Dataset, not the answer — a caller showing
    // "1 of 24" needs both numbers and they are not the same number.
    expect(outcome.totalCount).toBe(24)
  })

  test('a query that matches nothing is empty, not an empty rows outcome', async () => {
    // `{kind:'rows', rows:[]}` is a contract breach: it says data came back and
    // then does not provide any. The resolver treats it as a failure, so the
    // port must not produce it.
    const outcome = await retrieval.retrieve(
      'sales-by-region',
      { filters: { region: 'Atlantis' } },
      viewer,
    )
    expect(outcome.kind).toBe('empty')
  })
})

describe('filter values are discoverable', () => {
  test('the distinct values of a Field come back sorted', async () => {
    // Finding 8: an Author can expose a filter, and nothing in the FRD says how
    // a Viewer discovers what they may choose from.
    const values = await retrieval.listFilterValues('sales-by-region', 'region', viewer)
    expect(values.length).toBeGreaterThan(1)
    expect(values).toEqual([...values].sort())
  })

  test('a Field nobody has is empty rather than an error', async () => {
    expect(await retrieval.listFilterValues('sales-by-region', 'nope', viewer)).toEqual([])
  })
})

describe('a withdrawn Dataset leaves the Catalogue', () => {
  test('it is neither listed nor describable', async () => {
    const port = new FixtureCatalogue({ scenarios: { 'revenue-daily': 'withdrawn' } })

    expect((await port.browse(viewer)).map((entry) => entry.id)).not.toContain('revenue-daily')
    expect(await port.describe('revenue-daily', viewer)).toBeNull()
  })

  test('but a Widget already bound to it still gets an answer', async () => {
    /*
     * The reason `withdrawn` is a render state at all. Removing it from the
     * Catalogue stops anyone binding a *new* Widget; the boards that already
     * reference it need to be told what happened rather than left blank.
     */
    const port = new FixtureRetrieval({ scenarios: { 'revenue-daily': 'withdrawn' } })
    expect((await port.retrieve('revenue-daily', {}, viewer)).kind).toBe('withdrawn')
  })
})

describe('nothing above the data layer reaches the fixtures', () => {
  test('no module file outside data/ imports the dataset registry', async () => {
    /*
     * Merge Plan Stage 5's exit criterion, and the one assertion that keeps the
     * stage from quietly undoing itself. Every consumer above `data/` deals in
     * ports and hooks; a single `import { datasets }` in a screen re-couples the
     * module to an in-memory library and the coupling is invisible until a
     * backend is wired and that screen shows stale fixtures.
     *
     * Reading the source as text rather than inspecting the module graph is
     * deliberate: it catches type-only imports too, and a type-only reach is
     * exactly how the shape creeps back.
     */
    const { Glob } = await import('bun')
    const root = new URL('../', import.meta.url).pathname

    const offenders: string[] = []
    for await (const file of new Glob('**/*.{ts,tsx}').scan({ cwd: root })) {
      if (file.startsWith('data/')) continue
      if (/\.test\.tsx?$/.test(file)) continue

      const source = await Bun.file(`${root}${file}`).text()
      if (/from '\.{1,2}(\/\.\.)*\/data\/datasets'/.test(source)) offenders.push(file)
    }

    expect(offenders.sort()).toEqual([])
  })
})
