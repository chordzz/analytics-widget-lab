/**
 * C1 — the six render states, and the only place an outcome becomes one.
 *
 * The requirements are emphatic that these must not be collapsed, so the
 * mapping is a pure function with its own tests rather than a chain of
 * conditionals inside a component. Six states in, six states out; nothing
 * downstream may invent a seventh or merge two.
 */

import type { DatasetRow } from '../domain/query'
import type { RetrievalOutcome } from './port'

export type WidgetRenderState =
  | { status: 'loading' }
  | { status: 'ready'; rows: DatasetRow[] }
  /** FR-VZ-10 — must not look like a failure. */
  | { status: 'empty' }
  /** FR-DA-10, FR-DA-11 — must not look like an error or like absence of data. */
  | { status: 'denied' }
  /** FR-DP-14 — must not present stale data as current. */
  | { status: 'withdrawn' }
  | { status: 'failed'; message: string }

export type WidgetRenderStatus = WidgetRenderState['status']

export const WIDGET_RENDER_STATUSES: WidgetRenderStatus[] = [
  'loading',
  'ready',
  'empty',
  'denied',
  'withdrawn',
  'failed',
]

export function resolveRenderState(outcome: RetrievalOutcome): WidgetRenderState {
  switch (outcome.kind) {
    case 'rows':
      // A retrieval that reports rows but carries none is a contract breach by
      // the Source System, not an empty Dataset. Surface it rather than
      // quietly rendering a chart of nothing.
      return outcome.rows.length > 0
        ? { status: 'ready', rows: outcome.rows }
        : { status: 'failed', message: 'Retrieval reported rows but returned none.' }
    case 'empty':
      return { status: 'empty' }
    case 'denied':
      return { status: 'denied' }
    case 'withdrawn':
      return { status: 'withdrawn' }
  }
}

export function resolveFailure(error: unknown): WidgetRenderState {
  return {
    status: 'failed',
    message: error instanceof Error ? error.message : 'Retrieval failed.',
  }
}
