/**
 * The module's data boundary, as React sees it.
 *
 * One provider holding the ports and the Viewer, and one hook per question a
 * screen asks. Everything above this file deals in specs and render states;
 * nothing above it knows whether records came from a fixture, a cache or a
 * Source System — which is the property that makes Stage 5's final step (swap
 * the fake for HTTP) a change to `composition-root` alone.
 *
 * `useWidgetRows` is the important one. It is the module's answer to the
 * workbench's `WidgetHost`: per-widget retrieval, per-widget state, and
 * cancellation, so one slow or failing widget cannot take the board with it
 * (FR-DA-10 — the neighbours keep working).
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { CataloguePort, DatasetSummary } from '../../catalogue/port'
import type { DatasetRetrievalPort, ViewerIdentity } from '../../retrieval/port'
import type { AuthorizationPort } from '../../access/port'
import { resolveFailure, resolveRenderState, type WidgetRenderState } from '../../retrieval/render-state'
import { allowedValuesFor, type Dataset } from '../../domain/dataset'
import { InMemoryAccessRecorder } from '../../access/fake-access-recorder'
import type { AccessRecorderPort } from '../../access/port'
import {
  FixtureCatalogue,
  FixtureRetrieval,
  LOCAL_VIEWER,
  LocalAuthorization,
  type Scenario,
} from './adapters'
import { queryFor, type ViewerChoices } from './query'
import type { QueryContribution } from '../../composition/correspondence'
import type { WidgetSpec } from '../widgets/Widget'
import type { Row } from './types'
import { decide, type Permission } from '../../auth/permissions'
import { isApiError } from '../../api/errors'

interface AnalyticsDataValue {
  catalogue: CataloguePort
  retrieval: DatasetRetrievalPort
  /** FR-DA-02 — FR-DA-08. Who may see which board, and who a Grant names. */
  authorization: AuthorizationPort
  viewer: ViewerIdentity
  /**
   * What the caller may do, from `/v1/me`.
   *
   * Carried beside the viewer rather than on it: `ViewerIdentity` belongs to the
   * retrieval port and is about *who is asking*, while this is about what the UI
   * should offer. Absent means unknown — see `auth/permissions.ts`, where the
   * whole point is that unknown is not denied.
   */
  permissions?: Record<string, boolean>
  /** FR-DA-14 — the access record, for a surface that shows it. */
  recorder: AccessRecorderPort
  /**
   * Whether that record accounts for every retrieval, or only the ones this
   * module made.
   *
   * The recorder is fed by the *retrieval adapter*, and only the fixture one
   * feeds it. When a host supplies its own, retrievals go straight past and the
   * log stays empty — which is not the same claim as "nobody read anything",
   * and a panel that cannot tell them apart makes the second one silently.
   *
   * Derived rather than declared on the port: the provider is what knows which
   * adapter is in play, and asking the recorder to know would be asking it
   * about something it cannot see.
   */
  accessRecordIsComplete: boolean
}

const AnalyticsDataContext = createContext<AnalyticsDataValue | null>(null)

export interface AnalyticsDataProviderProps {
  children: ReactNode
  /** Supplied by a host with real adapters. Omit to run on the fixtures. */
  catalogue?: CataloguePort
  retrieval?: DatasetRetrievalPort
  authorization?: AuthorizationPort
  viewer?: ViewerIdentity
  /** Omit to offer everything — which is what an unknown permission set means. */
  permissions?: Record<string, boolean>
  /** Fixture-only: force an outcome per Dataset, so every state is reachable. */
  scenarios?: Record<string, Scenario>
  /** Fixture-only latency, so the loading state is designed rather than glimpsed. */
  latencyMs?: number
  /** FR-DA-14 — where retrievals of personal-data Datasets are recorded. */
  accessRecorder?: AccessRecorderPort
}

export function AnalyticsDataProvider({
  children,
  catalogue,
  retrieval,
  authorization,
  viewer = LOCAL_VIEWER,
  permissions,
  scenarios,
  latencyMs = 0,
  accessRecorder,
}: AnalyticsDataProviderProps) {
  /*
   * Held across renders rather than rebuilt with the rest.
   *
   * An access record that is replaced when the provider re-renders is not a
   * record — FR-DA-14's whole value is that the entries outlive the session
   * that made them, and an append-only log behind a `useMemo` would silently
   * reset whenever `scenarios` changed.
   */
  const [recorder] = useState<AccessRecorderPort>(
    () => accessRecorder ?? new InMemoryAccessRecorder(),
  )

  const value = useMemo<AnalyticsDataValue>(
    () => ({
      viewer,
      permissions,
      recorder,
      accessRecordIsComplete: retrieval === undefined,
      catalogue: catalogue ?? new FixtureCatalogue({ scenarios, latencyMs }),
      retrieval: retrieval ?? new FixtureRetrieval({ scenarios, latencyMs }, recorder),
      authorization: authorization ?? new LocalAuthorization(),
    }),
    [catalogue, retrieval, authorization, viewer, permissions, scenarios, latencyMs, recorder],
  )

  return <AnalyticsDataContext.Provider value={value}>{children}</AnalyticsDataContext.Provider>
}

