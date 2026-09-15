/**
 * What to show when the Catalogue has nothing to offer.
 *
 * Shared between the Data sources screen and step 1 of the composer, because
 * both are asking the Catalogue the same question and both used to answer an
 * empty one with an empty screen. The composer's was the worse of the two: a
 * numbered step with a blank area beneath it, which reads as a page that failed
 * to finish rendering rather than as an answer.
 *
 * Three causes, named apart, because they need three different things from
 * whoever is reading — ask for access, wait and retry, or ask a product team to
 * publish something. Only the empty case is nobody's fault.
 */

import type { ReactNode } from 'react'
import type { CatalogueFailure } from './AnalyticsData'

/**
 * The Catalogue could not answer.
 *
 * Named by cause rather than as a generic error, because the three causes call
 * for different actions and only one of them is anybody's fault.
 */
export function CatalogueProblem({ failure }: { failure: CatalogueFailure }) {
  const heading =
    failure.kind === 'denied'
      ? 'You do not have access to the data catalogue'
      : failure.kind === 'unavailable'
        ? 'The data catalogue is temporarily unavailable'
        : 'The data catalogue could not be loaded'

  const guidance =
    failure.kind === 'denied'
      ? 'Ask an administrator for the data source read permission.'
      : failure.kind === 'unavailable'
        ? 'This usually clears on its own. Try again in a few minutes.'
        : failure.message

  return (
    <div className="a-placeholder a-placeholder--warning">
      <p className="a-placeholder__heading">{heading}</p>
      <p style={{ margin: 0 }}>{guidance}</p>
    </div>
  )
}

/**
 * The Catalogue answered, and there is nothing in it.
 *
 * A real state and not a failure: Analytics holds no data of its own, so an
 * empty Catalogue means no product has published a Dataset yet. Drawn as an
 * error it would send someone to check a service that is working perfectly.
 *
 * It names *who* publishes one, because that is the part a reader cannot work
 * out and the part that decides what they do next. "No data sources" alone
 * invites someone to go looking for a setting they do not have.
 */
export function NoDatasets({ children }: { children?: ReactNode }) {
  return (
    <div className="a-placeholder a-placeholder--muted">
      <p className="a-placeholder__heading">No data sources published yet</p>
      <p style={{ margin: 0 }}>
        Analytics holds no data of its own — every source is published by the product
        team that owns it. Ask the team whose data you need to publish a data source,
        and it will appear here.
      </p>
      {children}
    </div>
  )
}
