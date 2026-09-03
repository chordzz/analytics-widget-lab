/**
 * Threshold assessment — the Status family's second route.
 *
 * §4.2 gives Status two Data Shapes: a state Dimension, or **one Measure with a
 * threshold**. `status-list` and `status-indicator` take the first;
 * `threshold-indicator` and `alert-banner` take this one.
 *
 * Pure and separate because the rule below is arithmetic with a trap in it, and
 * a browser cannot tell you the trap is still closed.
 *
 * **`direction` is not optional in practice.** Without it a threshold is
 * ambiguous in a way that silently inverts the answer: 95% uptime against a 99%
 * target is a breach, and a 95% error rate against a 1% target is a far worse
 * one — but the arithmetic `value < threshold` calls the first a breach and the
 * second healthy. The comparison has to know which way is bad.
 *
 * Analytics **displays** threshold state and does not act on it. Detecting a
 * breach and notifying someone is a separate capability and explicitly out of
 * scope, which is why nothing here returns an action or fires anything.
 */

import type { StatusTone } from '../theme/tokens'

/** Which way is bad. There is no sensible default; see the module header. */
export type ThresholdDirection = 'above-is-bad' | 'below-is-bad'

export interface ThresholdConfig {
  /** The value that counts as breached. Absent means the Author set none. */
  threshold?: number
  /** An earlier line, short of a breach. Optional. */
  warnAt?: number
  direction: ThresholdDirection
}

export type ThresholdState = 'healthy' | 'warning' | 'breached' | 'unset'

export interface Assessment {
  state: ThresholdState
  /**
   * The module's reserved status tone, so a threshold widget and a state-Dimension
   * widget agree about what green means.
   */
  tone: StatusTone
  label: string
}

/*
 * `breached` maps to `critical` rather than `serious`: a breach is the state the
 * Author defined as the thing not to be in, so it takes the strongest tone. The
 * four tones are reserved (green is healthy, never "EMEA"), and this mapping is
 * what keeps the two Status routes reading identically on one board.
 */
const TONE: Record<ThresholdState, StatusTone> = {
  healthy: 'good',
  warning: 'warning',
  breached: 'critical',
  unset: 'neutral',
}

const LABEL: Record<ThresholdState, string> = {
  healthy: 'Healthy',
  warning: 'Warning',
  breached: 'Breached',
  unset: 'No threshold set',
}

/**
 * Where one figure sits against its threshold.
 *
 * A missing threshold is `unset`, not `healthy`. Reporting healthy for a widget
 * nobody has configured is the one answer that is actively misleading — it says
 * "checked, and fine" when nothing was checked.
 *
 * A non-finite value is also `unset`: `NaN >= 99` is `false`, which would
 * otherwise render a missing figure as healthy.
 */
export function assessThreshold(value: number, config: ThresholdConfig): Assessment {
  const { threshold, warnAt, direction } = config

  if (threshold === undefined || !Number.isFinite(value)) return state('unset')

  const past = (limit: number) => (direction === 'above-is-bad' ? value >= limit : value <= limit)

  if (past(threshold)) return state('breached')
  if (warnAt !== undefined && past(warnAt)) return state('warning')
  return state('healthy')
}

const state = (value: ThresholdState): Assessment => ({
  state: value,
  tone: TONE[value],
  label: LABEL[value],
})

/** "higher is worse" / "lower is worse" — the direction, for a reader. */
export const describeDirection = (direction: ThresholdDirection): string =>
  direction === 'above-is-bad' ? 'higher is worse' : 'lower is worse'

/**
 * Pull a threshold config out of a widget's `options`.
 *
 * Defaults to `below-is-bad`, and that default is a judgement rather than an
 * arbitrary pick: the Measures people put a threshold on are overwhelmingly ones
 * where more is better — uptime, revenue, conversion — so the common case needs
 * no configuration. A rate or an error count has to say `above-is-bad`.
 */
export function thresholdFrom(options: Record<string, unknown>): ThresholdConfig {
  return {
    threshold: typeof options.threshold === 'number' ? options.threshold : undefined,
    warnAt: typeof options.warnAt === 'number' ? options.warnAt : undefined,
    direction: options.direction === 'above-is-bad' ? 'above-is-bad' : 'below-is-bad',
  }
}
