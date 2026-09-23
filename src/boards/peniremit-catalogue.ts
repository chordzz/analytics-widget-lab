/**
 * Peniremit's 41 published Datasets, as their portal guide declares them.
 *
 * Transcribed from the integration guide of 22 September, and only as much of
 * each declaration as binding a Widget needs: the Field keys, which of them is
 * the time Dimension, and the shape the endpoint answers with.
 *
 * It is here rather than fetched because it is used to *check* boards before
 * anything reaches the API — the point is to find a card that cannot be built
 * without a round trip, an access token, or a half-created Dashboard. The live
 * `/v1/datasets` remains the authority, and `scripts/peniremit-boards.ts`
 * compares the two when it runs with a token.
 *
 * `additive` records which Measures Peniremit declared `semantic:
 * additive-total` after our 22 September request. Transcribed, not observed —
 * `bun run conform` reads the live declarations and its BE-1 row names what it
 * actually finds. If the two disagree, the live one is right and this is wrong.
 *
 * Only money and counts carry it. `percentage` and `changePercent` deliberately
 * do not: summing percentages is permitted arithmetic and a meaningless total,
 * which is the exact case `additive-total` exists to distinguish. A donut of
 * shares that sums to 340% is the failure mode.
 */

export type PeniremitShape = 'aggregate' | 'date' | 'category'

export interface PeniremitDataset {
  id: string
  name: string
  shape: PeniremitShape
  /** Field keys in declaration order. The first is the Dimension for a
   *  `date` or `category` Dataset; an `aggregate` one has no Dimension. */
  keys: string[]
  /** Measures declared `semantic: additive-total`. Empty where none are. */
  additive?: string[]
  /**
   * Filter Parameters beyond `from`/`to`, which every Dataset here declares.
   *
   * Stated per Dataset rather than assumed from its shape. The first version of
   * this file inferred them — `granularity` for anything grained by date, and
   * nothing else — and that inference was wrong in the direction that matters:
   * it said `peniremit.transaction-count-summary` had no `status`, so a card
   * the guide describes looked impossible. It declares one, with
   * `allowed_values: ["success", "failed", "all"]`.
   *
   * The query endpoint refuses any parameter a Dataset did not advertise, so an
   * over-declaration here produces a 400 at runtime and an under-declaration
   * hides a card that works. Neither is recoverable by guessing, which is why
   * `bun run conform --dump-catalogue` exists: it writes the live declarations,
   * and those replace anything transcribed here.
   */
  params?: string[]
}

const d = (
  id: string,
  name: string,
  shape: PeniremitShape,
  keys: string[],
  extra: { additive?: string[]; params?: string[] } = {},
): PeniremitDataset => ({
  id: `peniremit.${id}`,
  name,
  shape,
  keys,
  ...(extra.additive ? { additive: extra.additive } : {}),
  // Everything grained by date takes `granularity`; the guide is consistent on
  // that and the live declarations agree.
  params: [...(shape === 'date' ? ['granularity'] : []), ...(extra.params ?? [])],
})

/** Every Dataset's `from`/`to`, which none of them omit. */
export const BASE_PARAMS = ['from', 'to']

/** Money totals. Every category Dataset that measures value in both currencies. */
const MONEY_ADDITIVE = ['usd', 'ngn']

const VALUE = ['value', 'delta', 'changePercent']
const MONEY = ['usd', 'ngn', 'usdDelta', 'ngnDelta', 'usdChangePercent', 'ngnChangePercent']
const SHARE = ['category', 'usd', 'ngn', 'percentage', 'changePercent']

