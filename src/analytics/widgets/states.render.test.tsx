/**
 * The six states, arrived at rather than passed in.
 *
 * `states.test.tsx` proves the *chrome* keeps them apart: hand `WidgetCard` a
 * state and it draws that state distinguishably. `render-state.ts` proves the
 * *resolver* keeps six outcomes apart. Neither exercises the seam between
 * them — a Widget given a Dataset the Viewer may not read has to travel port →
 * resolver → card and come out denied, and every step of that is asynchronous.
 *
 * Which is why this could not exist before. `useWidgetRows` starts at
 * `loading` and reaches anything else only in an effect, so a static render
 * shows `loading` for all six scenarios. A test written against it would agree
 * that denial and success look identical, and be green.
 *
 * FR-DA-11 is the requirement underneath, and its failure modes are each a
 * specific lie:
 *
 *   - a denial drawn as empty teaches the Viewer the figure is zero
 *   - a denial drawn as an error teaches them the system is broken
 *   - a withdrawal drawn with last-known figures presents stale data as current
 */

import { describe, expect, test } from 'bun:test'
import { mount } from '../../test/mount'
import { AnalyticsDataProvider } from '../data/AnalyticsData'
import { Widget } from './Widget'
import { SAMPLES } from './samples'
import type { Scenario } from '../data/adapters'
import type { CataloguePort } from '../../catalogue/port'

const SAMPLE = SAMPLES['stat-card']
const DATASET = SAMPLE.datasetId

const spec = {
  id: 'w-1',
  typeId: 'stat-card',
  datasetId: DATASET,
  title: SAMPLE.title,
  mapping: SAMPLE.mapping,
  options: SAMPLE.options,
}

/** Mount one Widget against a port told to behave a particular way. */
const show = async (scenario?: Scenario, latencyMs = 0) => {
  const screen = await mount(
    <AnalyticsDataProvider
      scenarios={scenario ? { [DATASET]: scenario } : {}}
      latencyMs={latencyMs}
    >
      <Widget spec={spec} />
    </AnalyticsDataProvider>,
  )
  return screen
}

const words = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase()

describe('a scenario on the port reaches the card', () => {
  test('a readable Dataset draws the figure', async () => {
    const screen = await show()
    expect(words(screen.text())).toContain('revenue')
    expect(words(screen.text())).not.toContain('access')
    screen.unmount()
  })

  test('a denied Dataset says access, not absence', async () => {
    /*
     * The whole point of the state existing. Drawn as empty, this tells a
     * Viewer the revenue is zero; drawn as an error, that the system is down.
     * Both are worse than the truth.
     */
    const screen = await show('denied')
    expect(words(screen.text())).toContain('access')
    screen.unmount()
  })

  test('a withdrawn Dataset says so and shows no figures', async () => {
    const screen = await show('withdrawn')
    expect(words(screen.text())).toContain('withdraw')
    screen.unmount()
  })

  test('a failure reports what did not answer', async () => {
    /*
     * The reason travels — "the source system did not answer for
     * revenue-monthly" — rather than a generic apology. A card that says only
     * "something went wrong" sends the Viewer to the wrong people, and sends
     * whoever they ask reading logs for a Dataset nobody named.
     */
    const screen = await show('failed')
    const said = words(screen.text())
    expect(said).toContain('did not answer')
    expect(said).toContain(DATASET)
    screen.unmount()
  })

  test('no rows is empty, and is not an error', async () => {
    const screen = await show('empty')
    const said = words(screen.text())
    expect(said).toContain('no data')
    expect(said).not.toContain('access')
    screen.unmount()
  })
})

describe('the five outcomes are told apart from each other', () => {
  test('no two of them read the same', async () => {
    /*
     * Asserted as a set rather than per-state wording: what a Viewer needs is
     * that these are *different*, and pinning the sentences would make every
     * copy edit a test failure.
     */
    const seen: Record<string, string> = {}
    for (const scenario of ['normal', 'empty', 'denied', 'withdrawn', 'failed'] as Scenario[]) {
      const screen = await show(scenario === 'normal' ? undefined : scenario)
      seen[scenario] = words(screen.text())
      screen.unmount()
    }

    expect(new Set(Object.values(seen)).size).toBe(5)
  })

  test('only the readable one draws a figure', async () => {
    const withFigure: string[] = []
    for (const scenario of ['normal', 'empty', 'denied', 'withdrawn', 'failed'] as Scenario[]) {
      const screen = await show(scenario === 'normal' ? undefined : scenario)
      // The sample's value column is revenue; a number on the card means the
      // widget drew data. A withdrawn Dataset showing one would be stale data
      // presented as current.
      if (/\d/.test(screen.text().replace(/[^\d]/g, ''))) withFigure.push(scenario)
      screen.unmount()
    }

    expect(withFigure).toEqual(['normal'])
  })
})

describe('loading is a state, not the absence of one', () => {
  test('a slow port leaves the card loading rather than empty', async () => {
    /*
     * `latencyMs` holds the answer back — modestly, because the runner waits
     * on a pending timer at exit and a long one turns this file slow for no
     * extra certainty. `flush` drains microtasks only, so any delay at all is
     * enough. This is the genuine first frame —
     * the one every static render of this component has always shown, and the
     * only one it could show.
     */
    const screen = await show(undefined, 400)
    const said = words(screen.text())
    expect(said).not.toContain('no data')
    expect(said).not.toContain('access')
    screen.unmount()
  })
})

/**
 * The three ways a card can have no Dataset, and only one is a withdrawal.
 *
 * Driven through the Catalogue rather than the retrieval scenarios, because
 * this decision is taken before any retrieval happens — `stateForWidget`
 * answers from `hasDataset`, and `useWidgetRows` never runs without one. A
 * probe aimed at the retrieval path cannot move it, which is exactly how this
 * gap stayed open: the scenarios only produce *retrieval* failures.
 *
 * The distinction is a bug this codebase already shipped once. A `503` while
 * describing rendered "the source system has withdrawn this dataset" — a
 * statement about a decision a publisher took, made because IAM was briefly
 * unreachable. Untrue, unfalsifiable from the card, and whoever acted on it
 * went looking for a choice nobody made.
 */
describe('a Catalogue that cannot describe is not a withdrawal', () => {
  const withCatalogue = async (describe: CataloguePort['describe']) => {
    const catalogue: CataloguePort = {
      browse: async () => [],
      describe,
      visualizations: async () => [],
    }
    return mount(
      <AnalyticsDataProvider catalogue={catalogue}>
        <Widget spec={spec} />
      </AnalyticsDataProvider>,
    )
  }

  test('answering "no such Dataset" is a withdrawal', async () => {
    // It was bound once, so it existed once. Drawing this as a failure would
    // say the system is broken while the system is working.
    const screen = await withCatalogue(async () => null)
    expect(words(screen.text())).toContain('withdraw')
    screen.unmount()
  })

  test('not answering at all is a failure, not a withdrawal', async () => {
    const screen = await withCatalogue(async () => {
      throw new Error('the catalogue is unreachable')
    })
    const said = words(screen.text())
    expect(said).not.toContain('withdraw')
    screen.unmount()
  })
})
