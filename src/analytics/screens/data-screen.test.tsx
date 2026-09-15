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
import { sampleNote } from './DataScreen'
import { CatalogueProblem, NoDatasets } from '../data/CatalogueState'
import { WIDGET_RENDER_STATUSES } from '../../retrieval/render-state'
import { WidgetComposer } from '../builder/WidgetComposer'
import type { CataloguePort } from '../../catalogue/port'
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

describe('the sample says which of the six it hit', () => {
  /*
   * The sample is the one place on this screen that touches real records, so it
   * is the one place the four outcomes differ. They all used to read "No records
   * to show" — which tells a Viewer the Dataset is empty when the truth may be
   * that they are not allowed to read it.
   */
  test('denied is not "no records"', () => {
    // FR-DA-11. A denial drawn as absence teaches the Viewer the figure is zero.
    const said = sampleNote({ status: 'denied' })
    expect(said).toContain('do not have access')
    expect(said.toLowerCase()).not.toContain('no records')
  })

  test('withdrawn names the publisher, not the data', () => {
    const said = sampleNote({ status: 'withdrawn' })
    expect(said).toContain('withdrawn')
    expect(said.toLowerCase()).not.toContain('no records')
  })

  test('empty is still plainly empty', () => {
    // FR-VZ-10 — authorized, and nothing to say. It must not read as a fault.
    expect(sampleNote({ status: 'empty' })).toBe('No records to show.')
  })

  test('a failure carries its own message', () => {
    expect(sampleNote({ status: 'failed', message: 'Source system timed out' })).toBe(
      'Source system timed out',
    )
  })

  test('a failure with no message still says something', () => {
    expect(sampleNote({ status: 'failed', message: '' })).toContain('could not be loaded')
  })

  test('loading does not claim an outcome', () => {
    // A preview that flashes "no records" before the answer arrives has already
    // said something false.
    expect(sampleNote({ status: 'loading' }).toLowerCase()).not.toContain('no records')
  })

  test('all six are distinguishable from one another', () => {
    const said = WIDGET_RENDER_STATUSES.map((status) =>
      sampleNote(
        status === 'ready'
          ? { status: 'ready', rows: [] }
          : status === 'failed'
            ? { status: 'failed', message: 'boom' }
            : { status },
      ),
    )
    // `ready` never reaches this function — the table draws instead — so it is
    // the one duplicate permitted.
    const distinct = new Set(said.filter((_, index) => WIDGET_RENDER_STATUSES[index] !== 'ready'))
    expect(distinct.size).toBe(WIDGET_RENDER_STATUSES.length - 1)
  })
})

describe('step 1 of the composer answers the same question', () => {
  /*
   * The worse of the two surfaces, and the one that prompted this: a numbered
   * step with a blank area beneath it reads as a page that failed to finish
   * rendering, not as an answer. Both screens ask the Catalogue the same
   * question, so they give the same three answers.
   */
  const emptyCatalogue: CataloguePort = { browse: async () => [], describe: async () => null }

  const composer = () =>
    renderToStaticMarkup(
      <AnalyticsDataProvider catalogue={emptyCatalogue}>
        <WidgetComposer onCommit={() => {}} onCancel={() => {}} />
      </AnalyticsDataProvider>,
    )

  test('it does not render a bare step while it is still asking', () => {
    // The first paint is the loading branch, not an empty list.
    expect(words(composer())).toContain('Loading data sources')
  })

  test('the empty message says a widget cannot be built without one', () => {
    // This is the end of the road on this screen, unlike the Data sources
    // listing where it is merely nothing to read.
    const said = words(renderToStaticMarkup(
      <NoDatasets>
        <p>A widget is built from a data source, so there is nothing to compose until one exists.</p>
      </NoDatasets>,
    ))
    expect(said).toContain('nothing to compose')
    expect(said).toContain('Ask the team')
  })
})
