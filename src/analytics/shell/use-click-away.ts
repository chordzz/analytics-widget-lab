import { useEffect } from 'react'

/**
 * Closes a popover when a click lands outside it.
 *
 * A full-viewport scrim was the first attempt and it does not hold: `position:
 * fixed` is contained by any ancestor carrying a transform, and the board grid
 * positions by transform — so the scrim covered its own card rather than the
 * screen, two lists could be open at once, and clicking empty space did
 * nothing. Escape still worked, which is exactly the kind of half-working that
 * survives a demo.
 *
 * `pointerdown` in the capture phase, so it runs before the trigger it may be
 * landing on: clicking straight from one field to another closes the first and
 * opens the second in a single click rather than swallowing it.
 */
export function useClickAway(
  open: boolean,
  root: React.RefObject<HTMLElement | null>,
  close: () => void,
): void {
  useEffect(() => {
    if (!open) return
    const onDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) close()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => { document.removeEventListener('pointerdown', onDown, true) }
  }, [open, root, close])
}
