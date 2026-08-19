/**
 * Submissions awaiting a governance ruling.
 *
 * The first is UC-07 verbatim: a second product team, unaware that "active
 * users" is already defined in the Catalogue by another team, publishes their
 * own Dataset with an overlapping name and a *different underlying definition*.
 * Note what makes it dangerous — it is perfectly well-formed. It satisfies the
 * publication contract completely. Nothing mechanical rejects it; only an
 * Administrator noticing the overlap stops two incompatible "active users"
 * figures circulating across dashboards.
 */

import type { Dataset } from '../domain/dataset'

/**
 * Peniremit's own count of active users. The incumbent IAM Dataset counts
 * distinct authenticated identities; this counts anyone who *transacted*. Both
 * are defensible. Both would be called "active users" on a dashboard. That is
 * precisely the failure §2.1 describes.
 */
export const peniremitActiveUsers: Dataset = {
  id: 'peniremit-active-users',
  name: 'Active users',
  description: 'Customers who completed at least one settlement in the period.',
  sourceSystem: 'Peniremit',
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
    { key: 'corridor', label: 'Corridor', role: 'dimension', filterable: true, sortable: true },
    {
      key: 'active_users',
      label: 'Active users',
      role: 'measure',
      aggregations: ['sum', 'average', 'maximum'],
      filterable: false,
      sortable: true,
    },
  ],
}

/**
 * A submission that fails the publication contract outright — no classification,
 * a Measure declaring no meaningful aggregations, and Fields that never say
 * whether they may be filtered or sorted. Included so the review surface has to
 * distinguish "this needs a human judgement" from "this is simply incomplete";
 * FR-GV-04 makes the second non-negotiable.
 */
export const malformedSubmission = {
  id: 'ledger-exports',
  name: 'Ledger exports',
  description: 'Raw ledger export feed.',
  sourceSystem: 'Accounting',
  fields: [
    { key: 'exported_at', label: 'Exported at', role: 'time-dimension' },
    { key: 'amount', label: 'Amount', role: 'measure' },
  ],
} as unknown as Dataset

export const pendingSubmissions = [
  { dataset: peniremitActiveUsers, submittedBy: 'Peniremit engineering' },
  { dataset: malformedSubmission, submittedBy: 'Accounting engineering' },
]
