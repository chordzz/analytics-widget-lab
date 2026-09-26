/**
 * Authorization, deferred to the API.
 *
 * Every method here says yes, or says "I cannot know". That reads alarming and
 * is the opposite: **the decision has already been made, upstream, by the party
 * that can make it.**
 *
 * `GET /v1/dashboards` returns *"the viewer's own boards including drafts, plus
 * published boards whose scope and Share Grants admit them"*. `GET /v1/datasets`
 * returns *"Datasets the viewer may see"*. Both resolve the actor from the
 * bearer token and apply IAM's model. A board that reached this client is a
 * board the server already decided the viewer may see.
 *
 * So a second opinion here can only be wrong in one direction — hiding
 * something we were told we could show — and it would be wrong from a worse
 * position, because the client holds none of the inputs. `/v1/me` returns an
 * empty `permissions` map and an empty `department_id`; there is no organizational
 * scope list. (`share-targets` has since supplied a directory, which
 * `directory()` below reads — but it answers who a board may be shared *with*,
 * not which scopes a viewer belongs to.) `LocalAuthorization` answered these
 * questions from a fixture array of three people, and running that against a
 * real account meant asking a demo whether a real person is in a real
 * department.
 *
 * **What this replaces, and the bug it removes.** Until this existed,
 * `AnalyticsDataProvider` fell back to `LocalAuthorization` whenever a host did
 * not pass a port — including the live session. `satisfiesScope` then decided a
 * department-scoped board by `viewer.organizationalScopeIds.includes(...)`, on a
 * viewer built from `/v1/me` that carries no scopes, so the answer was always
 * false. Nothing was visibly broken only because the API cannot return such
 * boards yet — their `department_id` is unpopulated and they fail closed
 * upstream. Two gaps cancelling out, and the day the backend closes theirs, this
 * client would have kept hiding the boards and it would have looked like their
 * fix had failed.
 *
 * Per-Widget denial is untouched and still real: `/v1/datasets/{id}/query`
 * answers `403` for a Dataset the viewer may not read, and the retrieval adapter
 * renders that Widget denied while the board stands. That is the check that
 * matters, it happens at the point of access, and it is the server's.
 */

import type { AuthorizationPort, OrgScopeRef } from './port'
import type { ApiClient } from '../api/client'
import type { DashboardScope, ShareGrant } from '../domain/dashboard'
import type { ViewerIdentity } from '../retrieval/port'

/**
 * `GET /v1/dashboards/share-targets` — two lists, not one.
 *
 * The response separates them itself rather than leaving a flat array to be
 * split on `target_type`, so these are read as given. Written the other way
 * first, from the candidate schema rather than the response schema, and it
 * silently returned nobody: `Array.isArray` on an object is false, and every
 * search came back empty with nothing to say so.
 */
interface ApiShareTargets {
  users?: ApiShareCandidate[]
  departments?: ApiShareCandidate[]
}

/** One entry of either list. */
interface ApiShareCandidate {
  target_type: 'user' | 'department'
  target_ref: string
  name?: string
  email?: string
  job_title?: string
  department_id?: string
  member_count?: number
  photo_url?: string
}

/**
 * Shape-checked, because a candidate without a target is unusable.
 *
 * `target_ref` becomes `recipientId` and travels into a Share Grant. An entry
 * missing it would render a tickable name that grants access to nothing, which
 * reads to the Author exactly like one that worked.
 */
function isCandidate(entry: ApiShareCandidate | undefined): entry is ApiShareCandidate {
  return (
    typeof entry?.target_ref === 'string' &&
    entry.target_ref !== '' &&
    (entry.target_type === 'user' || entry.target_type === 'department')
  )
}

/** `name` is optional in the schema; the reference is the only other handle. */
const nameOf = (entry: ApiShareCandidate): string =>
  entry.name?.trim() || entry.email?.trim() || entry.target_ref

export function httpAuthorization(api: ApiClient): AuthorizationPort {
  return {
    /**
     * FR-DP-12 and FR-DA-09, both already answered upstream.
     *
     * The Catalogue arrives filtered, so a Dataset the client can name is one
     * the viewer may browse. Whether they may *read* it is asked again at
     * retrieval, by the API, per call — which is where FR-DA-09 wants it, since
     * authorization can change between browsing and retrieving.
     */
    async mayConsumeDataset(): Promise<boolean> {
      return true
    },

    /**
     * FR-DA-02 — FR-DA-04, likewise.
     *
     * The board is in the list the server returned, which is the server saying
     * this viewer falls inside its Scope. Answering from `organizationalScopeIds`
     * — which `/v1/me` does not supply — would overrule that with a guess.
     */
    async satisfiesScope(_scope: DashboardScope, _viewer: ViewerIdentity): Promise<boolean> {
      return true
    },

    /**
     * The grant's own target, echoed back.
     *
     * Not a resolution, and `share-targets` does not make it one: that endpoint
     * searches candidates by name, so nothing here can expand a department into
     * its members or confirm an actor id exists. What
     * it avoids is the alternative. Returning an empty list means "could not be
     * resolved to any identity", which `evaluateGrant` reports to the Author as
     * the Grant having no effect — and against the API that is false. The grant
     * was accepted by `POST /share-grants` and the server is honouring it.
     *
     * The cost is that `reach` reads 1 for a department that may hold forty. No
     * surface displays `reach`, and overstating a Grant's effect is the safer
     * error of the two: the Author is told their Grant works, which is true.
     */
    async resolveRecipient(grant: ShareGrant): Promise<ViewerIdentity[]> {
      return [{ id: grant.recipientId, displayName: grant.recipientLabel }]
    },

    /**
     * Finding 12 — the Analytics Administrator user class does not exist in the
     * IAM Role Catalog, so nothing can truthfully answer yes. `/v1/me` returning
     * an empty `permissions` map is that gap arriving as evidence rather than as
     * a note in a plan.
     *
     * The one place this adapter fails closed, and it should: an administrative
     * surface opened on a guess is a different kind of mistake from a board
     * hidden on one.
     */
    async mayAdministerCatalogue(): Promise<boolean> {
      return false
    },

    /**
     * `GET /v1/dashboards/share-targets`, which closes the gap that made Share
     * Grants sendable but not composable.
     *
     * Each candidate arrives carrying the `target_type` and `target_ref` a
     * Grant names it by, so nothing here builds that pairing — `target_ref` is
     * what goes into `recipientId`, unchanged.
     *
     * **People need a query and departments do not**, which is the endpoint's
     * rule rather than ours: it runs as the caller, and an empty search that
     * returned everyone would be a staff list for anyone who can open
     * Analytics. So a blank query asks for the departments alone.
     *
     * A failure answers empty. The Share panel then offers no candidates, which
     * is what it did before this endpoint existed — worse than the truth, but
     * the alternative is an Author unable to open the panel at all.
     */
    async directory(query?: string): Promise<{ individuals: ViewerIdentity[]; groups: OrgScopeRef[] }> {
      const term = query?.trim() ?? ''
      const path = term === ''
        ? '/v1/dashboards/share-targets'
        : `/v1/dashboards/share-targets?q=${encodeURIComponent(term)}`

      try {
        const body = await api.request<ApiShareTargets | undefined>(path)

        return {
          individuals: (body?.users ?? [])
            .filter(isCandidate)
            .map((entry) => ({ id: entry.target_ref, displayName: nameOf(entry) })),
          groups: (body?.departments ?? [])
            .filter(isCandidate)
            .map((entry) => ({ scopeId: entry.target_ref, label: nameOf(entry) })),
        }
      } catch {
        return { individuals: [], groups: [] }
      }
    },
  }
}
