/**
 * Peniremit's four dashboards, as their portal guide lays them out.
 *
 * The guide describes 39 *cards*, and a card is not a Widget. Most pair an
 * aggregate summary with a grained trend — "1,420 · +28 · ▲2.01%" above a line
 * — and those are two Datasets. A Widget binds one, so a paired card becomes
 * two Widgets sitting together: the number, and the line under it.
 *
 * That is a real constraint rather than a shortcut, and worth stating plainly
 * when we hand this back to them: a Widget's identity is its Dataset, and a
 * chart drawn from two Datasets could not be re-bound, re-filtered or reused in
 * the library as one thing.
 *
 * Every entry here is checked against the declaration before anything is
 * created — see `peniremit-boards.test.ts`. A card naming a Type its Dataset
 * cannot carry fails there rather than at `POST /v1/dashboards`.
 */

import { peniremitDataset } from './peniremit-catalogue'

export interface BoardCard {
  /** The card's title in the guide, so the two can be read side by side. */
  card: string
  /** What this Widget is called on the board. */
  title: string
  datasetId: string
  typeId: string
  /** Slot assignments, keyed as `WidgetMapping`. */
  mapping: Record<string, string | string[]>
  /**
   * Filter Parameters the Author binds, keyed by parameter name.
   *
   * Sent upstream, never applied to returned rows — a parameter name is not a
   * column name. A bound parameter is the Author saying what this Widget is
   * about; a Viewer with the permission can still move it, which is why
   * "Failed transactions" is a bound `status` rather than a separate Dataset.
   */
  parameters?: Record<string, string>
  /** Columns on a 12-column board. A layout decision, so it is stated. */
  w: number
  /**
   * Rows, only where the type's own height is wrong for this card.
   *
   * Omitted almost always: `heightForType` knows what a stat card and a line
   * chart need, and hand-written row counts is how every widget on the first
   * four Dashboards came out 24 pixels tall.
   */
  h?: number
}

export interface BoardDefinition {
  name: string
  description: string
  cards: BoardCard[]
}

/** A number and the line beneath it: one card, two Widgets. */
/**
 * The change a summary Dataset publishes alongside its figure, if any.
 *
 * Peniremit's aggregates carry `delta` — an absolute movement — beside `value`,
 * and a per-measure equivalent where the figure is money: `usd` is paired with
 * `usdDelta`. Mapped rather than computed: a stat card receives one aggregated
 * row and cannot derive movement from it, which is why these were bare numbers.
 *
 * `changePercent` is deliberately not used yet. `2.01` is either two per cent
 * or two hundred and one depending on a convention nobody has stated, and a
 * card confidently showing the wrong one is worse than a card showing the
 * absolute change. The question is with them.
 */
const publishedDelta = (datasetId: string, valueKey: string): string | undefined => {
  const keys = requirePeniremitDataset(datasetId).keys
  const candidate = valueKey === 'value' ? 'delta' : `${valueKey}Delta`
  return keys.includes(candidate) ? candidate : undefined
}

/** A stat card over a summary Dataset, showing a published change where there is one. */
const summaryCard = (card: string, datasetId: string, valueKey: string, title = card): BoardCard => {
  const delta = publishedDelta(datasetId, valueKey)
  return {
    card, title, datasetId, typeId: 'stat-card',
    mapping: { value: valueKey, ...(delta ? { delta } : {}) },
    w: 3,
  }
}

const pair = (
  card: string,
  summaryId: string,
  trendId: string,
  valueKey: string,
  trendKeys: string[],
): BoardCard[] => [
  summaryCard(card, summaryId, valueKey),
  { card, title: `${card} over time`, datasetId: trendId, typeId: 'line-chart',
    mapping: { x: 'date', series: trendKeys }, w: 9 },
]

/**
 * A category breakdown, drawn as whatever the declaration supports.
 *
 * A donut answers "what are the parts of this whole?" and only means anything
 * when the parts sum to a whole — which is precisely what `additive-total`
 * states and nothing else can. Where the Measure carries it, Composition is
 * satisfied and the donut is offered. Where it does not, a bar chart answers
 * the neighbouring question — "how do these compare?" — which needs no such
 * claim.
 *
 * Derived rather than switched by hand. The nine category Datasets were bars
 * until Peniremit declared their money Measures additive on 23 September; had
 * this been nine hardcoded type ids, adopting that would have been nine edits
 * and a tenth Dataset would have been missed. It also self-corrects: if the
 * live declaration turns out not to carry the semantic, the validator fails
 * here rather than `POST /v1/dashboards` failing later.
 */
const share = (card: string, datasetId: string, key: string, w = 6): BoardCard => ({
  card,
  title: card,
  datasetId,
  typeId: (requirePeniremitDataset(datasetId).additive ?? []).includes(key)
    ? 'donut-chart'
    : 'bar-chart-vertical',
  mapping: { x: 'category', value: key, series: [key] },
  w,
})

