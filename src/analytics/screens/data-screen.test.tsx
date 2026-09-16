/**
 * Four outcomes on the data sources screen, and why they are four.
 *
 * The screen used to render one sentence for all of them: a `403`, a `503` and a
 * Catalogue with nothing in it all arrived as "0 mock datasets". They need three
 * different things from whoever reads them — ask for access, wait and retry,
 * publish something — and this is the screen someone opens *first* when they
 * want to know whether the backend works, so collapsing them hides the answer
 * they came for.
 *
 * Same principle as the six render states, one level up: denied must not read as
 * empty, and neither may read as broken.
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalyticsDataProvider } from '../data/AnalyticsData'
import { AccessRecordPanel } from './AccessRecordPanel'
import { ApiError } from '../../api/errors'
import { grainNote, sensitivityNote } from './DataScreen'
import { CatalogueProblem, NoDatasets } from '../data/CatalogueState'
import { catalogueFailure } from '../data/AnalyticsData'
import type { DatasetRetrievalPort } from '../../retrieval/port'

const words = (markup: string) =>
  markup
    .replace(/<[^>]+>/g, ' ')
    .replace(/&rsquo;/g, '’')
    .replace(/\s+/g, ' ')
    .trim()

/** A retrieval adapter that is not the fixture one — the live shape. */
const hostRetrieval: DatasetRetrievalPort = {
  retrieve: async () => ({ kind: 'empty' }),
  listFilterValues: async () => [],
}

const panelWith = (retrieval?: DatasetRetrievalPort) =>
  renderToStaticMarkup(
    <AnalyticsDataProvider retrieval={retrieval}>
      <AccessRecordPanel />
    </AnalyticsDataProvider>,
  )

describe('the access record does not claim to be one when it is not', () => {
  test('on the fixtures it shows the log', () => {
    // The fixture retrieval feeds the recorder, so an empty log genuinely means
    // nothing has been read yet.
    expect(words(panelWith())).toContain('Nothing recorded yet')
  })

  test('behind a host adapter it says where the record actually lives', () => {
    /*
     * The recorder is fed by the retrieval adapter and only the fixture one
     * feeds it. Against a real Source System the log sits at zero for ever,
     * under a heading promising every retrieval of personal data — which reads
     * as "nobody has read any", an assertion rather than an absence.
     */
    const said = words(panelWith(hostRetrieval))
    expect(said).not.toContain('Nothing recorded yet')
    expect(said).toContain('recorded by each Source System')
  })

  test('and it does not show a count of zero', () => {
    // A badge reading 0 beside "access record" is the same false claim in one
    // character.
    expect(panelWith(hostRetrieval)).not.toContain('a-badge')
  })

  test('FR-DA-14 is named, so the obligation is traceable', () => {
    expect(words(panelWith(hostRetrieval))).toContain('FR-DA-14')
  })
})

describe('the Catalogue failing is told apart from the Catalogue being empty', () => {
  const problem = (error: unknown) =>
    words(renderToStaticMarkup(<CatalogueProblem failure={catalogueFailure(error)} />))

  test('403 asks for access rather than reporting a fault', () => {
    const said = problem(new ApiError({ kind: 'denied', message: 'Insufficient permissions' }))
    expect(said).toContain('do not have access')
    expect(said).toContain('permission')
  })

  test('503 says to wait, and does not blame the reader', () => {
    const said = problem(new ApiError({ kind: 'unavailable', message: 'upstream down' }))
    expect(said).toContain('temporarily unavailable')
    expect(said.toLowerCase()).not.toContain('permission')
  })

  test('a dropped connection is unavailable, not a fault of the catalogue', () => {
    expect(problem(new ApiError({ kind: 'transport', message: 'offline' }))).toContain(
      'temporarily unavailable',
    )
  })

  test('anything else carries its own message rather than a generic one', () => {
    // A message we cannot classify is still better than "something went wrong",
    // because it is the only thread back to what happened.
    expect(problem(new Error('Unexpected token < in JSON'))).toContain('Unexpected token')
  })

  test('the three are distinguishable from each other', () => {
    const denied = problem(new ApiError({ kind: 'denied', message: 'x' }))
    const down = problem(new ApiError({ kind: 'unavailable', message: 'x' }))
    expect(denied).not.toEqual(down)
  })

  test('an empty Catalogue reads as a real state, not a failure', () => {
    /*
     * Analytics holds no data of its own, so an empty Catalogue means no product
     * has published a Dataset yet. Drawn as an error it would send someone to
     * check a service that is working perfectly.
     */
    const said = words(renderToStaticMarkup(<NoDatasets />))
    expect(said).toContain('No data sources published yet')
    expect(said.toLowerCase()).not.toContain('error')
    expect(said.toLowerCase()).not.toContain('unavailable')
  })

  test('and says who publishes one, since it is not the reader', () => {
    /*
     * The part a reader cannot work out and the part that decides what they do
     * next. "No data sources" alone invites someone to go hunting for a setting
     * they do not have.
     */
    const said = words(renderToStaticMarkup(<NoDatasets />))
    expect(said).toContain('product team that owns it')
    expect(said).toContain('Ask the team')
  })
})

/** A declaration shaped like the live `peniremit.profit` one. */
const profit = {
  id: 'peniremit.profit',
  name: 'Profit',
  description: 'Net profit over the selected period',
  sourceSystem: 'peniremit',
  classification: 'confidential' as const,
  exposesPersonalData: false,
  fields: [
    { key: 'date', label: 'Date', role: 'time-dimension' as const, filterable: true, sortable: true },
    { key: 'usd', label: 'USD', role: 'measure' as const, filterable: false, sortable: true, aggregations: ['sum' as const] },
  ],
}

describe('what one row is, said in words', () => {
  test('a declared grain names the Fields, by their labels', () => {
    // BE-2, granted. The thing an Author most needs before binding a widget,
    // and the thing a column list cannot tell them.
    expect(grainNote({ ...profit, grain: ['date'] })).toBe('One row per Date.')
  })

  test('an empty grain is a summary row, not a missing answer', () => {
    /*
     * The distinction the field exists for. `[]` says the endpoint answers with
     * one figure — exactly what a stat card wants and exactly what a line chart
     * cannot use.
     */
    expect(grainNote({ ...profit, grain: [] })).toContain('single summary row')
  })

  test('and an absent one says so rather than guessing', () => {
    const said = grainNote(profit)
    expect(said).toContain('Not declared')
    expect(said).not.toContain('summary')
  })

  test('a key with no matching Field still reads as itself', () => {
    // A declaration can name a grain Field it did not declare. Better to show
    // the raw key than to drop it and understate what a row is.
    expect(grainNote({ ...profit, grain: ['corridor'] })).toBe('One row per corridor.')
  })
})

describe('sensitivity answers both questions', () => {
  test('the protection level is shown as declared', () => {
    // It used to arrive as "internal" whatever the publisher said — the
    // translation table matched none of the current words and defaulted.
    expect(sensitivityNote(profit)).toBe('Confidential.')
  })

  test('personal data is stated separately, because it is a separate question', () => {
    /*
     * A Dataset can be confidential *and* personal; the API keeps the two apart
     * for that reason, so reporting only one of them would be half an answer.
     */
    expect(sensitivityNote({ ...profit, exposesPersonalData: true })).toBe(
      'Confidential, and holds personal data.',
    )
  })

  test('a public Dataset holding personal data still says so', () => {
    expect(sensitivityNote({ ...profit, classification: 'public', exposesPersonalData: true })).toContain(
      'personal data',
    )
  })
})
