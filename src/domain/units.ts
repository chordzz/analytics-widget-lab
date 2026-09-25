/**
 * Currency codes encoded in Field names, and swapping between them.
 *
 * A publisher spelling one figure in two currencies has to name them somehow,
 * and Peniremit uses two spellings: bare — `usd`, `ngn` — on the grained
 * Datasets, and a camelCase segment — `grossFeeRevenueUsd` — on the summaries.
 *
 * This is a *display* rule, not a semantic one, and the distinction is the
 * reason it is allowed to read a name at all. A semantic decides which charts a
 * Dataset is offered, so guessing one hides a capability or invents it. This
 * decides which column a toggle draws, and it only ever offers the swap when
 * the Dataset actually publishes the counterpart — so a wrong guess produces no
 * toggle rather than a wrong number.
 *
 * The real fix is the declaration saying which Measures are units of each
 * other. Recorded for the backend; this goes when that arrives.
 */

/** The codes we recognise, lower-case. */
export const CURRENCY_CODES = ['usd', 'ngn', 'eur', 'gbp'] as const

const camel = (code: string) => code.charAt(0).toUpperCase() + code.slice(1)

/** The code this Field name encodes, if any. */
export function codeOf(key: string): string | undefined {
  for (const code of CURRENCY_CODES) {
    // The whole key, or the start of one: `usd`, `usdDelta`.
    if (new RegExp(`^${code}([A-Z]|$)`).test(key)) return code
    /*
     * A camelCase segment: `grossFeeRevenueUsd`, `grossFeeRevenueUsdDelta`.
     * The leading `[a-z]` is what keeps this from being a substring search —
     * without it `thousands` reads as a currency, which is the `record_volume`
     * enum and would put a dollar sign on a row count.
     */
    if (new RegExp(`[a-z]${camel(code)}([A-Z]|$)`).test(key)) return code
  }
  return undefined
}

/**
 * The same Field name in another currency, or `undefined` where it encodes none.
 *
 * Replaces the code in place rather than appending, so `grossFeeRevenueUsdDelta`
 * becomes `grossFeeRevenueNgnDelta` and not `grossFeeRevenueUsdDeltaNgn` — a
 * movement in dollars is a movement, and it has to travel with the figure it
 * qualifies or the card shows a naira total above a dollar change.
 */
export function inCode(key: string, to: string): string | undefined {
  const from = codeOf(key)
  if (!from || from === to) return from === to ? key : undefined

  if (new RegExp(`^${from}([A-Z]|$)`).test(key)) return key.replace(from, to)
  return key.replace(camel(from), camel(to))
}
