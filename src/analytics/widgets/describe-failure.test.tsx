/**
 * A Widget whose Dataset could not be described.
 *
 * Three ways a card ends up without a Dataset, and only one of them is a
 * withdrawal. The distinction is the point: "the source system has withdrawn
 * this dataset" states that a publisher took a decision, and saying it because
 * IAM was briefly unreachable is not a cosmetic slip — it is unfalsifiable from
 * the card, and whoever acts on it goes looking for a choice nobody made.
 *
 * Tested through `stateForWidget`, which is the decision itself. An earlier
 * draft of this file restated the branch inline and asserted against the
 * restatement — which proves the copy and not the code, and is the same mistake
 * that let the taxonomy translation rot.
 */

import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { AnalyticsDataProvider } from '../data/AnalyticsData'
import { Widget, stateForWidget } from './Widget'
import { WIDGET_RENDER_STATUSES } from '../../retrieval/render-state'
import type { CataloguePort } from '../../catalogue/port'
import type { DatasetRetrievalPort } from '../../retrieval/port'

const base = {
  describing: false,
  describeFailed: false,
  hasDataset: true,
  retrieved: 'ready' as const,
}

describe('only an answer of "no such Dataset" is a withdrawal', () => {
  test('the Catalogue answering null is', () => {
    // It was bound once, so it existed once. Drawing this as a failure would say
    // the system is broken while the system is working.
    expect(stateForWidget({ ...base, hasDataset: false })).toBe('withdrawn')
  })

  test('the Catalogue not answering is not', () => {
    /*
     * The bug this fixes. A 503 while describing used to render "the source
     * system has withdrawn this dataset" — about a publisher who did nothing of
     * the sort.
     */
    expect(stateForWidget({ ...base, describeFailed: true, hasDataset: false })).toBe('failed')
  })

  test('and a failure outranks a missing Dataset, not the other way round', () => {
    // Both are true at once whenever describing rejects — the hook clears the
    // Dataset as well as recording the reason — so the order decides which the
    // Viewer is told, and only one of the two is a fact.
    expect(stateForWidget({ ...base, describeFailed: true, hasDataset: false })).not.toBe(
      'withdrawn',
    )
  })
})

describe('nothing is claimed before the Catalogue answers', () => {
  test('loading outranks everything', () => {
    // A card that flashes "withdrawn" and then corrects itself has already told
    // the Viewer something false.
    expect(
      stateForWidget({ describing: true, describeFailed: true, hasDataset: false, retrieved: 'failed' }),
    ).toBe('loading')
  })

  test('the first paint of a real Widget says nothing about withdrawal', () => {
    const catalogue: CataloguePort = { browse: async () => [], describe: async () => null }
    const retrieval: DatasetRetrievalPort = {
      retrieve: async () => ({ kind: 'empty' }),
      listFilterValues: async () => [],
    }

    const markup = renderToStaticMarkup(
      <AnalyticsDataProvider catalogue={catalogue} retrieval={retrieval}>
        <Widget spec={{ id: 'w1', typeId: 'stat-card', datasetId: 'd1', mapping: {} }} />
      </AnalyticsDataProvider>,
    )
    expect(markup.toLowerCase()).not.toContain('withdrawn')
  })
})

describe('a described Dataset defers to the retrieval', () => {
  for (const status of WIDGET_RENDER_STATUSES) {
    test(`\`${status}\` passes through`, () => {
      // The Catalogue's job ends once it has answered. Denial in particular
      // arrives from retrieval, and must not be second-guessed here.
      expect(stateForWidget({ ...base, retrieved: status })).toBe(status)
    })
  }
})
