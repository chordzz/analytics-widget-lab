/**
 * A date field that is ours rather than the operating system's.
 *
 * `input[type=date]` was the honest choice while there were twenty of them on a
 * board: it is accessible, it handles locales, and it reads and writes
 * `YYYY-MM-DD` whatever it displays. What it does not do is look like the rest
 * of the product — it renders `dd/mm/yyyy` with a platform calendar button, and
 * on a dashboard of otherwise styled controls it is the one thing that visibly
 * belongs to Chrome.
 *
 * Now that a board has two, replacing them is contained.
 *
 * **The format contract is unchanged and load-bearing.** Values in and out are
 * `YYYY-MM-DD`, which is what every caller stores and what `dayStart`/`dayEnd`
 * convert to instants. A picker that emitted a locale string would break every
 * query, silently, with a 400 from the Source System.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useClickAway } from './use-click-away'

export interface DateFieldProps {
  /** `YYYY-MM-DD`, or empty for no date. */
  value: string
  onChange: (next: string) => void
  /** Announced to a screen reader, since the trigger shows a date rather than a name. */
  label: string
  /** Shown when there is no value. */
  placeholder?: string
  className?: string
}

const pad = (n: number) => String(n).padStart(2, '0')
const iso = (year: number, month: number, day: number) =>
  `${String(year)}-${pad(month + 1)}-${pad(day)}`

/** `YYYY-MM-DD` as local calendar parts, with no timezone anywhere near it. */
function parse(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return null
  const [year, month, day] = [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
  const date = new Date(year, month, day)
  // Rejects 31 February, which `new Date` rolls forward rather than refusing.
  return date.getMonth() === month && date.getDate() === day ? { year, month, day } : null
}

const monthLabel = (year: number, month: number) =>
  new Date(year, month, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })

const readable = (value: string) => {
  const parts = parse(value)
  return parts
    ? new Date(parts.year, parts.month, parts.day).toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : ''
}

/**
 * Weekday initials, starting where this locale starts its week.
 *
 * `weekInfo` is not everywhere yet, so Monday is the fallback rather than
 * Sunday: a grid that starts on the wrong day is wrong for a reader either way,
 * and Monday is wrong for fewer of them.
 */
function weekStart(): number {
  /*
   * Everything here is optional at runtime and the failure is total.
   *
   * `navigator` does not exist when this renders on a server, and
   * `new Intl.Locale(undefined)` throws rather than falling back — which took
   * down the whole Widget, not the calendar. `weekInfo` is also still absent in
   * some engines and is spelled two ways in others.
   *
   * Monday is the fallback rather than Sunday: a grid starting on the wrong day
   * is wrong for a reader either way, and Monday is wrong for fewer of them.
   */
  try {
    const language = typeof navigator === 'undefined' ? undefined : navigator.language
    if (!language) return 1

    const locale = new Intl.Locale(language) as Intl.Locale & {
      weekInfo?: { firstDay: number }
      getWeekInfo?: () => { firstDay: number }
    }
    const info = locale.getWeekInfo?.() ?? locale.weekInfo
    // `firstDay` is 1–7 with Monday as 1; `Date.getDay()` is 0–6 with Sunday as 0.
    return info ? info.firstDay % 7 : 1
  } catch {
    return 1
  }
}

export function DateField({ value, onChange, label, placeholder = 'Any date', className }: DateFieldProps) {
  const [open, setOpen] = useState(false)
  const selected = parse(value)
  const today = new Date()

  /** The month on screen, which follows the value until the reader pages away. */
  const [shown, setShown] = useState(() => ({
    year: selected?.year ?? today.getFullYear(),
    month: selected?.month ?? today.getMonth(),
  }))

  useEffect(() => {
    if (selected) setShown({ year: selected.year, month: selected.month })
    // Only when the value itself changes: following `selected` by identity would
    // reset the reader's paging on every render.
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const first = weekStart()

  const weekdays = useMemo(
    () =>
      Array.from({ length: 7 }, (_, index) =>
        new Date(2026, 0, 4 + ((first + index) % 7)).toLocaleDateString(undefined, {
          weekday: 'narrow',
        }),
      ),
    [first],
  )

  /** Leading blanks, then every day of the month. */
  const cells = useMemo(() => {
    const leading = (new Date(shown.year, shown.month, 1).getDay() - first + 7) % 7
    const days = new Date(shown.year, shown.month + 1, 0).getDate()
    return [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: days }, (_, index) => index + 1),
    ]
  }, [shown, first])

  const box = useRef<HTMLDivElement>(null)
  useClickAway(open, box, useCallback(() => { setOpen(false) }, []))

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [open])

  const step = (by: number) =>
    { setShown(({ year, month }) => {
      const next = new Date(year, month + by, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    }) }

  const pick = (day: number) => {
    onChange(iso(shown.year, shown.month, day))
    setOpen(false)
  }

  return (
    <div className={`a-datefield ${className ?? ''}`} ref={box}>
      <button
        type="button"
        className={`a-datefield__trigger${value ? '' : ' a-datefield__trigger--empty'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={value ? `${label}: ${readable(value)}` : label}
        onClick={() => { setOpen((current) => !current) }}
      >
        <CalendarIcon />
        <span>{readable(value) || placeholder}</span>
      </button>

      {open && (
        <div className="a-datefield__pop" role="dialog" aria-label={label}>
            <div className="a-datefield__head">
              <button type="button" className="a-datefield__step" aria-label="Previous month" onClick={() => { step(-1) }}>
                ‹
              </button>
              <span className="a-datefield__month">{monthLabel(shown.year, shown.month)}</span>
              <button type="button" className="a-datefield__step" aria-label="Next month" onClick={() => { step(1) }}>
                ›
              </button>
            </div>

            <div className="a-datefield__grid" role="grid">
              {weekdays.map((day, index) => (
                <span key={index} className="a-datefield__weekday" aria-hidden="true">
                  {day}
                </span>
              ))}
              {cells.map((day, index) =>
                day === null ? (
                  <span key={`blank-${String(index)}`} />
                ) : (
                  <button
                    key={day}
                    type="button"
                    className={
                      'a-datefield__day' +
                      (selected?.day === day && selected.month === shown.month && selected.year === shown.year
                        ? ' a-datefield__day--on'
                        : '') +
                      (today.getDate() === day &&
                      today.getMonth() === shown.month &&
                      today.getFullYear() === shown.year
                        ? ' a-datefield__day--today'
                        : '')
                    }
                    aria-current={
                      today.getDate() === day &&
                      today.getMonth() === shown.month &&
                      today.getFullYear() === shown.year
                        ? 'date'
                        : undefined
                    }
                    onClick={() => { pick(day) }}
                  >
                    {day}
                  </button>
                ),
              )}
            </div>

            {value && (
              <button
                type="button"
                className="a-datefield__clear"
                onClick={() => { onChange(''); setOpen(false) }}
              >
                Clear
              </button>
            )}
        </div>
      )}
    </div>
  )
}

const CalendarIcon = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <rect x="2" y="3.5" width="12" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.3" />
    <path d="M2 6.5h12M5.5 2v3M10.5 2v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </svg>
)
