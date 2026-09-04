/**
 * Section arithmetic — FR-CO-07.
 *
 * The cases that matter are boundaries: a widget exactly on a Section's first
 * row, a widget above every Section, and two collapsed Sections above one
 * widget. The last is the one a single-band implementation gets wrong and a
 * browser will not tell you about.
 */

import { describe, expect, test } from 'bun:test'
import { section } from '../../domain/composition'
import {
  SECTION_ROWS,
  collapsedLayout,
  groupBySection,
  nextSectionRow,
  orderedSections,
  sectionExtent,
  sectionOf,
} from './sections'

const at = (id: string, y: number, h = 4) => ({ id, x: 0, y, w: 6, h })

const top = section('s-top', 'Headline', 0)
const middle = section('s-mid', 'Detail', 10)
const bottom = section('s-bot', 'Reference', 20)

describe('membership is derived from the row', () => {
  test('a widget belongs to the last Section at or above it', () => {
    expect(sectionOf(at('w', 12), [top, middle, bottom])?.id).toBe('s-mid')
  })

  test('a widget exactly on a Section boundary belongs to that Section', () => {
    // Off by one here and the first widget under every heading lands in the
    // Section above it.
    expect(sectionOf(at('w', 10), [top, middle, bottom])?.id).toBe('s-mid')
  })

  test('a widget one row above a boundary stays in the Section before', () => {
    expect(sectionOf(at('w', 9), [top, middle, bottom])?.id).toBe('s-top')
  })

  test('a widget above every Section belongs to the board root', () => {
    // A real arrangement, not an error: a board with headings lower down still
    // has a top.
    expect(sectionOf(at('w', 0), [middle, bottom])).toBeNull()
  })

  test('a board with no Sections puts everything at the root', () => {
    expect(sectionOf(at('w', 40), [])).toBeNull()
  })

  test('Sections declared out of order still resolve by row', () => {
    expect(sectionOf(at('w', 21), [bottom, top, middle])?.id).toBe('s-bot')
    expect(orderedSections([bottom, top, middle]).map((s) => s.id)).toEqual([
      's-top',
      's-mid',
      's-bot',
    ])
  })
})

describe('grouping', () => {
  test('widgets are grouped under their Section in board order', () => {
    const groups = groupBySection(
      [at('a', 0), at('b', 12), at('c', 22), at('d', 11)],
      [top, middle, bottom],
    )

    expect(groups.map((group) => group.section?.id ?? 'root')).toEqual([
      's-top',
      's-mid',
      's-bot',
    ])
    expect(groups[1].widgets.map((widget) => widget.id).sort()).toEqual(['b', 'd'])
  })

  test('an empty root group is dropped, an empty Section is kept', () => {
    // A declared Section with nothing in it must still render — that is where
    // you drop the first widget. An undeclared root must not.
    const groups = groupBySection([at('a', 5)], [top, middle])
    expect(groups.map((group) => group.section?.id ?? 'root')).toEqual(['s-top', 's-mid'])
  })

  test('widgets above the first Section keep a root group', () => {
    const groups = groupBySection([at('a', 0)], [middle])
    expect(groups.map((group) => group.section?.id ?? 'root')).toEqual(['root', 's-mid'])
  })
})

describe('extent', () => {
  test('a Section runs until the next one starts', () => {
    expect(sectionExtent(top, [at('a', 0)], [top, middle])).toEqual({ from: 0, to: 10 })
  })

  test('the last Section runs to the bottom of its own widgets', () => {
    expect(sectionExtent(bottom, [at('a', 20, 6)], [top, bottom])).toEqual({ from: 20, to: 26 })
  })

  test('an empty last Section is just its heading', () => {
    expect(sectionExtent(bottom, [], [top, bottom])).toEqual({ from: 20, to: 20 })
  })
})

describe('collapsing folds the board without leaving a hole', () => {
  const widgets = [at('a', 0), at('b', 10), at('c', 20)]
  const sections = [top, middle, bottom]

  test('nothing collapsed is the board unchanged', () => {
    const out = collapsedLayout(widgets, sections, [])
    expect(out.widgets).toEqual(widgets)
    expect(out.sections.map((entry) => entry.y)).toEqual([0, 10, 20])
  })

  test('a collapsed Section hides its widgets', () => {
    const out = collapsedLayout(widgets, sections, ['s-mid'])
    expect(out.widgets.map((widget) => widget.id)).toEqual(['a', 'c'])
  })

  test('and pulls everything below it up', () => {
    // 's-mid' spans rows 10..19, ten rows, of which the heading keeps two — so
    // eight rows are reclaimed and 's-bot' rises from 20 to 12.
    const out = collapsedLayout(widgets, sections, ['s-mid'])
    expect(out.sections.find((entry) => entry.section.id === 's-bot')?.y).toBe(12)
    expect(out.widgets.find((widget) => widget.id === 'c')?.y).toBe(12)
  })

  test('two collapsed Sections above a widget both count', () => {
    /*
     * The discriminating case. Shifting each band by only the nearest collapsed
     * Section above it — or adjusting rows in place, so the second shift applies
     * to an already-shifted row — gives the wrong answer here and the right one
     * for a single collapse.
     */
    const out = collapsedLayout(widgets, sections, ['s-top', 's-mid'])

    const reclaimed = 10 - SECTION_ROWS + (10 - SECTION_ROWS)
    expect(out.widgets.map((widget) => widget.id)).toEqual(['c'])
    expect(out.widgets[0].y).toBe(20 - reclaimed)
    expect(out.sections.find((entry) => entry.section.id === 's-bot')?.y).toBe(20 - reclaimed)
  })

  test('a collapsed heading stays visible', () => {
    // It is what you click to reopen it, so its own rows are never reclaimed.
    const out = collapsedLayout(widgets, sections, ['s-mid'])
    expect(out.sections.map((entry) => entry.section.id)).toEqual(['s-top', 's-mid', 's-bot'])
  })

  test('collapsing the last Section changes nothing above it', () => {
    const out = collapsedLayout(widgets, sections, ['s-bot'])
    expect(out.widgets.map((widget) => widget.id)).toEqual(['a', 'b'])
    expect(out.sections.map((entry) => entry.y)).toEqual([0, 10, 20])
  })

  test('a widget at the root is never hidden', () => {
    // Nothing collapses the root — there is no heading to click to get it back.
    const out = collapsedLayout([at('a', 0), at('b', 12)], [middle], ['s-mid'])
    expect(out.widgets.map((widget) => widget.id)).toEqual(['a'])
  })

  test('collapsing every Section leaves only the headings', () => {
    const out = collapsedLayout(widgets, sections, ['s-top', 's-mid', 's-bot'])
    expect(out.widgets).toEqual([])
    expect(out.sections).toHaveLength(3)
  })

  test('the original widgets are never mutated', () => {
    const original = [at('a', 0), at('b', 10)]
    const snapshot = JSON.stringify(original)
    collapsedLayout(original, sections, ['s-top'])
    expect(JSON.stringify(original)).toBe(snapshot)
  })
})

describe('placing a new Section', () => {
  test('it goes below everything on the board', () => {
    // Inserting one mid-board would push half the widgets down, which reads as
    // the board having been rearranged rather than labelled.
    expect(nextSectionRow([at('a', 0, 7), at('b', 4, 9)])).toBe(13)
  })

  test('an empty board takes one at the top', () => {
    expect(nextSectionRow([])).toBe(0)
  })
})