export function useAnalyticsData(): AnalyticsDataValue {
  const value = useContext(AnalyticsDataContext)
  if (!value) throw new Error('useAnalyticsData must be used inside <AnalyticsDataProvider>')
  return value
}

/** The Catalogue's listing. Descriptions only — this cannot pull records. */
export function useCatalogue(): { summaries: DatasetSummary[]; loading: boolean } {
  const { catalogue, viewer } = useAnalyticsData()
  const [summaries, setSummaries] = useState<DatasetSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let live = true
    setLoading(true)
    catalogue
      .browse(viewer)
      .then((result) => live && (setSummaries(result), setLoading(false)))
      .catch(() => live && (setSummaries([]), setLoading(false)))
    return () => {
      live = false
    }
  }, [catalogue, viewer])

  return { summaries, loading }
}

/** One Dataset's full Field description. Still no records. */
export function useDataset(datasetId: string | undefined): {
  dataset: Dataset | null
  loading: boolean
} {
  const { catalogue, viewer } = useAnalyticsData()
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [loading, setLoading] = useState(datasetId !== undefined)

  useEffect(() => {
    if (datasetId === undefined) {
      setDataset(null)
      setLoading(false)
      return
    }

    let live = true
    setLoading(true)
    catalogue
      .describe(datasetId, viewer)
      .then((result) => live && (setDataset(result), setLoading(false)))
      .catch(() => live && (setDataset(null), setLoading(false)))
    return () => {
      live = false
    }
  }, [catalogue, viewer, datasetId])

  return { dataset, loading }
}

/**
 * One widget's rows, and the state to draw while it does not have them.
 *
 * The cancellation flag is not a nicety. Without it, a widget re-bound to a
 * second Dataset while the first retrieval is still in flight will paint the
 * first one's rows when it lands — silently, and under the new widget's title.
 */
export function useWidgetRows(
  spec: WidgetSpec,
  dataset: Dataset | null,
  choices?: ViewerChoices,
  contribution?: QueryContribution,
): WidgetRenderState {
  const { retrieval, viewer } = useAnalyticsData()
  const [state, setState] = useState<WidgetRenderState>({ status: 'loading' })

  // The query is derived, so it must not be a new object every render or the
  // effect below re-runs forever.
  // Serialised, because a fresh `choices` object every render would restart the
  // retrieval every render. The *values* are what changed, not the identity.
  const choiceKey = JSON.stringify([choices ?? null, contribution ?? null])

  const query = useMemo(
    () => (dataset ? queryFor(spec, dataset, choices, contribution) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec, dataset, choiceKey],
  )

  useEffect(() => {
    if (!dataset || !query) return

    let live = true
    setState({ status: 'loading' })

    retrieval
      .retrieve(dataset.id, query, viewer)
      .then((outcome) => live && setState(resolveRenderState(outcome)))
      .catch((error) => live && setState(resolveFailure(error)))

    return () => {
      live = false
    }
  }, [retrieval, viewer, dataset, query])

  return state
}

/**
 * Every Dataset the Viewer may consume, described.
 *
 * `browse` deliberately returns summaries without Fields — FR-DP-11 wants
 * discovery to cost nothing — but the Data sources screen exists precisely to
 * show what each Dataset contains, so it has to describe them. Done in one
 * `Promise.all` rather than a describe-per-card as the list renders: the
 * sequential version is an N+1 that a real Catalogue would feel.
 */
/**
 * Why the Catalogue has nothing to show.
 *
 * Three situations that a bare empty list cannot tell apart, and they call for
 * three different actions: ask for access, wait and retry, or publish a Dataset.
 * This is the same distinction the six render states protect for a Widget —
 * *denied* must not read as *empty*, and neither may read as *broken* — applied
 * to the screen someone opens first when they want to know whether the backend
 * is working at all.
 */
export interface CatalogueFailure {
  kind: 'denied' | 'unavailable' | 'failed'
  message: string
}

/** Exported for its own test: the mapping is the part worth pinning. */
export function catalogueFailure(error: unknown): CatalogueFailure {
  if (isApiError(error)) {
    if (error.kind === 'denied') {
      return { kind: 'denied', message: 'You do not have permission to browse data sources.' }
    }
    if (error.kind === 'unavailable' || error.kind === 'timeout' || error.kind === 'transport') {
      return { kind: 'unavailable', message: error.message }
    }
  }
  return {
    kind: 'failed',
    message: error instanceof Error ? error.message : 'The catalogue could not be loaded.',
  }
}

