/**
 * `GET /v1/me` — the authenticated caller.
 *
 * Two jobs, one call. It is the canonical probe: the integration guide says
 * *"If that is not 200, the problem is your token, not your integration"*, and
 * it is also where the display name comes from. Worth making on every boot,
 * because local verification cannot observe revocation — a stored token can be
 * well-formed, unexpired and dead.
 */

import type { ApiClient } from '../api/client'
import type { Actor } from './port'

interface ActorBody {
  id?: string
  email?: string
  full_name?: string
  username?: string
  profile_image_url?: string
  department_id?: string
  is_head_of_department?: boolean
  permissions?: Record<string, boolean>
}

export async function fetchActor(api: ApiClient): Promise<Actor> {
  return actorFrom(await api.request<ActorBody>('/v1/me'))
}

export function actorFrom(body: ActorBody | undefined): Actor {
  return {
    id: body?.id ?? '',
    email: body?.email ?? '',
    // Falls back to the email rather than to "Unknown": an address is a name
    // someone recognises as theirs, which is the whole job of this string.
    fullName: body?.full_name || body?.username || body?.email || 'Signed in',
    username: body?.username,
    profileImageUrl: body?.profile_image_url,
    departmentId: body?.department_id,
    isHeadOfDepartment: body?.is_head_of_department,
    permissions: body?.permissions,
  }
}
