/**
 * A destructive action, behind one extra step.
 *
 * Deleting a board has no undo — `http-board-store`'s `DELETE` removes the
 * record, not a status on it, unlike the archive-in-place a revoked Share
 * Grant gets. A single click doing that is a fat-finger away from losing
 * work, draft or published, so every delete in this module goes through here
 * rather than firing straight from the button that starts it.
 *
 * A popover rather than `window.confirm`: the browser dialog carries no
 * styling, blocks the main thread while open, and is the one piece of UI in
 * this module that would not read as part of it. `DateField`'s popover is the
 * precedent — same click-away, same Escape, same shape.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useClickAway } from './use-click-away'

export function ConfirmDelete({
  /** What is being deleted, named in the question asked. */
  label,
  onConfirm,
  className,
  children,
}: {
  label: string
  onConfirm: () => void
  className?: string
  /** The trigger's own content — callers keep control of its wording and icon. */
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useClickAway(open, box, useCallback(() => { setOpen(false) }, []))

  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey) }
  }, [open])

  return (
    <div className="a-confirm" ref={box}>
      <button type="button" className={className} aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(true) }}>
        {children}
      </button>

      {open && (
        <div className="a-confirm__pop" role="dialog" aria-label={`Delete ${label}?`}>
          <p className="a-confirm__message">
            Delete <strong>{label}</strong>? This cannot be undone.
          </p>
          <div className="a-confirm__actions">
            <button type="button" className="a-button" onClick={() => { setOpen(false) }}>
              Cancel
            </button>
            <button
              type="button"
              className="a-button a-button--danger-solid"
              onClick={() => {
                setOpen(false)
                onConfirm()
              }}
            >
              Confirm delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
