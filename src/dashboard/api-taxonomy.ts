/**
 * Which of our Visualization Type ids the API accepts — D28, now mostly closed.
 *
 * **History, because it explains why this file is nearly empty.** On 14
 * September the backend's taxonomy took `line` where §4.2 and our registry say
 * `line-chart`, and `top-n-list` where we say `ranked-list` — sixteen ids apart,
 * plus three with no counterpart at all. This module translated at the boundary
 * so our domain could keep §4.2's vocabulary while the wire spoke theirs.
 *
 * On 15 September they adopted §4.2 in full: all sixteen renames, the Family
 * renames and merges, and a new `chronological` Family carrying `activity-feed`
 * and `event-log-view`. So the translation is not merely unnecessary — it became
 * *harmful*, sending strings the API now rejects. It is deleted rather than
 * left as an identity map.
 *
 * What remains is one id, and it is ours rather than theirs.
 */

/**
 * Types the API has no identifier for.
 *
 * Just `status-list` now: our own 43rd Type, recorded as D7, a proposed
 * extension to §4.2 rather than part of it. The backend adopted §4.2, so a Type
 * the FRD does not contain is one they had no reason to add — this is our
 * proposal outrunning the contract, which is the right way round for it to be
 * outstanding.
 *
 * A Widget of this Type is built and renders, and is refused on save.
 */
export const UNMAPPED_TYPE_IDS = ['status-list'] as const

export const acceptedByApi = (typeId: string): boolean =>
  !(UNMAPPED_TYPE_IDS as readonly string[]).includes(typeId)
