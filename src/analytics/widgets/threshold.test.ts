/**
 * Threshold assessment.
 *
 * Every case here is either a direction or a boundary, which is the whole reason
 * this module is pure: the trap is that `value < threshold` reads correctly for
 * uptime and inverts for an error rate, and no amount of looking at a rendered
 * card tells you which one you implemented.
 */

import { describe, expect, test } from 'bun:test'
import { assessThreshold, describeDirection, thresholdFrom } from './threshold'

const below = { threshold: 99, direction: 'below-is-bad' } as const
const above = { threshold: 1, direction: 'above-is-bad' } as const

describe('direction decides the answer', () => {
  test('95% uptime against a 99% target is a breach', () => {
    expect(assessThreshold(95, below).state).toBe('breached')
  })

  test('a 0.5% error rate against a 1% ceiling is healthy', () => {
    expect(assessThreshold(0.5, above).state).toBe('healthy')
  })

  test('the same number is a breach one way and healthy the other', () => {
    /*
     * The discriminating case. A single-direction implementation passes both
     * tests above by accident for one of them, and this is the one that catches
     * it: 95 against a threshold of 99 cannot be both.
     */
    const config = { threshold: 99 }
    expect(assessThreshold(95, { ...config, direction: 'below-is-bad' }).state).toBe('breached')
    expect(assessThreshold(95, { ...config, direction: 'above-is-bad' }).state).toBe('healthy')
  })
})

describe('the boundary is inclusive', () => {
  test('a value exactly at the threshold has breached it', () => {
    // Exclusive would report a service sitting precisely on its SLO as healthy,
    // which is the one reading nobody wants to defend in a review.
    expect(assessThreshold(99, below).state).toBe('breached')
    expect(assessThreshold(1, above).state).toBe('breached')
  })

  test('a value just the safe side of it is healthy', () => {
    expect(assessThreshold(99.01, below).state).toBe('healthy')
    expect(assessThreshold(0.99, above).state).toBe('healthy')
  })
})

describe('the warning line', () => {
  test('sits between healthy and breached', () => {
    const config = { threshold: 95, warnAt: 99, direction: 'below-is-bad' } as const

    expect(assessThreshold(99.5, config).state).toBe('healthy')
    expect(assessThreshold(97, config).state).toBe('warning')
    expect(assessThreshold(94, config).state).toBe('breached')
  })

  test('a breach outranks a warning', () => {
    // Both predicates are true below 95; the order of the checks is what makes
    // the answer the more serious of the two.
    const config = { threshold: 95, warnAt: 99, direction: 'below-is-bad' } as const
    expect(assessThreshold(10, config).state).toBe('breached')
  })

  test('no warning line means only two outcomes', () => {
    expect(assessThreshold(97, below).state).toBe('breached')
  })
})

describe('an unconfigured or unusable figure is not healthy', () => {
  test('no threshold reads as unset', () => {
    /*
     * "Checked, and fine" is a claim. A widget nobody configured has not been
     * checked, and saying healthy there is the one answer that actively misleads
     * — unlike `unset`, which a reader can act on.
     */
    expect(assessThreshold(42, { direction: 'below-is-bad' }).state).toBe('unset')
    expect(assessThreshold(42, { direction: 'below-is-bad' }).tone).toBe('neutral')
  })

  test('NaN reads as unset, not healthy', () => {
    // `NaN >= 99` is false, so a naive implementation calls a missing figure
    // healthy. That is how an empty measure renders as a green tick.
    expect(assessThreshold(Number.NaN, below).state).toBe('unset')
    expect(assessThreshold(Number.POSITIVE_INFINITY, below).state).toBe('unset')
  })
})

describe('tones are the module’s reserved ones', () => {
  test('each state maps to a status tone, and a breach is critical', () => {
    // So a threshold widget and a state-Dimension widget on one board agree
    // about what green means.
    expect(assessThreshold(100, below).tone).toBe('good')
    expect(assessThreshold(97, { ...below, threshold: 95, warnAt: 99 }).tone).toBe('warning')
    expect(assessThreshold(10, below).tone).toBe('critical')
  })

  test('every state carries a written label', () => {
    // State is never conveyed by colour alone — a red dot tells a colour-blind
    // reader nothing on its own.
    for (const value of [100, 10, Number.NaN]) {
      expect(assessThreshold(value, below).label).toBeTruthy()
    }
  })
})

describe('reading options off a widget', () => {
  test('numbers come through and anything else does not', () => {
    expect(thresholdFrom({ threshold: 99, warnAt: 99.5 })).toMatchObject({
      threshold: 99,
      warnAt: 99.5,
    })
    expect(thresholdFrom({ threshold: '99' }).threshold).toBeUndefined()
  })

  test('the default direction is below-is-bad', () => {
    // The Measures people threshold are mostly ones where more is better, so the
    // common case needs no configuration.
    expect(thresholdFrom({}).direction).toBe('below-is-bad')
    expect(thresholdFrom({ direction: 'above-is-bad' }).direction).toBe('above-is-bad')
    expect(thresholdFrom({ direction: 'nonsense' }).direction).toBe('below-is-bad')
  })

  test('the direction reads as words', () => {
    expect(describeDirection('above-is-bad')).toBe('higher is worse')
    expect(describeDirection('below-is-bad')).toBe('lower is worse')
  })
})
