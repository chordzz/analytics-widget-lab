/**
 * Records behind the fixture Datasets.
 *
 * Kept apart from `fixtures.ts` on purpose: a Dataset's *description* is
 * browsable without retrieving its data (FR-DP-11), so the two are separate
 * concerns in code as well as in the requirements.
 *
 * Values are derived arithmetically rather than randomly so that repeated
 * identical retrievals produce identical results (FR-DP-10).
 */

import type { DatasetRow } from '../domain/query'

/** Deterministic spread in [0, 1) from a pair of indices. */
function jitter(a: number, b: number): number {
  const n = Math.sin((a + 1) * 12.9898 + (b + 1) * 78.233) * 43758.5453
  return n - Math.floor(n)
}

const MONTHS = [
  '2025-08', '2025-09', '2025-10', '2025-11', '2025-12', '2026-01',
  '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07',
]

const CORRIDORS = ['NG → GB', 'NG → US', 'GH → GB']
const COST_CENTRES = ['Engineering', 'Operations', 'Commercial']
const PRODUCTS = ['Peniremit', 'Peniwallet', 'Accounting']

const settlementRows: DatasetRow[] = MONTHS.flatMap((month, m) =>
  CORRIDORS.map((corridor, c) => ({
    settled_at: month,
    corridor,
    settlement_value: Math.round(
      (18_000 + c * 9_000) * (1 + m * 0.06) * (0.85 + jitter(m, c) * 0.3),
    ),
  })),
)

const payrollRows: DatasetRow[] = MONTHS.flatMap((month, m) =>
  COST_CENTRES.map((centre, c) => {
    const headcount = 24 + c * 11 + Math.floor(m / 4)
    return {
      disbursed_on: month,
      cost_centre: centre,
      headcount,
      gross_amount: Math.round(headcount * (5_200 + c * 400) * (0.96 + jitter(m, c) * 0.08)),
    }
  }),
)

const activeUserRows: DatasetRow[] = MONTHS.flatMap((month, m) =>
  PRODUCTS.map((product, p) => ({
    observed_on: month,
    product,
    active_users: Math.round((1_400 + p * 2_600) * (1 + m * 0.045) * (0.9 + jitter(m, p) * 0.2)),
  })),
)

const corridorCoverageRows: DatasetRow[] = [
  { destination_country: 'United Kingdom', corridor: 'NG → GB', active_corridors: 6 },
  { destination_country: 'United States', corridor: 'NG → US', active_corridors: 4 },
  { destination_country: 'Ghana', corridor: 'NG → GH', active_corridors: 3 },
  { destination_country: 'Kenya', corridor: 'NG → KE', active_corridors: 2 },
  { destination_country: 'Canada', corridor: 'NG → CA', active_corridors: 1 },
]

const POSTING_STATES = ['Posted', 'Pending review', 'Reversed']

const journalRows: DatasetRow[] = Array.from({ length: 18 }, (_, i) => {
  const day = String((i % 28) + 1).padStart(2, '0')
  return {
    posted_at: `2026-07-${day}`,
    entry_reference: `JE-${String(4_200 + i * 7).padStart(5, '0')}`,
    posting_state: POSTING_STATES[Math.floor(jitter(i, 3) * POSTING_STATES.length)],
  }
}).sort((a, b) => String(b.posted_at).localeCompare(String(a.posted_at)))

export const fixtureRows: Record<string, DatasetRow[]> = {
  'peniremit-settlements': settlementRows,
  'payroll-disbursements': payrollRows,
  'iam-active-users': activeUserRows,
  'peniremit-corridor-coverage': corridorCoverageRows,
  'accounting-journal': journalRows,
}
