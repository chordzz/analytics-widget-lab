/**
 * The composition root — the only place a fake is constructed.
 *
 * Everything else takes its dependencies from this context, so swapping a fake
 * for a real adapter is a change to this file alone. That is the whole point of
 * building the frontend ahead of the backend: the seam has to be real, not
 * aspirational, or the ports quietly grow assumptions about the fakes.
 */

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { FakeCatalogue } from './catalogue/fake-catalogue'
import { FakeDatasetRetrieval } from './retrieval/fake-retrieval'
import type { RetrievalScenario } from './retrieval/fake-retrieval'
import { LocalDashboardStore } from './dashboard/store'
import { FakeAuthorization } from './access/fake-authorization'
import { InMemoryAccessRecorder } from './access/fake-access-recorder'
import { FakeGovernance } from './governance/fake-governance'
import { pendingSubmissions } from './governance/pending-fixtures'
import type { CataloguePort } from './catalogue/port'
import type { DatasetRetrievalPort, ViewerIdentity } from './retrieval/port'
import type { DashboardStorePort } from './dashboard/store'
import type { AuthorizationPort, OrgScopeRef } from './access/port'

export interface Ports {
  catalogue: CataloguePort
  retrieval: DatasetRetrievalPort
  dashboards: DashboardStorePort
  authorization: AuthorizationPort
  accessRecorder: InMemoryAccessRecorder
  governance: FakeGovernance
}

interface PortsContextValue {
  ports: Ports
  viewer: ViewerIdentity
  viewers: ViewerIdentity[]
  setViewerId: (id: string) => void
  scenarios: Record<string, RetrievalScenario>
  setScenario: (datasetId: string, scenario: RetrievalScenario) => void
  /** FR-DA-13 — Dashboards this Viewer has marked for quick access. */
  pinned: string[]
  togglePin: (dashboardId: string) => void
}

const PortsContext = createContext<PortsContextValue | null>(null)

/**
 * Two Viewers with different Dataset authorization, so FR-DP-12 (the Catalogue
 * shows only what you may consume) and FR-DA-10 (a Widget you may not see is
 * denied while its neighbours carry on) are demonstrable by switching identity
 * rather than by argument.
 */
export const DEMO_VIEWERS: ViewerIdentity[] = [
  { id: 'ops-lead', displayName: 'Operations lead', organizationalScopeIds: ['operations'] },
  { id: 'ops-analyst', displayName: 'Operations analyst', organizationalScopeIds: ['operations'] },
  { id: 'finance-analyst', displayName: 'Finance analyst', organizationalScopeIds: ['finance'] },
  {
    id: 'analytics-admin',
    displayName: 'Analytics administrator',
    organizationalScopeIds: ['operations'],
  },
]

export const DEMO_SCOPES: OrgScopeRef[] = [
  { scopeId: 'operations', label: 'Operations' },
  { scopeId: 'finance', label: 'Finance' },
]

/** The finance analyst sits outside Peniremit's organizational scope. */
const CONSUMABLE_DATASETS: Record<string, string[]> = {
  'finance-analyst': ['payroll-disbursements', 'iam-active-users', 'accounting-journal'],
}

export function PortsProvider({ children }: { children: ReactNode }) {
  const [viewerId, setViewerId] = useState(DEMO_VIEWERS[0].id)
  const [scenarios, setScenarios] = useState<Record<string, RetrievalScenario>>({})
  // Pinning is per Viewer, so switching identity switches the pins with it.
  const [pinsByViewer, setPinsByViewer] = useState<Record<string, string[]>>({})

  const viewer = DEMO_VIEWERS.find((v) => v.id === viewerId) ?? DEMO_VIEWERS[0]

  // One authorization boundary, shared by the Catalogue, retrieval and the
  // Dashboard store — so the three cannot drift into disagreeing about who may
  // see what. Held across renders because the access log lives beside it.
  const [authorization] = useState(
    () =>
      new FakeAuthorization({
        identities: DEMO_VIEWERS,
        scopes: DEMO_SCOPES,
        consumableDatasets: CONSUMABLE_DATASETS,
        administrators: ['analytics-admin'],
      }),
  )
  const [accessRecorder] = useState(() => new InMemoryAccessRecorder())
  const [governance] = useState(() => new FakeGovernance({ submissions: pendingSubmissions }))

  const ports = useMemo<Ports>(
    () => ({
      authorization,
      accessRecorder,
      governance,
      catalogue: new FakeCatalogue({ authorization }),
      retrieval: new FakeDatasetRetrieval({ scenarios, authorization, accessRecorder }),
      dashboards: new LocalDashboardStore(authorization),
    }),
    [scenarios, authorization, accessRecorder, governance],
  )

  const value = useMemo<PortsContextValue>(
    () => ({
      ports,
      viewer,
      viewers: DEMO_VIEWERS,
      setViewerId,
      scenarios,
      setScenario: (datasetId, scenario) =>
        setScenarios((current) => ({ ...current, [datasetId]: scenario })),
      pinned: pinsByViewer[viewer.id] ?? [],
      togglePin: (dashboardId) =>
        setPinsByViewer((current) => {
          const mine = current[viewer.id] ?? []
          return {
            ...current,
            [viewer.id]: mine.includes(dashboardId)
              ? mine.filter((id) => id !== dashboardId)
              : [...mine, dashboardId],
          }
        }),
    }),
    [ports, viewer, scenarios, pinsByViewer],
  )

  return <PortsContext.Provider value={value}>{children}</PortsContext.Provider>
}

export function usePorts(): PortsContextValue {
  const value = useContext(PortsContext)
  if (!value) throw new Error('usePorts must be used inside a PortsProvider.')
  return value
}
