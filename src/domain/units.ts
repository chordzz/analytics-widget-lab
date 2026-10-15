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

/**
 * Which currencies a mapping may be toggled between, or `undefined` for none.
 *
 * Takes the mapped Field keys already flattened, rather than a mapping object,
 * because the two callers disagree on its shape — the Peniremit script's is a
 * loose `Record`, the live composer's `WidgetMapping` is a sealed interface —
 * and the rule only ever needed the keys.
 *
 * Dataset-shape-agnostic for the same reason it takes `datasetFieldKeys` raw:
 * this is the one place the rule lives, so a Widget built by hand in the
 * composer and one built by the Peniremit script get the toggle under the
 * identical condition — publishing one mapped Field in a currency should not
 * depend on which path created the Widget.
 *
 * Offers only a currency the Dataset publishes *every* mapped Measure in. Half
 * a swap is worse than none: the figure would move and its delta would not.
 * And only when every mapped currency-bearing key agrees on one source
 * currency — a mapping already split across `usd` and `ngn` has nothing
 * coherent to offer a toggle between.
 */
export function currencyUnitsFor(
  datasetFieldKeys: readonly string[],
  mappedKeys: readonly string[],
): string[] | undefined {
  const coded = mappedKeys
    .map((key) => ({ key, code: codeOf(key) }))
    .filter((entry): entry is { key: string; code: string } => entry.code !== undefined)
  if (coded.length === 0) return undefined
  if (new Set(coded.map((entry) => entry.code)).size > 1) return undefined

  const from = coded[0].code
  const others = CURRENCY_CODES.filter((code) => code !== from)

  const available = others.filter((to) =>
    coded.every((entry) => {
      const swapped = inCode(entry.key, to)
      return swapped !== undefined && datasetFieldKeys.includes(swapped)
    }),
  )

  return available.length > 0 ? [from, ...available] : undefined
}
