/**
 * Fixture Datasets standing in for the Catalogue until Source Systems publish
 * for real. Chosen to span distinct Data Shapes so the satisfaction predicate
 * is exercised across its whole range, and to reproduce the use cases verbatim
 * where they name specifics.
 *
 * Field naming avoids "Department" entirely — §8 records the term as ambiguous
 * between two different IAM constructs.
 */

import type { Dataset } from '../domain/dataset'

/**
 * UC-02, verbatim: "a Peniremit settlements Dataset with a Time Dimension and
 * a corridor Dimension ... a trend chart and a categorical comparison, not a
 * scatter plot, because the Dataset has no second Measure."
 *
 * Deliberately one Measure. If Correlation ever becomes eligible for this
 * Dataset, FR-VZ-05 is broken.
 */
export const peniremitSettlements: Dataset = {
  id: 'peniremit-settlements',
  name: 'Peniremit settlements',
  description: 'Settlement activity by corridor.',
  sourceSystem: 'Peniremit',
  classification: 'internal',
  exposesPersonalData: false,
  recordVolume: 'many',
  fields: [
    {
      key: 'settled_at',
      label: 'Settlement date',
      role: 'time-dimension',
      filterable: true,
      sortable: true,
    },
    {
      key: 'corridor',
      label: 'Corridor',
      role: 'dimension',
      filterable: true,
      sortable: true,
    },
    {
      key: 'settlement_value',
      label: 'Settlement value',
      role: 'measure',
      aggregations: ['sum', 'average', 'minimum', 'maximum'],
      filterable: false,
      sortable: true,
      semantic: 'additive-total',
    },
  ],
  rowGrain: { dimensions: ['settled_at', 'corridor'] },
  filterParameters: [
    { name: 'settled_at', label: 'Settled at', required: false },
    { name: 'corridor', label: 'Corridor', required: false },
  ],
}

/**
 * UC-03's partner Dataset — paired with settlements on one Dashboard, driven by
 * a shared date-range Control. Two Measures, so Correlation is eligible here
 * and not for settlements: a useful contrast in the same board.
 */
export const payrollDisbursements: Dataset = {
  id: 'payroll-disbursements',
  name: 'Payroll disbursements',
  description: 'Disbursement volume and headcount by cost centre.',
  sourceSystem: 'Payroll',
  classification: 'confidential',
  exposesPersonalData: true,
  recordVolume: 'many',
  fields: [
    {
      key: 'disbursed_on',
      label: 'Disbursement date',
      role: 'time-dimension',
      filterable: true,
      sortable: true,
    },
    {
      key: 'cost_centre',
      label: 'Cost centre',
      role: 'dimension',
      filterable: true,
      sortable: true,
    },
    {
      key: 'gross_amount',
      label: 'Gross amount',
      role: 'measure',
      aggregations: ['sum', 'average'],
      filterable: false,
      sortable: true,
      semantic: 'additive-total',
    },
    {
      key: 'headcount',
      label: 'Headcount',
      role: 'measure',
      aggregations: ['sum', 'average', 'maximum'],
      filterable: false,
      sortable: true,
    },
  ],
  rowGrain: { dimensions: ['disbursed_on', 'cost_centre'] },
  filterParameters: [
    { name: 'disbursed_on', label: 'Disbursed on', required: false },
    { name: 'cost_centre', label: 'Cost centre', required: false },
  ],
}

/**
 * The §2.1 "active users" story made concrete. Note what is absent: no
 * 'additive-total' semantic on the Measure, because summing distinct active
 * users across products double-counts anyone using two products. Structurally
 * it looks identical to a summable amount — which is exactly the argument for
 * Finding 1.
 */
export const iamActiveUsers: Dataset = {
  id: 'iam-active-users',
  name: 'Active users',
  description: 'Distinct authenticated users by product.',
  sourceSystem: 'IAM',
  classification: 'internal',
  exposesPersonalData: false,
  recordVolume: 'many',
  fields: [
    {
      key: 'observed_on',
      label: 'Observation date',
      role: 'time-dimension',
      filterable: true,
      sortable: true,
    },
    {
      key: 'product',
      label: 'Product',
      role: 'dimension',
      filterable: true,
      sortable: true,
    },
    {
      key: 'active_users',
      label: 'Active users',
      role: 'measure',
      aggregations: ['average', 'maximum', 'distinct-count'],
      filterable: false,
      sortable: true,
    },
  ],
  rowGrain: { dimensions: ['observed_on', 'product'] },
  filterParameters: [
    { name: 'observed_on', label: 'Observed on', required: false },
    { name: 'product', label: 'Product', required: false },
  ],
}

/**
 * No Time Dimension — so Trend, Temporal Pattern and Chronological must all be
 * definitively unsatisfied rather than indeterminate. Carries a geographic
 * Field, which is undecidable under the published model today.
 */
export const corridorCoverage: Dataset = {
  id: 'peniremit-corridor-coverage',
  name: 'Corridor coverage',
  description: 'Corridor availability by destination country. Point-in-time, no history.',
  sourceSystem: 'Peniremit',
  classification: 'public',
  exposesPersonalData: false,
  recordVolume: 'few',
  fields: [
    {
      key: 'destination_country',
      label: 'Destination country',
      role: 'dimension',
      filterable: true,
      sortable: true,
      semantic: 'geographic-area',
    },
    {
      key: 'corridor',
      label: 'Corridor',
      role: 'dimension',
      filterable: true,
      sortable: true,
    },
    {
      key: 'active_corridors',
      label: 'Active corridors',
      role: 'measure',
      aggregations: ['sum', 'count'],
      filterable: false,
      sortable: true,
      semantic: 'additive-total',
    },
  ],
  rowGrain: { dimensions: ['destination_country', 'corridor'] },
  filterParameters: [
    { name: 'destination_country', label: 'Destination country', required: false },
    { name: 'corridor', label: 'Corridor', required: false },
  ],
}

/**
 * A Dataset with no Measure at all — every Measure-requiring Family must be
 * definitively unsatisfied. Carries a state Dimension, which is the Status
 * Family's second route and undecidable today.
 */
export const accountingJournal: Dataset = {
  id: 'accounting-journal',
  name: 'Journal entries',
  description: 'Individual ledger entries and their posting state.',
  sourceSystem: 'Accounting',
  classification: 'confidential',
  exposesPersonalData: false,
  recordVolume: 'many',
  fields: [
    {
      key: 'posted_at',
      label: 'Posted at',
      role: 'time-dimension',
      filterable: true,
      sortable: true,
    },
    {
      key: 'entry_reference',
      label: 'Entry reference',
      role: 'dimension',
      filterable: true,
      sortable: true,
    },
    {
      key: 'posting_state',
      label: 'Posting state',
      role: 'dimension',
      filterable: true,
      sortable: false,
      semantic: 'state',
    },
  ],
  rowGrain: { dimensions: ['posted_at', 'entry_reference', 'posting_state'] },
  filterParameters: [
    { name: 'posted_at', label: 'Posted at', required: false },
    { name: 'entry_reference', label: 'Entry reference', required: false },
    { name: 'posting_state', label: 'Posting state', required: false },
  ],
}

export const catalogueFixtures: Dataset[] = [
  peniremitSettlements,
  payrollDisbursements,
  iamActiveUsers,
  corridorCoverage,
  accountingJournal,
]
