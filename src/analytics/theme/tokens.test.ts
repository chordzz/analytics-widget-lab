/**
 * The guard behind the re-theming promise.
 *
 * "A consumer can re-skin the whole widget set by overriding tokens" is only
 * true if no component quietly hardcodes a colour. One stray `#333` and the
 * promise breaks for everyone downstream — silently, and only in their brand.
 *
 * So it is checked rather than trusted: every source file in the module is read
 * and any colour literal outside the token files fails the suite.
 */

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'
import { SERIES_SLOTS, seriesColor, statusColor, themeToCssVars, token } from './tokens'

const MODULE_ROOT = join(import.meta.dir, '..')

/** The only files permitted to contain colour literals. */
const TOKEN_FILES = ['theme/tokens.css']

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return ['.ts', '.tsx', '.css'].includes(extname(entry)) ? [full] : []
  })
}

const HEX = /#[0-9a-fA-F]{3,8}\b/g
const RGB = /\brgba?\(\s*\d/g
const HSL = /\bhsla?\(\s*\d/g
/** Tailwind colour utilities — the other way a literal sneaks in. */
const TAILWIND = /\b(?:bg|text|border|fill|stroke|ring|from|to|via)-(?:slate|gray|grey|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/g

describe('no colour literals outside the token file', () => {
  const files = sourceFiles(MODULE_ROOT)

  test('the module has source files to check', () => {
    expect(files.length).toBeGreaterThan(15)
  })

  for (const file of files) {
    const relativePath = relative(MODULE_ROOT, file).replace(/\\/g, '/')
    if (TOKEN_FILES.includes(relativePath)) continue
    // This file necessarily contains the patterns it searches for.
    if (relativePath === 'theme/tokens.test.ts') continue

    test(relativePath, () => {
      const source = readFileSync(file, 'utf8')
      // Comments explain the palette by naming hexes; that is documentation,
      // not styling, so strip them before checking.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')

      expect({ file: relativePath, hex: code.match(HEX) ?? [] }).toEqual({
        file: relativePath,
        hex: [],
      })
      expect(code.match(RGB) ?? []).toEqual([])
      expect(code.match(HSL) ?? []).toEqual([])
      expect(code.match(TAILWIND) ?? []).toEqual([])
    })
  }
})

describe('series colours', () => {
  test('every slot resolves to a distinct custom property', () => {
    const slots = Array.from({ length: SERIES_SLOTS }, (_, index) => seriesColor(index))
    expect(new Set(slots).size).toBe(SERIES_SLOTS)
  })

  test('past the last slot it falls back rather than cycling', () => {
    // Cycling would give a ninth series the first slot's hue, so two different
    // entities would read as the same one. Falling back to neutral is honest.
    expect(seriesColor(SERIES_SLOTS)).toBe(token('statusNeutral'))
    expect(seriesColor(SERIES_SLOTS)).not.toBe(seriesColor(0))
    expect(seriesColor(-1)).toBe(token('statusNeutral'))
  })

  test('status colours are separate from the categorical palette', () => {
    const series = new Set(Array.from({ length: SERIES_SLOTS }, (_, i) => seriesColor(i)))
    for (const tone of ['good', 'warning', 'serious', 'critical'] as const) {
      expect(series.has(statusColor(tone))) .toBe(false)
    }
  })
})

describe('theme overrides', () => {
  test('a partial theme produces only the properties it names', () => {
    expect(themeToCssVars({ accent: 'rebeccapurple' })).toEqual({ '--a-accent': 'rebeccapurple' })
  })

  test('an empty theme changes nothing, so defaults stand', () => {
    expect(themeToCssVars({})).toEqual({})
  })

  test('a series override maps slot by slot', () => {
    expect(themeToCssVars({ series: ['a', 'b'] })).toEqual({
      '--a-series-1': 'a',
      '--a-series-2': 'b',
    })
  })

  test('a series override longer than the palette is truncated, not wrapped', () => {
    const long = Array.from({ length: SERIES_SLOTS + 3 }, (_, i) => `c${i}`)
    expect(Object.keys(themeToCssVars({ series: long }))).toHaveLength(SERIES_SLOTS)
  })
})
