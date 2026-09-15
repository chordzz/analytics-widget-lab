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
 * scope list and no directory. `LocalAuthorization` answered these questions
 * from a fixture array of three people, and running that against a real account
 * meant asking a demo whether a real person is in a real department.
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
import type { DashboardScope, ShareGrant } from '../domain/dashboard'
import type { ViewerIdentity } from '../retrieval/port'

export function httpAuthorization(): AuthorizationPort {
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
     * Not a resolution: there is no directory endpoint, so nothing here can
     * expand a department into its members or confirm an actor id exists. What
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
     * Empty, and this is a real gap rather than a deferral.
     *
     * The Grant authoring surface needs to name *other people*, and the API
     * publishes nothing that can: no directory, no user search, and `/v1/me`
     * describes only the caller — whose own `email` and `full_name` come back
     * blank. So an Author cannot pick a recipient, and the Share panel renders
     * no candidates.
     *
     * Share Grants can therefore be sent but not composed. Raised with the
     * backend team; until there is a source, an empty list is the truth.
     */
    async directory(): Promise<{ individuals: ViewerIdentity[]; groups: OrgScopeRef[] }> {
      return { individuals: [], groups: [] }
    },
  }
}