export const GROWTH: BoardDefinition = {
  name: 'Growth',
  description: 'Registration, signup and first-transaction behaviour.',
  cards: [
    ...pair('Total registered users', 'peniremit.total-registered-users',
      'peniremit.total-registered-users-trend', 'value', ['value']),
    ...pair('New signups', 'peniremit.signups-summary',
      'peniremit.signups', 'value', ['value']),
    ...pair('First transaction rate', 'peniremit.first-transaction-rate',
      'peniremit.first-transaction-rate-trend', 'value', ['value']),

    /*
     * Completed against drop-offs. The trend carries both as separate Measures,
     * so one chart shows the comparison the card is named for — where the
     * summary can only show one number at a time.
     */
    summaryCard('New signups (Completed vs Drop-Offs)', 'peniremit.signup-outcomes-summary', 'completed', 'Completed signups'),
    { card: 'New signups (Completed vs Drop-Offs)', title: 'Completed and dropped',
      datasetId: 'peniremit.signup-outcomes', typeId: 'line-chart',
      mapping: { x: 'date', series: ['value', 'dropOffs'] }, w: 9 },

    share('Sign up by channel', 'peniremit.signup-by-channel', 'value'),

    summaryCard('User Growth over time', 'peniremit.user-growth', 'value', 'User growth'),
  ],
}


export const TRANSACTION: BoardDefinition = {
  name: 'Transaction',
  description: 'Volume, success rate and where the money goes.',
  cards: [
    { card: 'Transaction volume', title: 'Transfer volume',
      datasetId: 'peniremit.transfer-volume', typeId: 'line-chart',
      mapping: { x: 'date', series: ['usd', 'ngn'] }, w: 12 },

    ...pair('Total transactions', 'peniremit.transaction-count-summary',
      'peniremit.transaction-count-trend', 'value', ['value']),

    summaryCard('Success rate', 'peniremit.transaction-rate-summary', 'successRate'),
    { card: 'Success rate', title: 'Success rate over time',
      datasetId: 'peniremit.transaction-rate', typeId: 'line-chart',
      mapping: { x: 'date', series: ['value'] }, w: 9 },

    /*
     * The guide's own route: the same count Dataset, narrowed to failures.
     * `status` is a declared Filter Parameter taking `success | failed | all`,
     * so this is a bound parameter rather than a different Dataset — and the
     * Viewer can move it, which is the point of binding one.
     *
     * An earlier version of this file used `transaction-rate-summary.failed`
     * instead, on the belief that `status` was undeclared. It is declared. The
     * belief came from inferring the parameter list from a Dataset's shape,
     * which is why the catalogue states them per Dataset now.
     */
    {
      ...summaryCard('Failed transactions', 'peniremit.transaction-count-summary', 'value'),
      parameters: { status: 'failed' },
    },
    { card: 'Failed transactions', title: 'Failed transactions over time',
      datasetId: 'peniremit.transaction-count-trend', typeId: 'line-chart',
      mapping: { x: 'date', series: ['value'] }, parameters: { status: 'failed' }, w: 9 },

    ...pair('Total deposit', 'peniremit.deposit-volume-summary',
      'peniremit.deposit-volume-trend', 'usd', ['usd', 'ngn']),

    summaryCard('Total Spend', 'peniremit.spend-volume-summary', 'usd', 'Total spend'),
    summaryCard('Avg Transaction value', 'peniremit.avg-transaction-value-summary', 'usd', 'Average transaction value'),

    { card: 'Transaction volume (Successful vs Failed)', title: 'Successful against failed',
      datasetId: 'peniremit.transaction-rate', typeId: 'line-chart',
      mapping: { x: 'date', series: ['successful', 'failed'] }, w: 12 },

    share('Spend by category', 'peniremit.spend-by-category', 'usd'),
    share('Top 5 token deposits', 'peniremit.top-token-deposits', 'usd'),
    share('Top 5 token spend', 'peniremit.top-token-spend', 'usd'),
    share('Smart spend token', 'peniremit.smart-spend-token', 'usd'),
    share('Top failure reasons', 'peniremit.failure-reasons', 'value', 12),
  ],
}

