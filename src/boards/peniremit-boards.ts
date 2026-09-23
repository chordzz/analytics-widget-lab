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
  /** Columns on a 12-column board. */
  w: number
  h: number
}

export interface BoardDefinition {
  name: string
  description: string
  cards: BoardCard[]
}

/** A number and the line beneath it: one card, two Widgets. */
const pair = (
  card: string,
  summaryId: string,
  trendId: string,
  valueKey: string,
  trendKeys: string[],
): BoardCard[] => [
  { card, title: card, datasetId: summaryId, typeId: 'stat-card',
    mapping: { value: valueKey }, w: 3, h: 1 },
  { card, title: `${card} over time`, datasetId: trendId, typeId: 'line-chart',
    mapping: { x: 'date', series: trendKeys }, w: 9, h: 2 },
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
  h: 2,
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
    { card: 'New signups (Completed vs Drop-Offs)', title: 'Completed signups',
      datasetId: 'peniremit.signup-outcomes-summary', typeId: 'stat-card',
      mapping: { value: 'completed' }, w: 3, h: 1 },
    { card: 'New signups (Completed vs Drop-Offs)', title: 'Completed and dropped',
      datasetId: 'peniremit.signup-outcomes', typeId: 'line-chart',
      mapping: { x: 'date', series: ['value', 'dropOffs'] }, w: 9, h: 2 },

    share('Sign up by channel', 'peniremit.signup-by-channel', 'value'),

    { card: 'User Growth over time', title: 'User growth',
      datasetId: 'peniremit.user-growth', typeId: 'stat-card',
      mapping: { value: 'value' }, w: 3, h: 1 },
  ],
}


export const TRANSACTION: BoardDefinition = {
  name: 'Transaction',
  description: 'Volume, success rate and where the money goes.',
  cards: [
    { card: 'Transaction volume', title: 'Transfer volume',
      datasetId: 'peniremit.transfer-volume', typeId: 'line-chart',
      mapping: { x: 'date', series: ['usd', 'ngn'] }, w: 12, h: 2 },

    ...pair('Total transactions', 'peniremit.transaction-count-summary',
      'peniremit.transaction-count-trend', 'value', ['value']),

    { card: 'Success rate', title: 'Success rate',
      datasetId: 'peniremit.transaction-rate-summary', typeId: 'stat-card',
      mapping: { value: 'successRate' }, w: 3, h: 1 },
    { card: 'Success rate', title: 'Success rate over time',
      datasetId: 'peniremit.transaction-rate', typeId: 'line-chart',
      mapping: { x: 'date', series: ['value'] }, w: 9, h: 2 },

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
    { card: 'Failed transactions', title: 'Failed transactions',
      datasetId: 'peniremit.transaction-count-summary', typeId: 'stat-card',
      mapping: { value: 'value' }, parameters: { status: 'failed' }, w: 3, h: 1 },
    { card: 'Failed transactions', title: 'Failed transactions over time',
      datasetId: 'peniremit.transaction-count-trend', typeId: 'line-chart',
      mapping: { x: 'date', series: ['value'] }, parameters: { status: 'failed' }, w: 9, h: 2 },

    ...pair('Total deposit', 'peniremit.deposit-volume-summary',
      'peniremit.deposit-volume-trend', 'usd', ['usd', 'ngn']),

    { card: 'Total Spend', title: 'Total spend',
      datasetId: 'peniremit.spend-volume-summary', typeId: 'stat-card',
      mapping: { value: 'usd' }, w: 3, h: 1 },
    { card: 'Avg Transaction value', title: 'Average transaction value',
      datasetId: 'peniremit.avg-transaction-value-summary', typeId: 'stat-card',
      mapping: { value: 'usd' }, w: 3, h: 1 },

    { card: 'Transaction volume (Successful vs Failed)', title: 'Successful against failed',
      datasetId: 'peniremit.transaction-rate', typeId: 'line-chart',
      mapping: { x: 'date', series: ['successful', 'failed'] }, w: 12, h: 2 },

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
    { card: 'Gross fee revenue', title: 'Gross fee revenue',
      datasetId: 'peniremit.revenue-summary', typeId: 'stat-card',
      mapping: { value: 'grossFeeRevenueUsd' }, w: 3, h: 1 },
    { card: 'Gross fee revenue', title: 'Gross revenue over time',
      datasetId: 'peniremit.gross-revenue', typeId: 'line-chart',
      mapping: { x: 'date', series: ['usd'] }, w: 9, h: 2 },

    { card: 'Net margin', title: 'Net margin',
      datasetId: 'peniremit.net-revenue', typeId: 'line-chart',
      mapping: { x: 'date', series: ['usd'] }, w: 6, h: 2 },

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
      mapping: { x: 'date', series: ['palmpayFeesUsd'] }, w: 4, h: 2 },
    { card: 'FX Revenue (card)', title: 'FX revenue',
      datasetId: 'peniremit.fee-revenue-trend', typeId: 'line-chart',
      mapping: { x: 'date', series: ['fxFeesUsd'] }, w: 4, h: 2 },
    { card: 'Cards (card)', title: 'Card fees',
      datasetId: 'peniremit.fee-revenue-trend', typeId: 'line-chart',
      mapping: { x: 'date', series: ['cardFeesUsd'] }, w: 4, h: 2 },
    { card: 'Gross revenue (Palmpay vs FX vs Cards)', title: 'Fee revenue by source',
      datasetId: 'peniremit.fee-revenue-trend', typeId: 'line-chart',
      mapping: { x: 'date', series: ['palmpayFeesUsd', 'fxFeesUsd', 'cardFeesUsd'] }, w: 12, h: 2 },

    share('Revenue by token', 'peniremit.revenue-by-token', 'usd'),
    share('Revenue by feature', 'peniremit.revenue-by-product', 'usd'),
    share('FX revenue by token', 'peniremit.fx-revenue-by-token', 'usd'),

    { card: "Today's PL", title: 'Average fee per transaction',
      datasetId: 'peniremit.revenue-summary', typeId: 'stat-card',
      mapping: { value: 'avgFeePerTransactionUsd' }, w: 3, h: 1 },
    { card: "Today's PL", title: 'Margin per transaction',
      datasetId: 'peniremit.revenue-summary', typeId: 'stat-card',
      mapping: { value: 'marginPerTransactionUsd' }, w: 3, h: 1 },
  ],
}

