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
import { resolveFailure, resolveRenderState, type WidgetRenderState } from '../../retrieval/render-state'
import type { Dataset } from '../../domain/dataset'
import { FixtureCatalogue, FixtureRetrieval, LOCAL_VIEWER, type Scenario } from './adapters'
import { queryFor } from './query'
import type { WidgetSpec } from '../widgets/Widget'
import type { Row } from './types'

interface AnalyticsDataValue {
  catalogue: CataloguePort
  retrieval: DatasetRetrievalPort
  viewer: ViewerIdentity
}

const AnalyticsDataContext = createContext<AnalyticsDataValue | null>(null)

export interface AnalyticsDataProviderProps {
  children: ReactNode
  /** Supplied by a host with real adapters. Omit to run on the fixtures. */
  catalogue?: CataloguePort
  retrieval?: DatasetRetrievalPort
  viewer?: ViewerIdentity
  /** Fixture-only: force an outcome per Dataset, so every state is reachable. */
  scenarios?: Record<string, Scenario>
  /** Fixture-only latency, so the loading state is designed rather than glimpsed. */
  latencyMs?: number
}

export function AnalyticsDataProvider({
  children,
  catalogue,
  retrieval,
  viewer = LOCAL_VIEWER,
  scenarios,
  latencyMs = 0,
}: AnalyticsDataProviderProps) {
  const value = useMemo<AnalyticsDataValue>(
    () => ({
      viewer,
      catalogue: catalogue ?? new FixtureCatalogue({ scenarios, latencyMs }),
      retrieval: retrieval ?? new FixtureRetrieval({ scenarios, latencyMs }),
    }),
    [catalogue, retrieval, viewer, scenarios, latencyMs],
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
export function useWidgetRows(spec: WidgetSpec, dataset: Dataset | null): WidgetRenderState {
  const { retrieval, viewer } = useAnalyticsData()
  const [state, setState] = useState<WidgetRenderState>({ status: 'loading' })

  // The query is derived, so it must not be a new object every render or the
  // effect below re-runs forever.
  const query = useMemo(
    () => (dataset ? queryFor(spec, dataset) : null),
    [spec, dataset],
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
export function useDatasets(): { datasets: Dataset[]; loading: boolean } {
  const { catalogue, viewer } = useAnalyticsData()
  const [described, setDescribed] = useState<Dataset[]>([])
  const [loading, setLoading] = useState(true)

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
        setLoading(false)
      })
      .catch(() => live && (setDescribed([]), setLoading(false)))

    return () => {
      live = false
    }
  }, [catalogue, viewer])

  return { datasets: described, loading }
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
