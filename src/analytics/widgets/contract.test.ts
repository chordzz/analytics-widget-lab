/**
 * The primitive contract, enforced.
 *
 * Twenty-three components written over four iterations will drift unless
 * something objects. They already had: the same role was called `xKey` in twelve
 * places and `timeKey`, `cohortKey`, `rowKey` and `fromKey` in four others, and
 * eight primitives quietly lacked a `height`. Nobody notices, because each one
 * reads fine on its own — the cost lands on whoever uses the second one.
 *
 * So the rules are checked against the source rather than described in a README
 * that nothing verifies. This reads the prop interfaces as text: crude, but it
 * cannot be satisfied by a passing type-check, which is exactly the failure mode
 * (every one of these was type-correct and inconsistent).
 *
 * The contract is two shapes, not one:
 *
 *   **Data primitives** take `data` and render it — they must also take
 *   `className` and `height`, and name every field reference `<role>Key`.
 *
 *   **Tiles** take an already-computed `label`/`value` and size to their
 *   content. Forcing `data` or `height` on them would mean inventing an array
 *   to hold one number, and a height that only stretches whitespace.
 */

import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = join(import.meta.dir, 'primitives')

interface PropsBlock {
  file: string
  name: string
  props: { name: string; optional: boolean; type: string }[]
}

/** Every exported `*Props` interface in the primitives folder, as data. */
function propsBlocks(): PropsBlock[] {
  const blocks: PropsBlock[] = []

  for (const file of readdirSync(DIR).filter((entry) => entry.endsWith('.tsx'))) {
    const source = readFileSync(join(DIR, file), 'utf8')

    for (const match of source.matchAll(/export interface (\w+Props) \{([\s\S]*?)\n\}/g)) {
      const [, name, body] = match
      const props = [...body.matchAll(/^ {2}(\w+)(\??):\s*([^\n]+?)$/gm)].map((prop) => ({
        name: prop[1],
        optional: prop[2] === '?',
        type: prop[3].replace(/\s*$/, ''),
      }))
      blocks.push({ file, name, props })
    }
  }

  return blocks
}

const blocks = propsBlocks()
const has = (block: PropsBlock, prop: string) => block.props.some((entry) => entry.name === prop)
const dataPrimitives = blocks.filter((block) => has(block, 'data'))
const report = (failing: PropsBlock[]) => failing.map((block) => `${block.file}:${block.name}`)

describe('the contract exists to be checked', () => {
  test('finds every primitive', () => {
    // A rename that silently emptied this list would make the whole file pass.
    expect(blocks.length).toBeGreaterThanOrEqual(20)
    expect(dataPrimitives.length).toBeGreaterThanOrEqual(17)
  })
})

describe('data primitives', () => {
  test('take a readonly row array, never a mutable one', () => {
    // A primitive that could sort its input in place would surprise a caller
    // sharing one array between two widgets.
    const failing = dataPrimitives.filter(
      (block) => !/readonly Row\[\]/.test(block.props.find((p) => p.name === 'data')!.type),
    )
    expect(report(failing)).toEqual([])
  })

  test('take className', () => {
    expect(report(dataPrimitives.filter((block) => !has(block, 'className')))).toEqual([])
  })

  test('take height', () => {
    expect(report(dataPrimitives.filter((block) => !has(block, 'height')))).toEqual([])
  })

  test('keep className and height optional', () => {
    const failing = dataPrimitives.filter((block) =>
      block.props.some(
        (prop) => ['className', 'height'].includes(prop.name) && !prop.optional,
      ),
    )
    expect(report(failing)).toEqual([])
  })
})

describe('prop naming', () => {
  test('a field reference is named <role>Key and typed string', () => {
    const wrong: string[] = []
    for (const block of blocks) {
      for (const prop of block.props) {
        if (!prop.name.endsWith('Key')) continue
        if (!/^string( \| undefined)?$/.test(prop.type)) {
          wrong.push(`${block.file}:${block.name}.${prop.name} is ${prop.type}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  test('nothing else is typed as a bare field name', () => {
    /*
     * The inverse rule, and the one that actually caught drift: a prop holding
     * a column name but *not* called `somethingKey`. `valueKey` and `value` are
     * different things — one is a field name, the other is a number — and a
     * reader has to be able to tell them apart without opening the file.
     */
    const suspects = ['field', 'column', 'dimension', 'measure']
    const wrong: string[] = []
    for (const block of blocks) {
      for (const prop of block.props) {
        const lower = prop.name.toLowerCase()
        if (prop.name.endsWith('Key')) continue
        if (prop.type.startsWith('string') && suspects.some((word) => lower.includes(word))) {
          wrong.push(`${block.file}:${block.name}.${prop.name}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  test('formatting is requested with the shared ValueFormat, never a free string', () => {
    const wrong: string[] = []
    for (const block of blocks) {
      for (const prop of block.props) {
        if (!/^(format|[a-z]+Format)$/.test(prop.name)) continue
        if (!prop.type.includes('ValueFormat')) {
          wrong.push(`${block.file}:${block.name}.${prop.name} is ${prop.type}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })

  test('boolean switches read as assertions, not questions', () => {
    // `showLegend`, not `legend` or `isLegendVisible`. Consistency here is what
    // lets someone guess the prop instead of looking it up.
    const wrong: string[] = []
    for (const block of blocks) {
      for (const prop of block.props) {
        if (!prop.type.startsWith('boolean')) continue
        if (!/^(show|is|has|allow)[A-Z]|^(sortable|selected|bare)$/.test(prop.name)) {
          wrong.push(`${block.file}:${block.name}.${prop.name}`)
        }
      }
    }
    expect(wrong).toEqual([])
  })
})

describe('tiles', () => {
  const tiles = blocks.filter((block) => !has(block, 'data'))

  test('are the only primitives without data, and are few', () => {
    // If this list grows, the exception has become the rule and the contract
    // needs rewriting rather than exempting.
    expect(report(tiles).length).toBeLessThanOrEqual(3)
  })

  test('take a label and className', () => {
    const failing = tiles.filter((block) => !has(block, 'label') || !has(block, 'className'))
    expect(report(failing)).toEqual([])
  })
})