export const PENIREMIT_DATASETS: PeniremitDataset[] = [
  // Growth
  d('total-registered-users', 'Total Registered Users', 'aggregate', VALUE),
  d('total-registered-users-trend', 'Total Registered Users Trend', 'date', ['date', 'value']),
  d('signups-summary', 'Signups Summary', 'aggregate', VALUE),
  d('signups', 'Signups', 'date', ['date', 'value']),
  d('first-transaction-rate', 'First Transaction Rate', 'aggregate', VALUE),
  d('first-transaction-rate-trend', 'First Transaction Rate Trend', 'date', ['date', 'value']),
  d('signup-outcomes-summary', 'Signup Outcomes Summary', 'aggregate',
    ['completed', 'dropOffs', 'total', 'completedDelta', 'dropOffsDelta', 'completedChangePercent', 'dropOffsChangePercent']),
  d('signup-outcomes', 'Signup Outcomes', 'date', ['date', 'value', 'dropOffs', 'total']),
  d('signup-by-channel', 'Signups by Channel', 'category', ['category', 'value', 'delta', 'changePercent'], { additive: ['value'] }),
  d('user-growth', 'User Growth', 'aggregate', VALUE),

  // Transaction
  d('transfer-volume', 'Total Transfer Volume', 'date', ['date', 'usd', 'ngn']),
  d('transaction-count-summary', 'Total Transactions', 'aggregate', VALUE, { params: ['status'] }),
  d('transaction-count-trend', 'Total Transactions Trend', 'date', ['date', 'value'], { params: ['status'] }),
  d('transaction-rate-summary', 'Transaction Rate Summary', 'aggregate',
    ['total', 'successful', 'failed', 'pending', 'successRate', 'totalDelta', 'successfulDelta', 'failedDelta']),
  d('transaction-rate', 'Transaction Rate', 'date', ['date', 'value', 'total', 'successful', 'failed', 'pending']),
  d('deposit-volume-summary', 'Total Deposit', 'aggregate', MONEY),
  d('deposit-volume-trend', 'Total Deposit Trend', 'date', ['date', 'usd', 'ngn']),
  d('spend-volume-summary', 'Total Spend', 'aggregate', MONEY),
  d('avg-transaction-value-summary', 'Avg Transaction Value', 'aggregate', MONEY),
  d('spend-by-category', 'Spend by Category', 'category', SHARE, { additive: MONEY_ADDITIVE }),
  d('top-token-deposits', 'Top Token Deposits', 'category', SHARE, { additive: MONEY_ADDITIVE }),
  d('top-token-spend', 'Top Token Spend', 'category', SHARE, { additive: MONEY_ADDITIVE }),
  d('smart-spend-token', 'Smart Spend Token', 'category', SHARE, { additive: MONEY_ADDITIVE }),
  d('failure-reasons', 'Top Failure Reasons', 'category', ['category', 'value', 'percentage', 'changePercent'], { additive: ['value'] }),

  // Revenue
  d('gross-revenue', 'Gross Revenue', 'date', ['date', 'usd', 'ngn']),
  d('fee-revenue-trend', 'Fee Revenue Trend', 'date',
    ['date', 'palmpayFeesUsd', 'palmpayFeesNgn', 'fxFeesUsd', 'fxFeesNgn', 'cardFeesUsd', 'cardFeesNgn']),
  d('net-revenue', 'Net Revenue', 'date', ['date', 'usd', 'ngn']),
  d('revenue-summary', 'Revenue Summary', 'aggregate',
    ['grossFeeRevenueUsd', 'grossFeeRevenueNgn', 'palmpayFeesUsd', 'netMarginUsd',
     'avgFeePerTransactionUsd', 'marginPerTransactionUsd']),
  d('revenue-by-token', 'Revenue by Token', 'category', SHARE, { additive: MONEY_ADDITIVE }),
  d('revenue-by-product', 'Revenue by Product', 'category', SHARE, { additive: MONEY_ADDITIVE }),
  d('fx-revenue-by-token', 'FX Revenue by Token', 'category', SHARE, { additive: MONEY_ADDITIVE }),

  // Engagement
  d('active-users-summary', 'Active Users Summary', 'aggregate',
    ['dau', 'mau', 'dauDelta', 'mauDelta', 'dauChangePercent', 'mauChangePercent']),
  d('active-users', 'Active Users', 'date', ['date', 'dau', 'mau']),
  d('avg-transfer-size', 'Avg Transfer Size', 'date', ['date', 'usd', 'ngn']),
  d('tx-per-active-user-per-day-summary', 'Transactions per Active User per Day Summary', 'aggregate', VALUE),
  d('tx-per-active-user-per-day', 'Transactions per Active User per Day', 'date', ['date', 'value']),
  d('active-cards-summary', 'Active Cards Summary', 'aggregate', VALUE),
  d('active-cards', 'Active Cards', 'date', ['date', 'value']),
  d('kyc-outcomes-summary', 'KYC Outcomes Summary', 'aggregate',
    ['completed', 'failed', 'completedDelta', 'failedDelta', 'completedChangePercent', 'failedChangePercent']),
  d('kyc-outcomes', 'KYC Outcomes', 'date', ['date', 'completed', 'failed']),
  d('engagement-summary', 'Engagement Summary', 'aggregate',
    ['retention7d', 'retention30d', 'dauMauRatio', 'retention7dDelta', 'retention30dDelta', 'dauMauRatioDelta']),
]

export const peniremitDataset = (id: string): PeniremitDataset | undefined =>
  PENIREMIT_DATASETS.find((entry) => entry.id === id)
