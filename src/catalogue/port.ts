/**
 * The Catalogue — "the complete set of published Datasets available for Widget
 * construction."
 *
 * There is no method here that returns records, and that is the design. FR-DP-11
 * requires an Author to discover which Datasets exist and what each contains
 * *without retrieving the data itself*. Keeping retrieval on a separate port
 * makes that structural: browsing cannot accidentally pull data, because this
 * interface offers no way to.
 *
 * FR-DP-12 is the other half — browsing presents only Datasets the caller is
 * authorized to consume, so the Catalogue never advertises what it would then
 * refuse to serve.
 */

import type { Dataset } from '../domain/dataset'
import type { ViewerIdentity } from '../retrieval/port'

/**
 * What the Catalogue shows before an Author commits to a Dataset: enough to
 * judge relevance, nothing that costs a retrieval.
 */
export interface DatasetSummary {
  id: string
  name: string
  description: string
  sourceSystem: string
  classification: Dataset['classification']
  exposesPersonalData: boolean
  dimensionCount: number
  timeDimensionCount: number
  measureCount: number
}

export interface CataloguePort {
  /** FR-DP-11, FR-DP-12 — descriptions only, authorized only. */
  browse(viewer: ViewerIdentity): Promise<DatasetSummary[]>

  /**
   * The full Field description for one Dataset — still no records.
   * Resolves to null when the Dataset does not exist or the Viewer may not
   * consume it; the two are deliberately indistinguishable here, so the
   * Catalogue cannot be used to probe for Datasets a Viewer cannot see.
   */
  describe(datasetId: string, viewer: ViewerIdentity): Promise<Dataset | null>

  /**
   * The complete Visualization taxonomy — every Family and the Types in it.
   *
   * Independent of any Dataset: this is the whole universe, where
   * `/presentation` returns the subset one Dataset satisfies. It belongs on this
   * port because the API files it under Catalogue and because it answers the
   * same kind of question — what exists, before anything is retrieved.
   *
   * It is here at all because a local copy is how two taxonomies drifted apart
   * once already: ours said `line-chart` where theirs said `line`, and nothing
   * noticed until a save was refused. A list we fetch cannot go stale without
   * the fetch saying so.
   */
  visualizations(): Promise<TaxonomyEntry[]>
}

/** One Family of the taxonomy, as `GET /v1/visualizations` returns it. */
export interface TaxonomyEntry {
  family: string
  /** The concrete Visualization Type ids in this Family. */
  types: string[]
  /** The Data Shape requirement, in words. */
  requirement?: string
  /**
   * Whether this Family's widgets render one aggregated figure.
   *
   * When true the Widget wants an aggregate-shaped Dataset — the Source System
   * returns the figure over the filters it received, and neither Analytics nor
   * we compute it.
   */
  singleValue?: boolean
}

export function summarize(dataset: Dataset): DatasetSummary {
  return {
    id: dataset.id,
    name: dataset.name,
    description: dataset.description,
    sourceSystem: dataset.sourceSystem,
    classification: dataset.classification,
    exposesPersonalData: dataset.exposesPersonalData,
    dimensionCount: dataset.fields.filter((f) => f.role === 'dimension').length,
    timeDimensionCount: dataset.fields.filter((f) => f.role === 'time-dimension').length,
    measureCount: dataset.fields.filter((f) => f.role === 'measure').length,
  }
}
