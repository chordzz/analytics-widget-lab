/**
 * Ask the API what the taxonomy is, and say if it is not ours.
 *
 * **Why this exists, in one paragraph.** We used to translate Visualization Type
 * ids at the boundary because the backend spelled sixteen of them differently.
 * A test asserted the translation was still needed — against a *hardcoded copy*
 * of their list. When they adopted §4.2 on 15 September that copy went stale,
 * the test carried on passing, and the translation silently became the bug it
 * was written to prevent: it sent `line` to an API that now wants `line-chart`.
 * A guard that cannot observe the thing it guards is not a guard.
 *
 * `GET /v1/visualizations` is the fix, and the backend added it for exactly this
 * — *"the authoritative list to validate `visualization_type` against, so the
 * frontend need not keep its own copy."* This module asks it and compares.
 *
 * It reports rather than enforces. A disagreement is a fact about two
 * deployments, not a reason to refuse to render — and the next divergence will
 * be found by someone reading a log line, which is the whole point.
 */

import { visualizationTypes } from '../visualization/visualization-types'
import { visualizationFamilies } from '../visualization/families'
import { UNMAPPED_TYPE_IDS } from './api-taxonomy'
import type { ApiClient } from '../api/client'

interface ApiPresentationOption {
  family?: string
  /**
   * The schema calls this `types`; the change log's example calls it
   * `visualization_types`. Both are read rather than one being guessed at —
   * the same ambiguity, and the same treatment, as the relayed query body.
   */
  types?: string[]
  visualization_types?: string[]
  requirement?: string
  single_value?: boolean
}

export interface TaxonomyDrift {
  /** Types the API has and we do not — a board could arrive we cannot draw. */
  theirsOnly: string[]
  /**
   * Types we have and the API does not. Each is refused on save, so this is the
   * list an Author would hit as a 400.
   */
  oursOnly: string[]
  familiesTheirsOnly: string[]
  familiesOursOnly: string[]
}

export const inAgreement = (drift: TaxonomyDrift): boolean =>
  drift.theirsOnly.length === 0 &&
  drift.oursOnly.length === 0 &&
  drift.familiesTheirsOnly.length === 0 &&
  drift.familiesOursOnly.length === 0

export function compareTaxonomy(options: ApiPresentationOption[]): TaxonomyDrift {
  const theirTypes = new Set(
    options.flatMap((option) => option.types ?? option.visualization_types ?? []),
  )
  const theirFamilies = new Set(
    options.map((option) => option.family).filter((name): name is string => Boolean(name)),
  )

  const ourTypes = new Set(visualizationTypes.map((type) => type.id))
  const ourFamilies = new Set(visualizationFamilies.map((family) => family.id))

  /*
   * `status-list` is excluded from `oursOnly` on purpose. It is our own proposed
   * 43rd Type (D7), an extension to §4.2 rather than part of it, so the API
   * having no name for it is the expected state and not drift. Listing it would
   * make this report cry wolf on every boot, and a report that is always
   * non-empty is one nobody reads.
   */
  const expectedAbsent = new Set<string>(UNMAPPED_TYPE_IDS)

  return {
    theirsOnly: [...theirTypes].filter((id) => !ourTypes.has(id)).sort(),
    oursOnly: [...ourTypes].filter((id) => !theirTypes.has(id) && !expectedAbsent.has(id)).sort(),
    familiesTheirsOnly: [...theirFamilies].filter((id) => !ourFamilies.has(id)).sort(),
    familiesOursOnly: [...ourFamilies].filter((id) => !theirFamilies.has(id)).sort(),
  }
}

/**
 * Fetch and compare. Resolves to `null` when the question could not be asked.
 *
 * A failure here is not worth surfacing to anyone: the endpoint needs
 * `dataset.read`, it may be an older deployment without the route, and none of
 * that should colour a boot. Silence means "did not find out", never "agreed".
 */
export async function checkTaxonomyDrift(api: ApiClient): Promise<TaxonomyDrift | null> {
  try {
    const options = await api.request<ApiPresentationOption[]>('/v1/visualizations')
    return Array.isArray(options) ? compareTaxonomy(options) : null
  } catch {
    return null
  }
}

/** One line per disagreement, for a console or a log sink. */
export function describeDrift(drift: TaxonomyDrift): string[] {
  const lines: string[] = []
  const say = (label: string, ids: string[]) => {
    if (ids.length > 0) lines.push(`${label}: ${ids.join(', ')}`)
  }

  say('types the API has and we cannot draw', drift.theirsOnly)
  say('types we offer that the API will refuse on save', drift.oursOnly)
  say('families the API has and we do not', drift.familiesTheirsOnly)
  say('families we have and the API does not', drift.familiesOursOnly)
  return lines
}
