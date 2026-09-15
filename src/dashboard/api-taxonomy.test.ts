/**
 * What the API will and will not accept as a `visualization_type`.
 *
 * This file used to guard a translation table: sixteen of our ids were spelled
 * differently upstream and were rewritten at the boundary. On 15 September the
 * backend adopted §4.2 in full, so the table is gone and what is left is the
 * property that matters — **we send our own identifiers, unmodified.**
 *
 * The lesson from the version before this one is worth keeping. It asserted the
 * translation was still needed against a *hardcoded copy* of the backend's list,
 * so when they changed their list the test carried on passing and the
 * translation quietly became the bug it was written to prevent. A guard that
 * cannot observe the thing it guards is not a guard. `taxonomy-drift.ts` is the
 * replacement, and it asks the API.
 */

import { describe, expect, test } from 'bun:test'
import { UNMAPPED_TYPE_IDS, acceptedByApi } from './api-taxonomy'
import { dashboardInputFrom } from './api-dashboard'
import { WIDGET_TYPES } from '../analytics/widgets/catalog'
import type { Board } from '../analytics/builder/boards'

describe('our identifiers go out unmodified', () => {
  test('a widget is sent under the id our registry uses', () => {
    const board: Board = {
      id: 'b1',
      name: 'Finance daily',
      description: '',
      authorId: 'u1',
      scope: { kind: 'personal' },
      shareGrants: [],
      status: 'draft',
      updated: '2026-09-15',
      widgets: {
        w1: { id: 'w1', typeId: 'line-chart', datasetId: 'd1', title: 'Revenue', mapping: {} },
      },
      placements: [{ widgetId: 'w1', x: 0, y: 0, w: 6, h: 4 }],
      controls: [],
      sections: [],
    }

    // `line-chart`, not `line`. The translation that made this `line` is deleted,
    // and sending it now would be refused.
    expect(dashboardInputFrom(board).widgets[0].visualization_type).toBe('line-chart')
  })
})

describe('what the API still has no name for', () => {
  test('only `status-list`', () => {
    /*
     * Ours rather than theirs. D7 proposes it as a 43rd Type *extending* §4.2;
     * the backend adopted §4.2 as written, so a Type the FRD does not contain is
     * one they had no reason to add. Our proposal outrunning the contract is the
     * right way round for this to be outstanding.
     */
    expect([...UNMAPPED_TYPE_IDS]).toEqual(['status-list'])
  })

  test('the Chronological pair is accepted now', () => {
    // They added the Family on 15 September. These two could not be saved at all
    // before it, which was the one functional gap in the taxonomy note.
    expect(acceptedByApi('activity-feed')).toBe(true)
    expect(acceptedByApi('event-log-view')).toBe(true)
  })

  test('and everything else built is accepted', () => {
    const refused = WIDGET_TYPES.filter((type) => type.built && !acceptedByApi(type.id))
    expect(refused.map((type) => type.id)).toEqual(['status-list'])
  })
})
