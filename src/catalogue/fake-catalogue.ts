/**
 * In-memory Catalogue over the fixtures.
 *
 * Authorization is delegated to the AuthorizationPort rather than held here.
 * The Catalogue's job is to describe what exists; deciding who may see it is
 * IAM's, and Analytics conforms.
 */

import { catalogueFixtures } from './fixtures'
import { summarize } from './port'
import type { CataloguePort, DatasetSummary } from './port'
import type { AuthorizationPort } from '../access/port'
import type { Dataset } from '../domain/dataset'
import type { ViewerIdentity } from '../retrieval/port'
import { visualizationFamilies } from '../visualization/families'
import { visualizationTypes } from '../visualization/visualization-types'
import type { TaxonomyEntry } from './port'

export interface FakeCatalogueOptions {
  authorization: AuthorizationPort
  /** Withdrawn Datasets leave the Catalogue (FR-DP-13). */
  withdrawn?: string[]
}

export class FakeCatalogue implements CataloguePort {
  /**
   * Our own manifest, because a fixture has no API behind it.
   *
   * The shape the endpoint returns, built from the registry the fixtures already
   * answer to — so fixture mode agrees with itself, and the drift check that
   * runs against a live taxonomy has nothing to report here.
   */
  async visualizations(): Promise<TaxonomyEntry[]> {
    return visualizationFamilies.map((family) => ({
      family: family.id,
      types: visualizationTypes
        .filter((type) => type.familyId === family.id)
        .map((type) => type.id),
      requirement: family.dataShape.summary,
    }))
  }

  private readonly options: FakeCatalogueOptions

  constructor(options: FakeCatalogueOptions) {
    this.options = options
  }

  private async visibleTo(viewer: ViewerIdentity): Promise<Dataset[]> {
    const withdrawn = new Set(this.options.withdrawn ?? [])
    const present = catalogueFixtures.filter((dataset) => !withdrawn.has(dataset.id))

    // FR-DP-12 — the Catalogue never advertises what retrieval would refuse.
    const decisions = await Promise.all(
      present.map((dataset) => this.options.authorization.mayConsumeDataset(dataset.id, viewer)),
    )
    return present.filter((_, index) => decisions[index])
  }

  async browse(viewer: ViewerIdentity): Promise<DatasetSummary[]> {
    return (await this.visibleTo(viewer)).map(summarize)
  }

  async describe(datasetId: string, viewer: ViewerIdentity): Promise<Dataset | null> {
    const visible = await this.visibleTo(viewer)
    return visible.find((dataset) => dataset.id === datasetId) ?? null
  }
}
