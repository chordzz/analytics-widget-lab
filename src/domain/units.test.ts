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
import { codeOf, currencyUnitsFor, inCode } from './units'

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

describe('which currencies a mapping may toggle between', () => {
  /*
   * The bug this closes: a Widget built in the live composer never set
   * `unitOptions`, because only the one-off Peniremit script computed it —
   * nothing in the product's own "add a widget" flow did. The fix moved the
   * rule here so both paths share one answer.
   */
  test('offered when the Dataset publishes the counterpart', () => {
    expect(currencyUnitsFor(['usd', 'ngn'], ['usd'])).toEqual(['usd', 'ngn'])
  })

  test('not offered when the Dataset does not publish it', () => {
    // Exactly Peniremit's early boards, and exactly why the toggle produces
    // no card rather than a wrong number.
    expect(currencyUnitsFor(['usd'], ['usd'])).toBeUndefined()
  })

  test('not offered unless every mapped currency-bearing key has its counterpart', () => {
    // Half a swap is worse than none: the figure would move and its delta
    // would not.
    expect(currencyUnitsFor(['usd', 'ngn', 'usdDelta'], ['usd', 'usdDelta'])).toBeUndefined()
  })

  test('not offered when the mapping already spans two currencies', () => {
    // Nothing coherent to toggle: there is no single "from" to swap away from.
    expect(currencyUnitsFor(['usd', 'ngn'], ['usd', 'ngn'])).toBeUndefined()
  })

  test('not offered when nothing mapped encodes a currency at all', () => {
    expect(currencyUnitsFor(['usd', 'ngn'], ['category'])).toBeUndefined()
  })

  test('a Field mapped twice does not get offered twice', () => {
    expect(currencyUnitsFor(['usd', 'ngn'], ['usd', 'usd'])).toEqual(['usd', 'ngn'])
  })
})
