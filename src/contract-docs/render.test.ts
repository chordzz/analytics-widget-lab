/**
 * Drift guard. The contract documents are handed to the backend team as the
 * specification they build checks against, so "generated from the code" has to
 * be enforceable rather than a promise in a header comment.
 *
 * If this fails: run `bun run docs`.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DOC_FILES,
  renderContractJson,
  renderDataShapes,
  renderPublicationContract,
} from './render'
import { publicationRules } from '../domain/publication-contract'
import { visualizationFamilies } from '../visualization/families'
import { visualizationTypes } from '../visualization/visualization-types'
import { registerBuiltInRenderers } from '../renderers'
import { registeredRendererIds } from '../widget-runtime/renderer'

const docsDir = join(import.meta.dir, '..', '..', 'docs')
const onDisk = (file: string) => readFileSync(join(docsDir, file), 'utf8')

describe('generated documents are current', () => {
  test('PUBLICATION_CONTRACT.md matches the code', () => {
    expect(onDisk(DOC_FILES.publicationContract)).toBe(renderPublicationContract())
  })

  test('DATA_SHAPES.md matches the code', () => {
    expect(onDisk(DOC_FILES.dataShapes)).toBe(renderDataShapes())
  })

  test('analytics-contract.json matches the code', () => {
    expect(onDisk(DOC_FILES.contractJson)).toBe(renderContractJson())
  })
})

describe('documents cover the contract completely', () => {
  test('every publication rule appears in the contract document', () => {
    const doc = renderPublicationContract()
    for (const rule of publicationRules) {
      expect(doc).toContain(rule.id)
      expect(doc).toContain(rule.statement)
    }
  })

  test('every Family and every Visualization Type appears in the shapes document', () => {
    const doc = renderDataShapes()
    for (const family of visualizationFamilies) expect(doc).toContain(family.name)
    for (const type of visualizationTypes) expect(doc).toContain(type.description)
  })

  test('the machine-readable emit is valid JSON with both halves', () => {
    const parsed = JSON.parse(renderContractJson())
    expect(parsed.publication.rules).toHaveLength(publicationRules.length)
    expect(parsed.visualization.families).toHaveLength(visualizationFamilies.length)
    expect(parsed.knownGap.length).toBeGreaterThan(0)
  })

  test('the contract document states that publication is not gated on visualization', () => {
    // The single most important thing for the backend team not to get wrong.
    expect(renderPublicationContract()).toContain(
      'It never asks whether a Dataset can be drawn as any particular chart.',
    )
  })
})

describe('build status in the documentation', () => {
  registerBuiltInRenderers()
  const built = new Set(registeredRendererIds())
  const shapes = renderDataShapes()

  test('every Visualization Type appears in the Types-by-Family index with a status', () => {
    const index = shapes.slice(
      shapes.indexOf('## Visualization Types by Family'),
      shapes.indexOf('## Families in detail'),
    )
    for (const type of visualizationTypes) {
      expect(index).toContain(`| ${type.name} | ${built.has(type.id) ? 'Built' : 'Not built'} |`)
    }
  })

  test('every unbuilt Type is listed with a reason', () => {
    const stillToBuild = shapes.slice(
      shapes.indexOf('### Still to build'),
      shapes.indexOf('## Families in detail'),
    )

    for (const type of visualizationTypes.filter((t) => !built.has(t.id))) {
      const line = stillToBuild
        .split('\n')
        .find((l) => l.startsWith(`- **${type.name}**`))
      expect(line).toBeDefined()
      // A reason, not just a restatement of the name.
      expect(line!.split('—').slice(1).join('—').trim().length).toBeGreaterThan(20)
    }
  })

  test('no built Type is listed as still to build', () => {
    const stillToBuild = shapes.slice(
      shapes.indexOf('### Still to build'),
      shapes.indexOf('## Families in detail'),
    )
    for (const type of visualizationTypes.filter((t) => built.has(t.id))) {
      expect(stillToBuild).not.toContain(`- **${type.name}**`)
    }
  })

  test('the machine-readable emit carries the same status per Type', () => {
    const json = JSON.parse(renderContractJson()) as {
      visualization: {
        families: { visualizationTypes: { id: string; implemented: boolean }[] }[]
      }
    }
    const emitted = json.visualization.families.flatMap((f) => f.visualizationTypes)

    expect(emitted).toHaveLength(visualizationTypes.length)
    for (const type of emitted) {
      expect(type.implemented).toBe(built.has(type.id))
    }
  })
})