export const ENGAGEMENT: BoardDefinition = {
  name: 'Engagement',
  description: 'Who is active, how often, and whether they stay.',
  cards: [
    { card: 'Daily active users', title: 'Daily active users',
      datasetId: 'peniremit.active-users-summary', typeId: 'stat-card',
      mapping: { value: 'dau' }, w: 3, h: 1 },
    { card: 'Monthly active users', title: 'Monthly active users',
      datasetId: 'peniremit.active-users-summary', typeId: 'stat-card',
      mapping: { value: 'mau' }, w: 3, h: 1 },

    { card: 'Daily active users', title: 'Daily active users over time',
      datasetId: 'peniremit.active-users', typeId: 'line-chart',
      mapping: { x: 'date', series: ['dau'] }, w: 6, h: 2 },
    { card: 'Monthly active users', title: 'Monthly active users over time',
      datasetId: 'peniremit.active-users', typeId: 'line-chart',
      mapping: { x: 'date', series: ['mau'] }, w: 6, h: 2 },
    /*
     * And both on one axis. The DAU/MAU ratio is the engagement measure —
     * `engagement-summary` publishes it as `dauMauRatio` — and it is the one
     * thing two separate charts cannot show.
     */
    { card: 'Daily active users (chart)', title: 'Daily against monthly',
      datasetId: 'peniremit.active-users', typeId: 'line-chart',
      mapping: { x: 'date', series: ['dau', 'mau'] }, w: 12, h: 2 },

    ...pair('Average transaction value', 'peniremit.avg-transaction-value-summary',
      'peniremit.avg-transfer-size', 'usd', ['usd']),
    ...pair('Transactions per active user per day', 'peniremit.tx-per-active-user-per-day-summary',
      'peniremit.tx-per-active-user-per-day', 'value', ['value']),
    ...pair('Active cards', 'peniremit.active-cards-summary',
      'peniremit.active-cards', 'value', ['value']),

    { card: 'KYC outcomes', title: 'KYC approved',
      datasetId: 'peniremit.kyc-outcomes-summary', typeId: 'stat-card',
      mapping: { value: 'completed' }, w: 3, h: 1 },
    { card: 'KYC outcomes', title: 'Approved against failed',
      datasetId: 'peniremit.kyc-outcomes', typeId: 'line-chart',
      mapping: { x: 'date', series: ['completed', 'failed'] }, w: 9, h: 2 },

    { card: 'Retention', title: '7-day retention',
      datasetId: 'peniremit.engagement-summary', typeId: 'stat-card',
      mapping: { value: 'retention7d' }, w: 3, h: 1 },
    { card: 'Retention', title: '30-day retention',
      datasetId: 'peniremit.engagement-summary', typeId: 'stat-card',
      mapping: { value: 'retention30d' }, w: 3, h: 1 },

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
