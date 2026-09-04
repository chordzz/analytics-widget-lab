/**
 * A log — Chronological's second form.
 *
 * `ActivityFeed` is the same data as a narrative: who did what, with a rail down
 * the side. This is the same data as a record: a timestamp column and the rest
 * joined, monospaced, dense. Ported from the workbench's `EventLogRenderer`
 * (merge §2).
 *
 * The distinction is worth two components rather than a `variant`, because they
 * disagree about what a row *is*. A feed row is a sentence and takes an actor
 * and an action in named slots; a log row is a record and takes whichever
 * columns the Author picked, in order. One prop set cannot be honest about both.
 *
 * Chronological is the Family with no Measure: a log lists events rather than
 * aggregating them, which is also what separates it from Trend — same Time
 * Dimension requirement, no figure.
 */

import type { Field, Row } from '../../data/types'

export interface EventLogProps {
  data: readonly Row[]
  /** Field holding the timestamp. Also what the log is ordered by. */
  timeKey: string
  /**
   * Fields to show after the timestamp, in the order given.
   *
   * `Field[]` rather than field names, matching `DataTable`. The naming rule is
   * that a prop holding *one* column is `<role>Key` and typed `string`; a set of
   * columns is passed as the Fields themselves, which also leaves the door open
   * to formatting them later.
   */
  columns?: readonly Field[]
  /** @default 60 */
  limit?: number
  /**
   * Fixed height in pixels. Omit to size to content.
   *
   * Part of the shared contract: any primitive that takes `data` takes this, so
   * a caller can put one in a fixed box without wrapping it. Content beyond it
   * scrolls rather than overflowing the frame.
   */
  height?: number
  className?: string
}

export function EventLog({
  data,
  timeKey,
  columns,
  limit = 60,
  height,
  className,
}: EventLogProps) {
  // No rows draws nothing. An empty framed table reads as broken; whatever wraps
  // this is better placed to say why it is empty.
  if (data.length === 0) return null

  /*
   * Most recent first. A log read oldest-first buries what matters, and the
   * ordering is display-only — it cannot change which rows arrived, so it is not
   * the kind of client-side reduction the query owns.
   */
  const shown = [...data]
    .sort((a, b) => String(b[timeKey] ?? '').localeCompare(String(a[timeKey] ?? '')))
    .slice(0, limit)

  const keys = (columns?.map((field) => field.key) ?? Object.keys(data[0])).filter(
    (key) => key !== timeKey,
  )

  return (
    <div
      className={['a-log', className].filter(Boolean).join(' ')}
      style={height === undefined ? undefined : { height }}
    >
      <table className="a-log__table">
        <tbody>
          {shown.map((row, index) => (
            <tr key={index}>
              <td className="a-log__time">{String(row[timeKey] ?? '')}</td>
              <td className="a-log__entry">{describe(row, keys)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * One row as a line.
 *
 * Empty cells are dropped rather than rendered as gaps, or a table with an
 * optional column reads as a run of stray separators.
 */
const describe = (row: Row, keys: string[]): string =>
  keys
    .map((key) => row[key])
    .filter((value) => value !== null && value !== undefined && value !== '')
    .join(' · ')
