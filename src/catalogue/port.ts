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
