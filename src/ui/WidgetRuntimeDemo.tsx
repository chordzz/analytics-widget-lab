/**
 * Phase 2 acceptance: all six render states demonstrable, per Widget.
 *
 * Each Widget has its own scenario selector. Setting one to Denied while the
 * others keep working is FR-DA-10 demonstrated rather than asserted — and the
 * point of doing it per Widget rather than globally is that per-Widget
 * independence is exactly the property under test.
 */

import { useMemo, useState } from 'react'
import { WidgetHost } from '../widget-runtime/WidgetHost'
import { FakeDatasetRetrieval, RETRIEVAL_SCENARIOS } from '../retrieval/fake-retrieval'
import type { RetrievalScenario } from '../retrieval/fake-retrieval'
import { catalogueFixtures } from '../catalogue/fixtures'
import { getVisualizationType } from '../visualization/visualization-types'
import type { ViewerIdentity } from '../retrieval/port'
import type { Widget } from '../domain/widget'

const viewer: ViewerIdentity = { id: 'viewer-1', displayName: 'Operations lead' }

/**
 * A cross-product Dashboard, as UC-03 describes: settlements from Peniremit
 * beside payroll from an unrelated Source System. Nothing objects to the two
 * Widgets belonging to different Source Systems — that is the aggregation the
 * capability exists to enable (FR-CO-03).
 */
const widgets: Widget[] = [
  {
    id: 'settlements-trend',
    datasetId: 'peniremit-settlements',
    visualizationTypeId: 'area-chart',
    title: 'Settlement value over time',
    description: 'Trend · area chart',
    mapping: {
      timeDimension: 'settled_at',
      measures: [{ field: 'settlement_value', aggregation: 'sum' }],
    },
    exposedFilters: ['corridor'],
  },
  {
    id: 'settlements-by-corridor',
    datasetId: 'peniremit-settlements',
    visualizationTypeId: 'bar-chart-horizontal',
    title: 'Settlement value by corridor',
    description: 'Categorical Comparison · horizontal bar',
    mapping: {
      dimensions: ['corridor'],
      measures: [{ field: 'settlement_value', aggregation: 'sum' }],
    },
  },
  {
    id: 'payroll-total',
    datasetId: 'payroll-disbursements',
    visualizationTypeId: 'sparkline-card',
    title: 'Monthly payroll',
    description: 'Single Value · sparkline card',
    mapping: {
      timeDimension: 'disbursed_on',
      measures: [{ field: 'gross_amount', aggregation: 'sum' }],
    },
  },
  {
    id: 'payroll-headcount-goal',
    datasetId: 'payroll-disbursements',
    visualizationTypeId: 'progress-tracker',
    title: 'Headcount against plan',
    description: 'Single Value · progress tracker',
    mapping: {
      timeDimension: 'disbursed_on',
      measures: [{ field: 'headcount', aggregation: 'sum' }],
    },
    presentation: { target: 120 },
  },
  {
    id: 'active-users-by-product',
    datasetId: 'iam-active-users',
    visualizationTypeId: 'grouped-bar-chart',
    title: 'Active users by product',
    description: 'Categorical Comparison · grouped bar',
    mapping: {
      dimensions: ['product'],
      measures: [{ field: 'active_users', aggregation: 'average' }],
    },
    exposedFilters: ['product'],
  },
  {
    id: 'journal-entries',
    datasetId: 'accounting-journal',
    visualizationTypeId: 'data-table',
    title: 'Journal entries',
    description: 'Tabular · data table',
    mapping: { columns: ['posted_at', 'entry_reference', 'posting_state'] },
    exposedFilters: ['posting_state'],
  },
  {
    id: 'corridor-treemap',
    datasetId: 'peniremit-corridor-coverage',
    visualizationTypeId: 'treemap',
    title: 'Corridor coverage',
    description: 'Composition · treemap — classified, no renderer yet',
    mapping: {
      dimensions: ['destination_country'],
      measures: [{ field: 'active_corridors', aggregation: 'sum' }],
    },
  },
]

const SCENARIO_LABEL: Record<RetrievalScenario, string> = {
  normal: 'Ready',
  loading: 'Loading',
  empty: 'Empty',
  denied: 'Denied',
  withdrawn: 'Withdrawn',
  failed: 'Failed',
}

export function WidgetRuntimeDemo() {
  const [scenarios, setScenarios] = useState<Record<string, RetrievalScenario>>({})
  const [log, setLog] = useState<string[]>([])

  // Scenarios are keyed by Dataset because that is where authorization and
  // withdrawal actually live — two Widgets on the same Dataset are denied
  // together, which is itself the correct behaviour to see.
  const retrieval = useMemo(() => new FakeDatasetRetrieval({ scenarios }), [scenarios])

  const setScenario = (datasetId: string, scenario: RetrievalScenario) =>
    setScenarios((current) => ({ ...current, [datasetId]: scenario }))

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-[var(--analytics-border)] bg-[var(--analytics-surface)] p-4">
        <h2 className="text-sm font-medium text-[var(--analytics-text)] m-0">Retrieval scenarios</h2>
        <p className="text-xs text-[var(--analytics-text-secondary)] m-0 mt-1">
          Set any Dataset to a scenario and watch only its Widgets change. Denying one Dataset must
          leave every other Widget on the Dashboard working — that is FR-DA-10, and it is the
          property this board exists to show.
        </p>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {catalogueFixtures.map((dataset) => (
            <label key={dataset.id} className="text-xs text-[var(--analytics-text-secondary)]">
              <span className="block mb-1">{dataset.name}</span>
              <select
                className="w-full rounded border border-[var(--analytics-border)] bg-[var(--analytics-surface)] text-[var(--analytics-text)] px-2 py-1 text-xs"
                value={scenarios[dataset.id] ?? 'normal'}
                onChange={(event) =>
                  setScenario(dataset.id, event.target.value as RetrievalScenario)
                }
              >
                {RETRIEVAL_SCENARIOS.map((scenario) => (
                  <option key={scenario} value={scenario}>
                    {SCENARIO_LABEL[scenario]}
                  </option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 auto-rows-[minmax(220px,auto)]">
        {widgets.map((widget) => {
          const dataset = catalogueFixtures.find((d) => d.id === widget.datasetId)!
          const type = getVisualizationType(widget.visualizationTypeId)

          return (
            <div key={widget.id} className="flex flex-col gap-1">
              <WidgetHost
                widget={widget}
                dataset={dataset}
                retrieval={retrieval}
                viewer={viewer}
                onError={(error) =>
                  setLog((entries) => [`${widget.id}: ${error.message}`, ...entries].slice(0, 5))
                }
              />
              <p className="text-xs text-[var(--analytics-text-muted)] m-0 px-1">
                {type?.name} · {dataset.sourceSystem}
              </p>
            </div>
          )
        })}
      </div>

      {log.length > 0 && (
        <section className="rounded-lg border border-[var(--analytics-border)] p-3">
          <h2 className="text-xs font-medium text-[var(--analytics-text-secondary)] m-0 mb-1">
            Contained render failures
          </h2>
          <ul className="text-xs text-[var(--analytics-text-muted)] m-0 pl-4">
            {log.map((entry, index) => (
              <li key={index}>{entry}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