export function useDatasets(): {
  datasets: Dataset[]
  loading: boolean
  /** Null when the Catalogue answered — including when it answered with nothing. */
  failure: CatalogueFailure | null
} {
  const { catalogue, viewer } = useAnalyticsData()
  const [described, setDescribed] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState<CatalogueFailure | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true)

    catalogue
      .browse(viewer)
      .then((summaries) =>
        Promise.all(summaries.map((summary) => catalogue.describe(summary.id, viewer))),
      )
      .then((results) => {
        if (!live) return
        setDescribed(results.filter((entry): entry is Dataset => entry !== null))
        setFailure(null)
        setLoading(false)
      })
      .catch((error) => {
        /*
         * This used to be `setDescribed([])` and nothing else, which turned a
         * `403`, a `503` and an empty Catalogue into the same screen. The list
         * is still cleared — stale Datasets from a previous answer would be
         * worse than none — but the reason travels with it now.
         */
        if (!live) return
        setDescribed([])
        setFailure(catalogueFailure(error))
        setLoading(false)
      })

    return () => {
      live = false
    }
  }, [catalogue, viewer])

  return { datasets: described, loading, failure }
}

/**
 * Records from one Dataset, for a screen rather than a widget.
 *
 * The Data sources screen's sample table is still a retrieval, and goes through
 * the same port for the same reason a widget does: a Viewer who may not consume
 * a Dataset must not see its records because they opened a different screen.
 */
export function useRows(datasetId: string | undefined, limit = 20): Row[] {
  const { retrieval, viewer } = useAnalyticsData()
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    if (!datasetId) {
      setRows([])
      return
    }

    let live = true
    retrieval
      .retrieve(datasetId, { limit }, viewer)
      .then((outcome) => live && setRows(outcome.kind === 'rows' ? outcome.rows : []))
      .catch(() => live && setRows([]))

    return () => {
      live = false
    }
  }, [retrieval, viewer, datasetId, limit])

  return rows
}

/**
 * The values a Viewer may choose from for one exposed filter.
 *
 * **The declaration answers first.** A Filter Parameter may publish
 * `allowedValues`, and where it does those are authoritative: they are what the
 * Source System will accept, they arrive with the Catalogue, and they cost no
 * request. Asking the network for something we were already told is both slower
 * and less correct — a derived list can only ever report what the current query
 * happened to return.
 *
 * **The port answers for the rest.** Finding 8: the FRD lets an Author expose a
 * filter and never says how a Viewer discovers what they can pick, and a
 * parameter whose values are open-ended has no declared answer. That listing has
 * to be scoped to the Viewer's authorization or the dropdown itself discloses
 * values from data they could not otherwise obtain — FR-DA-12 forbids that as
 * firmly as returning the rows would.
 *
 * So Finding 8 is now narrower rather than closed: it covers the filters a
 * declaration cannot enumerate, and nothing else.
 */
export function useFilterValues(
  dataset: Dataset | undefined,
  field: string | undefined,
): (string | number)[] {
  const { retrieval, viewer } = useAnalyticsData()
  const [values, setValues] = useState<(string | number)[]>([])
  const datasetId = dataset?.id

  // The Dataset itself rather than its id: every caller already holds it — a
  // filter control cannot be drawn without knowing which Fields are filterable —
  // and looking it up again would mean a describe per control.
  const declared = dataset && field ? allowedValuesFor(dataset, field) : undefined

  useEffect(() => {
    // `undefined` and `[]` are different answers. A publisher who declared an
    // empty list has declared that nothing is selectable — a broken declaration,
    // but theirs to make — and asking the port to second-guess it would put
    // values in a control the Source System will refuse.
    if (!datasetId || !field || declared !== undefined) {
      setValues([])
      return
    }

    let live = true
    retrieval
      .listFilterValues(datasetId, field, viewer)
      .then((result) => live && setValues(result))
      .catch(() => live && setValues([]))

    return () => {
      live = false
    }
  }, [retrieval, viewer, datasetId, field, declared])

  return declared ?? values
}

/**
 * Whether to offer an action — FR-DA-13's spirit, from the caller's own
 * permissions.
 *
 * Returns `true` when the answer is unknown, which is the deliberate asymmetry:
 * an action wrongly offered costs a `403` the caller can read, and one wrongly
 * hidden costs them the product with nothing on screen to explain it. The API
 * enforces either way — this only decides what is worth showing.
 */
export function useMay(permission: Permission): boolean {
  const { permissions } = useAnalyticsData()
  return decide(permissions, permission) !== 'denied'
}

/** For copy that should appear only when the restriction is certain. */
export function useIsDenied(permission: Permission): boolean {
  const { permissions } = useAnalyticsData()
  return decide(permissions, permission) === 'denied'
}
