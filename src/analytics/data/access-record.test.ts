/**
 * The access record — FR-DA-14.
 *
 * Merge Plan Stage 6.5. The interesting cases are all about what must *not* be
 * recorded: a false entry is worse than a missing one, because it asserts
 * someone saw personal data they never received.
 */

import { describe, expect, test } from 'bun:test'
import { InMemoryAccessRecorder } from '../../access/fake-access-recorder'
import { FixtureRetrieval } from './adapters'
import { requireDataset } from './datasets'
import type { ViewerIdentity } from '../../retrieval/port'

const viewer: ViewerIdentity = {
  id: 'ops-lead',
  displayName: 'Operations lead',
  organizationalScopeIds: ['operations'],
}

const everything = { limit: 5 }

const withRecorder = (scenarios?: Record<string, 'denied' | 'withdrawn' | 'empty' | 'failed'>) => {
  const recorder = new InMemoryAccessRecorder()
  return { recorder, retrieval: new FixtureRetrieval({ scenarios }, recorder) }
}

describe('what gets recorded', () => {
  test('a retrieval of a personal-data Dataset is recorded', async () => {
    const { recorder, retrieval } = withRecorder()
    await retrieval.retrieve('activity-events', everything, viewer)

    const entries = await recorder.list()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      viewerId: 'ops-lead',
      viewerName: 'Operations lead',
      datasetId: 'activity-events',
      datasetName: requireDataset('activity-events').name,
    })
  })

  test('the entry carries a timestamp', async () => {
    const { recorder, retrieval } = withRecorder()
    await retrieval.retrieve('activity-events', everything, viewer)

    const [entry] = await recorder.list()
    expect(Number.isNaN(new Date(entry.at).getTime())).toBe(false)
  })

  test('every retrieval is its own entry', async () => {
    // Not deduplicated. "Who saw this, and when" is a list of occasions, and
    // collapsing two viewings into one loses the second date.
    const { recorder, retrieval } = withRecorder()
    await retrieval.retrieve('activity-events', everything, viewer)
    await retrieval.retrieve('activity-events', everything, viewer)

    expect(await recorder.list()).toHaveLength(2)
  })

  test('the log is newest first', async () => {
    const { recorder, retrieval } = withRecorder()
    await retrieval.retrieve('activity-events', everything, viewer)
    await retrieval.retrieve('transactions', everything, viewer)

    expect((await recorder.list()).map((entry) => entry.datasetId)).toEqual([
      'transactions',
      'activity-events',
    ])
  })
})

describe('what must not be recorded', () => {
  test('a Dataset that carries no personal data is not recorded', async () => {
    // Logging every retrieval would bury the entries that matter under the ones
    // that do not, which is the opposite of what FR-DA-14 asks for.
    const { recorder, retrieval } = withRecorder()
    await retrieval.retrieve('revenue-daily', everything, viewer)

    expect(await recorder.list()).toEqual([])
    expect(requireDataset('revenue-daily').exposesPersonalData).toBe(false)
  })

  test('a denied retrieval records nothing', async () => {
    /*
     * The one that matters most. A denial means the Viewer received no rows, so
     * an entry would assert an access that did not happen — and unlike a missing
     * entry, a false one cannot be spotted by anyone reading the log.
     */
    const { recorder, retrieval } = withRecorder({ 'activity-events': 'denied' })
    const outcome = await retrieval.retrieve('activity-events', everything, viewer)

    expect(outcome.kind).toBe('denied')
    expect(await recorder.list()).toEqual([])
  })

  test('a withdrawn Dataset records nothing', async () => {
    const { recorder, retrieval } = withRecorder({ 'activity-events': 'withdrawn' })
    const outcome = await retrieval.retrieve('activity-events', everything, viewer)

    expect(outcome.kind).toBe('withdrawn')
    expect(await recorder.list()).toEqual([])
  })

  test('an empty result records nothing', async () => {
    // Authorized, but there was nothing to see. No personal data reached anyone.
    const { recorder, retrieval } = withRecorder({ 'activity-events': 'empty' })
    const outcome = await retrieval.retrieve('activity-events', everything, viewer)

    expect(outcome.kind).toBe('empty')
    expect(await recorder.list()).toEqual([])
  })

  test('a failed retrieval records nothing', async () => {
    const { recorder, retrieval } = withRecorder({ 'activity-events': 'failed' })
    await expect(retrieval.retrieve('activity-events', everything, viewer)).rejects.toThrow()

    expect(await recorder.list()).toEqual([])
  })

  test('listing filter values records nothing', async () => {
    /*
     * A filter dropdown is populated from distinct values, which is a narrower
     * disclosure than the records themselves and is not what FR-DA-14 describes.
     * Recording it would make the log unreadable — every dropdown a Viewer opens
     * would appear as an access.
     */
    const { recorder, retrieval } = withRecorder()
    await retrieval.listFilterValues('activity-events', 'actor', viewer)

    expect(await recorder.list()).toEqual([])
  })
})

describe('the record cannot be rewritten', () => {
  test('the recorder exposes no way to amend or remove an entry', () => {
    // Append-only by construction. A record that can be edited establishes
    // nothing, so the guarantee is the absence of a method rather than a rule
    // somebody has to remember.
    const recorder = new InMemoryAccessRecorder()
    const surface = [
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(recorder)),
      ...Object.keys(recorder),
    ]

    expect(surface).not.toContain('delete')
    expect(surface).not.toContain('remove')
    expect(surface).not.toContain('clear')
    expect(surface).not.toContain('update')
  })

  test('the list handed out is a copy', async () => {
    const { recorder, retrieval } = withRecorder()
    await retrieval.retrieve('activity-events', everything, viewer)

    const entries = await recorder.list()
    entries.length = 0

    expect(await recorder.list()).toHaveLength(1)
  })
})
