/**
 * The period a Dashboard opens on when nobody has chosen one.
 *
 * A date Control stores no value — `ControlValues` is session state — so
 * without this a board opens with its range empty, governing nothing, and every
 * Widget falls back to whatever range its Author happened to bind. That looked
 * fine on Peniremit's boards because all 55 Widgets carry the same one, and it
 * would not on a board assembled from several.
 *
 * **Resolved at render, never stored.** Writing today's answer onto the board
 * would be correct on the day it was written and wrong every day after, and a
 * stale window is indistinguishable from live data — the failure that matters
 * for a dashboard people open every morning.
 */

/** Inclusive, and how far back the default reaches. */
const DEFAULT_DAYS = 30

/**
 * **The one place a calendar day is decided, and the open question with it.**
 *
 * Every date this module produces is `YYYY-MM-DD`, which the API documents as
 * *"a date-only value includes the whole day"* — so no timezone is attached to
 * what we send, and a Viewer picking dates by hand raises no question at all.
 * The question is only ever *which day is today*, and it is asked exactly here.
 *
 * Computed in one fixed frame rather than in each Viewer's. Locally, a reader
 * in Lagos and one in Los Angeles disagree about today for roughly a third of
 * the day, so two people would open the same board and see different figures —
 * which is the thing that costs a dashboard its credibility, and is worse than
 * being a day out in a way everyone shares.
 *
 * UTC is the placeholder frame, not the settled answer. What should decide it
 * is how the Source System buckets a day: if Peniremit closes theirs at
 * midnight WAT and we ask for UTC days, every figure shifts by an hour at the
 * boundary. That question is with them — see `Analytics_BE_Requests.md` — and
 * this function is the single line that changes when it comes back.
 */
export function today(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** `n` days before `date`, as `YYYY-MM-DD`. */
function daysBefore(date: string, n: number): string {
  const shifted = new Date(`${date}T00:00:00Z`)
  shifted.setUTCDate(shifted.getUTCDate() - n)
  return shifted.toISOString().slice(0, 10)
}

/**
 * The default range: the last thirty days, ending today.
 *
 * Both ends are given. A range open at one end is a legitimate thing for a
 * Viewer to ask for, and a poor thing to *start* someone on — an open `from`
 * means the endpoint answers with everything it holds, which is a slow first
 * paint and a chart whose interesting part is a sliver at the right.
 */
export function defaultPeriod(now?: Date): { from: string; to: string } {
  const end = today(now)
  return { from: daysBefore(end, DEFAULT_DAYS), to: end }
}
