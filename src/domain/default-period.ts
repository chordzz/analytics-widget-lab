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
 * Today, where the reader is.
 *
 * This carried a long argument about which timezone should decide a day, and
 * the argument was the wrong shape. It only existed because we sent date-only
 * values: `2026-09-24` names no instant, so the Source System picks a zone and
 * whichever one it picks is somebody's yesterday.
 *
 * `dayStart` and `dayEnd` send instants instead, which the API takes and which
 * nobody has to agree about. So a day is simply the reader's own day, and this
 * is a local date rather than a convention.
 */
export function today(now: Date = new Date()): string {
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

const pad = (n: number) => String(n).padStart(2, '0')

/** `n` days before `date`, as `YYYY-MM-DD`, in the reader's own calendar. */
function daysBefore(date: string, n: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const shifted = new Date(year, month - 1, day - n)
  return today(shifted)
}

/**
 * The first instant of a local day, as UTC.
 *
 * A Viewer picks 24 September; what they mean is their 24th, which began at
 * local midnight. Sent as the instant that was, so the Source System filters on
 * a moment rather than interpreting a bare date in a zone of its choosing.
 */
export const dayStart = (day: string): string => {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date, 0, 0, 0, 0).toISOString()
}

/**
 * The last instant of a local day, as UTC.
 *
 * Both ends of a declared range are inclusive — the API says a date-only `to`
 * "includes the whole day" — so an instant `to` has to be the end of that day
 * rather than its start. Sending local midnight for both would ask for a window
 * of zero width and return nothing, which reads as a Dataset with no data.
 */
export const dayEnd = (day: string): string => {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date, 23, 59, 59, 999).toISOString()
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
