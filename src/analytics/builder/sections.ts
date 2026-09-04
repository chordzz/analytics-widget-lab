/**
 * Sections — FR-CO-07, "organizes Widgets spatially".
 *
 * Merge Plan Stage 6.4, and the arithmetic half of it. Pure, for the same
 * reason `grid.ts` is: a browser cannot tell you that collapsing the second of
 * three Sections left a widget one row too high, and that is where the bugs are.
 *
 * **A Section is a band, not a container.** It owns a starting row and runs
 * until the next one begins; a widget belongs to the last Section at or above
 * its row. So the board stays one twelve-column plane with one drag context, and
 * dragging a widget under a different heading *is* how you move it there —
 * rather than a grid per Section, where moving a widget between two means
 * dragging across two `react-grid-layout` instances.
 *
 * The cost of that choice, stated: a widget nudged across a boundary changes
 * Section. That is direct manipulation when intended and a surprise when not,
 * and it is the reason `sectionOf` is a function rather than a stored field —
 * with both, the picture and the record disagree the moment they diverge.
 *
 * **A collapsed Section is a view, not a layout.** `collapsedLayout` shifts the
 * bands below a collapsed one upward so the board has no hole in it, and that
 * result is never persisted — exactly the rule the narrow stack follows in
 * `GridBoard`. Writing it would flatten the Author's board because a Viewer
 * folded a heading shut.
 */

import type { Section } from '../../domain/composition'
import type { Placement } from './grid'

/** How many rows a Section's own heading occupies. */
export const SECTION_ROWS = 2

/** Sections in board order. Ties broken by id so the order is total. */
export const orderedSections = (sections: readonly Section[]): Section[] =>
  [...sections].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))

/**
 * Which Section a widget falls in — the last one starting at or above it.
 *
 * `null` means the board root: a widget above the first Section, which is a real
 * arrangement rather than an error. A board with headings lower down still has a
 * top.
 */
export function sectionOf(
  widget: Pick<Placement, 'y'>,
  sections: readonly Section[],
): Section | null {
  let found: Section | null = null
  for (const section of orderedSections(sections)) {
    if (section.y <= widget.y) found = section
    else break
  }
  return found
}

/** Every widget grouped under its Section, root first, in board order. */
export function groupBySection<T extends Placement>(
  widgets: readonly T[],
  sections: readonly Section[],
): { section: Section | null; widgets: T[] }[] {
  const groups: { section: Section | null; widgets: T[] }[] = [{ section: null, widgets: [] }]
  for (const section of orderedSections(sections)) groups.push({ section, widgets: [] })

  for (const widget of widgets) {
    const owner = sectionOf(widget, sections)
    const group = groups.find((entry) => entry.section?.id === (owner?.id ?? undefined))
    ;(group ?? groups[0]).widgets.push(widget)
  }

  // A root group with nothing in it is not a section anyone declared, so it
  // should not render a gap above the first heading.
  return groups.filter((group) => group.section !== null || group.widgets.length > 0)
}

/**
 * The last row a Section reaches — the row before the next Section starts, or
 * the bottom of its own widgets when it is the last one.
 */
export function sectionExtent(
  section: Section,
  widgets: readonly Placement[],
  sections: readonly Section[],
): { from: number; to: number } {
  const ordered = orderedSections(sections)
  const next = ordered[ordered.findIndex((entry) => entry.id === section.id) + 1]

  const mine = widgets.filter((widget) => sectionOf(widget, sections)?.id === section.id)
  const bottom = mine.reduce((low, widget) => Math.max(low, widget.y + widget.h), section.y)

  return { from: section.y, to: next ? next.y : bottom }
}

/**
 * The board with collapsed Sections folded shut.
 *
 * Returns the widgets still visible, each shifted up by the height of every
 * collapsed band above it, plus where each Section heading now sits. Display
 * only — see the module header.
 *
 * The shift is cumulative rather than per-band because two collapsed Sections
 * above a widget have to both count. Computing it against the *original* rows
 * and accumulating as we descend is what keeps that right; adjusting in place
 * would apply the second shift to an already-shifted row.
 */
export function collapsedLayout<T extends Placement>(
  widgets: readonly T[],
  sections: readonly Section[],
  collapsed: readonly string[],
): { widgets: T[]; sections: { section: Section; y: number }[] } {
  if (collapsed.length === 0) {
    return {
      widgets: [...widgets],
      sections: orderedSections(sections).map((section) => ({ section, y: section.y })),
    }
  }

  const ordered = orderedSections(sections)
  const shut = new Set(collapsed)

  let removed = 0
  const placed: { section: Section; y: number }[] = []
  const shiftAt = new Map<string, number>()

  for (const section of ordered) {
    placed.push({ section, y: section.y - removed })
    shiftAt.set(section.id, removed)

    if (shut.has(section.id)) {
      const { from, to } = sectionExtent(section, widgets, sections)
      // The heading itself stays visible when shut — that is what you click to
      // reopen it — so only the body below it is reclaimed.
      removed += Math.max(0, to - from - SECTION_ROWS)
    }
  }

  const visible: T[] = []
  for (const widget of widgets) {
    const owner = sectionOf(widget, sections)
    if (owner && shut.has(owner.id)) continue
    visible.push({ ...widget, y: widget.y - (owner ? (shiftAt.get(owner.id) ?? 0) : 0) })
  }

  return { widgets: visible, sections: placed }
}

/**
 * Where a new Section goes: below everything on the board.
 *
 * Inserting one in the middle would push half the board down, which reads as
 * the board having been rearranged rather than labelled. An Author who wants it
 * higher drags it, the same as everything else here.
 */
export const nextSectionRow = (widgets: readonly Placement[]): number =>
  widgets.reduce((low, widget) => Math.max(low, widget.y + widget.h), 0)