export const REVENUE: BoardDefinition = {
  name: 'Revenue',
  description: 'Fee revenue, margin, and where it comes from.',
  cards: [
    summaryCard('Gross fee revenue', 'peniremit.revenue-summary', 'grossFeeRevenueUsd'),
    { card: 'Gross fee revenue', title: 'Gross revenue over time',
      datasetId: 'peniremit.gross-revenue', typeId: 'line-chart',
      mapping: { x: 'date', series: ['usd'] }, w: 9 },

    { card: 'Net margin', title: 'Net margin',
      datasetId: 'peniremit.net-revenue', typeId: 'line-chart',
      mapping: { x: 'date', series: ['usd'] }, w: 6 },

    /*
     * Four cards off one trend: three single sources, then all three together.
     *
     * The combined chart is the better *comparison* and the three singles are
     * not redundant to it — someone owning FX revenue wants their number
     * without reading it off a shared axis, and "it is in the combined chart"
     * is not the same as having it. Kept as the guide has them.
     */
    { card: 'Palmpay processing fee', title: 'Palmpay processing fee',
      datasetId: 'peniremit.fee-revenue-trend', typeId: 'line-chart',
      mapping: { x: 'date', series: ['palmpayFeesUsd'] }, w: 4 },
    { card: 'FX Revenue (card)', title: 'FX revenue',
      datasetId: 'peniremit.fee-revenue-trend', typeId: 'line-chart',
      mapping: { x: 'date', series: ['fxFeesUsd'] }, w: 4 },
    { card: 'Cards (card)', title: 'Card fees',
      datasetId: 'peniremit.fee-revenue-trend', typeId: 'line-chart',
      mapping: { x: 'date', series: ['cardFeesUsd'] }, w: 4 },
    { card: 'Gross revenue (Palmpay vs FX vs Cards)', title: 'Fee revenue by source',
      datasetId: 'peniremit.fee-revenue-trend', typeId: 'line-chart',
      mapping: { x: 'date', series: ['palmpayFeesUsd', 'fxFeesUsd', 'cardFeesUsd'] }, w: 12 },

    share('Revenue by token', 'peniremit.revenue-by-token', 'usd'),
    share('Revenue by feature', 'peniremit.revenue-by-product', 'usd'),
    share('FX revenue by token', 'peniremit.fx-revenue-by-token', 'usd'),

    summaryCard("Today's PL", 'peniremit.revenue-summary', 'avgFeePerTransactionUsd', 'Average fee per transaction'),
    summaryCard("Today's PL", 'peniremit.revenue-summary', 'marginPerTransactionUsd', 'Margin per transaction'),
  ],
}

export const ENGAGEMENT: BoardDefinition = {
  name: 'Engagement',
  description: 'Who is active, how often, and whether they stay.',
  cards: [
    summaryCard('Daily active users', 'peniremit.active-users-summary', 'dau'),
    summaryCard('Monthly active users', 'peniremit.active-users-summary', 'mau'),

    { card: 'Daily active users', title: 'Daily active users over time',
      datasetId: 'peniremit.active-users', typeId: 'line-chart',
      mapping: { x: 'date', series: ['dau'] }, w: 6 },
    { card: 'Monthly active users', title: 'Monthly active users over time',
      datasetId: 'peniremit.active-users', typeId: 'line-chart',
      mapping: { x: 'date', series: ['mau'] }, w: 6 },
    /*
     * And both on one axis. The DAU/MAU ratio is the engagement measure —
     * `engagement-summary` publishes it as `dauMauRatio` — and it is the one
     * thing two separate charts cannot show.
     */
    { card: 'Daily active users (chart)', title: 'Daily against monthly',
      datasetId: 'peniremit.active-users', typeId: 'line-chart',
      mapping: { x: 'date', series: ['dau', 'mau'] }, w: 12 },

    ...pair('Average transaction value', 'peniremit.avg-transaction-value-summary',
      'peniremit.avg-transfer-size', 'usd', ['usd']),
    ...pair('Transactions per active user per day', 'peniremit.tx-per-active-user-per-day-summary',
      'peniremit.tx-per-active-user-per-day', 'value', ['value']),
    ...pair('Active cards', 'peniremit.active-cards-summary',
      'peniremit.active-cards', 'value', ['value']),

    summaryCard('KYC outcomes', 'peniremit.kyc-outcomes-summary', 'completed', 'KYC approved'),
    { card: 'KYC outcomes', title: 'Approved against failed',
      datasetId: 'peniremit.kyc-outcomes', typeId: 'line-chart',
      mapping: { x: 'date', series: ['completed', 'failed'] }, w: 9 },

    summaryCard('Retention', 'peniremit.engagement-summary', 'retention7d', '7-day retention'),
    summaryCard('Retention', 'peniremit.engagement-summary', 'retention30d', '30-day retention'),

    share('Token preference', 'peniremit.top-token-spend', 'usd'),
  ],
}

export const PENIREMIT_BOARDS: BoardDefinition[] = [GROWTH, TRANSACTION, REVENUE, ENGAGEMENT]

/** Every Dataset a board binds, so a missing one is caught as a set. */
export const datasetsUsedBy = (board: BoardDefinition): string[] =>
  [...new Set(board.cards.map((card) => card.datasetId))]

/**
 * Fails loudly rather than returning undefined — a typo here is a broken board.
 *
 * A declaration rather than a `const`, because `share` calls it while the board
 * constants above are still being evaluated. As an arrow it was in its own
 * temporal dead zone and every board threw on import.
 */
export function requirePeniremitDataset(id: string) {
  const found = peniremitDataset(id)
  if (!found) throw new Error(`No Peniremit Dataset declared with id ${id}`)
  return found
}
