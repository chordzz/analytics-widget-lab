/**
 * A select that is ours rather than the operating system's.
 *
 * Seven native `<select>` elements were the last platform-drawn controls in the
 * product: a different font, a different focus ring, and on Windows a dropdown
 * that ignores every token in `tokens.css`. They were also the only controls
 * that could not show a second line — a Field's key beneath its label, a
 * board's draft state beside its name — so several call sites folded that into
 * the option text with an em dash.
 *
 * Keyboard behaviour is the part worth getting right, because a native select
 * gives it away for free and a replacement has to earn it: arrows move, Home
 * and End jump, Enter takes, Escape closes and returns focus to the trigger,
 * and Tab leaves without selecting.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useClickAway } from './use-click-away'

export interface SelectOption {
  value: string
  label: string
  /** A second line — a Field's key, a board's status. Never the only carrier. */
  hint?: string
}

export interface SelectFieldProps {
  value: string
  onChange: (next: string) => void
  options: readonly SelectOption[]
  /** Accessible name, where no visible `<label>` is paired by `id`. */
  label?: string
  id?: string
  /** Shown when nothing is chosen, and as the first option when `emptyValue`. */
  placeholder?: string
  /** Offer an option that clears the choice, labelled with `placeholder`. */
  clearable?: boolean
  disabled?: boolean
  className?: string
}

export function SelectField({
  value,
  onChange,
  options,
  label,
  id,
  placeholder = 'Choose one',
  clearable = false,
  disabled = false,
  className,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  useClickAway(open, root, useCallback(() => { setOpen(false) }, []))

  const all: SelectOption[] = clearable
    ? [{ value: '', label: placeholder }, ...options]
    : [...options]

  const chosen = options.find((option) => option.value === value)

  /*
   * Focus the current option when the list opens, so the first arrow key moves
   * from where the reader is rather than from the top of a list they may have
   * scrolled past.
   */
  useLayoutEffect(() => {
    if (!open) return
    const index = Math.max(0, all.findIndex((option) => option.value === value))
    list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')[index]?.focus()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      trigger.current?.focus()
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [open])

  const take = (next: string) => {
    onChange(next)
    setOpen(false)
    trigger.current?.focus()
  }

  const move = (event: React.KeyboardEvent, index: number) => {
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>('[role="option"]')
    if (!buttons) return

    const go = (to: number) => {
      event.preventDefault()
      buttons[Math.max(0, Math.min(buttons.length - 1, to))]?.focus()
    }
    if (event.key === 'ArrowDown') go(index + 1)
    if (event.key === 'ArrowUp') go(index - 1)
    if (event.key === 'Home') go(0)
    if (event.key === 'End') go(buttons.length - 1)
    // Tab leaves without choosing, which is what a native select does.
    if (event.key === 'Tab') setOpen(false)
  }

  return (
    <div className={`a-select2 ${className ?? ''}`} ref={root}>
      <button
        ref={trigger}
        id={id}
        type="button"
        className={`a-select2__trigger${chosen ? '' : ' a-select2__trigger--empty'}`}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
        disabled={disabled}
        onClick={() => { setOpen((current) => !current) }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span className="a-select2__value">{chosen?.label ?? placeholder}</span>
        <Chevron />
      </button>

      {open && !disabled && (
        <div ref={list} role="listbox" aria-label={label} className="a-select2__list">
            {all.map((option, index) => (
              <button
                key={option.value || '__empty'}
                type="button"
                role="option"
                aria-selected={option.value === value}
                className={`a-select2__option${option.value === value ? ' a-select2__option--on' : ''}`}
                onClick={() => { take(option.value) }}
                onKeyDown={(event) => { move(event, index) }}
              >
                <span className="a-select2__label">{option.label}</span>
                {option.hint && <span className="a-select2__hint">{option.hint}</span>}
              </button>
            ))}
        </div>
      )}
    </div>
  )
}

const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
    <path d="M3 4.5 6 7.5 9 4.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
