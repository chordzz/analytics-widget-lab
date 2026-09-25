/**
 * Currency codes read out of Field names.
 *
 * A display rule, not a semantic one, and the distinction is why it is allowed
 * to read a name at all: a semantic decides which charts a Dataset is offered,
 * so a wrong guess hides a capability or invents one. This decides which column
 * a toggle draws, and the caller only offers the swap where the counterpart is
 * actually declared — so a wrong guess produces no toggle rather than a wrong
 * number.
 */

import { describe, expect, test } from 'bun:test'
import { codeOf, inCode } from './units'

describe('finding the code in a name', () => {
  test('the whole key, as the grained Datasets spell it', () => {
    expect(codeOf('usd')).toBe('usd')
    expect(codeOf('ngn')).toBe('ngn')
  })

  test('the start of one, so a movement is still money', () => {
    expect(codeOf('usdDelta')).toBe('usd')
    expect(codeOf('usdChangePercent')).toBe('usd')
  })

  test('and a camelCase segment, as the summaries spell it', () => {
    expect(codeOf('grossFeeRevenueUsd')).toBe('usd')
    expect(codeOf('grossFeeRevenueUsdDelta')).toBe('usd')
  })

  test('but not a substring of an ordinary word', () => {
    /*
     * The trap. `thousands` contains `usd`, and it is a `record_volume` value —
     * a substring search would put a currency symbol on a row count. The
     * leading `[a-z]` boundary is what prevents it.
     */
    expect(codeOf('thousands')).toBeUndefined()
    expect(codeOf('total')).toBeUndefined()
    expect(codeOf('successRate')).toBeUndefined()
    expect(codeOf('changePercent')).toBeUndefined()
  })
})

describe('swapping one for another', () => {
  test('in place, so what follows the code survives', () => {
    // Appending would give `grossFeeRevenueUsdDeltaNgn`, and the delta would
    // stop naming the figure it qualifies.
    expect(inCode('grossFeeRevenueUsdDelta', 'ngn')).toBe('grossFeeRevenueNgnDelta')
    expect(inCode('usdDelta', 'ngn')).toBe('ngnDelta')
    expect(inCode('usd', 'ngn')).toBe('ngn')
  })

  test('a key already in that currency is returned unchanged', () => {
    expect(inCode('grossFeeRevenueNgn', 'ngn')).toBe('grossFeeRevenueNgn')
  })

  test('and a key encoding no currency yields nothing to swap', () => {
    expect(inCode('total', 'ngn')).toBeUndefined()
  })
})
