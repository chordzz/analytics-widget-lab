/**
 * Drift guard. The contract documents are handed to the backend team as the
 * specification they build checks against, so "generated from the code" has to
 * be enforceable rather than a promise in a header comment.
 *
 * If this fails: run `bun run docs`.
 */

import { describe, expect, test } from 'bun:test'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  DOC_FILES,
  renderDivergences,
  renderContractJson,
  renderDataShapes,
  renderPublicationContract,
  renderWidgetDataContract,
} from './render'
import { publicationRules } from '../domain/publication-contract'
import { visualizationFamilies } from '../visualization/families'
import { visualizationTypes } from '../visualization/visualization-types'
import { WIDGET_TYPES } from '../analytics/widgets/catalog'
import { SAMPLES } from '../analytics/widgets/samples'
import { queryFor } from '../analytics/data/query'
import { requireDataset } from '../analytics/data/datasets'
import { DIVERGENCES, openDivergences, resolvedDivergences } from './divergences'

const ROOT = join(import.meta.dir, '..', '..')
const docsDir = join(ROOT, 'docs')
const onDisk = (file: string) => readFileSync(join(docsDir, file), 'utf8')

describe('generated documents are current', () => {
  test('PUBLICATION_CONTRACT.md matches the code', () => {
    expect(onDisk(DOC_FILES.publicationContract)).toBe(renderPublicationContract())
  })

  test('DATA_SHAPES.md matches the code', () => {
    expect(onDisk(DOC_FILES.dataShapes)).toBe(renderDataShapes())
  })

  test('DIVERGENCES.md matches the code', () => {
    expect(onDisk(DOC_FILES.divergences)).toBe(renderDivergences())
  })

  test('analytics-contract.json matches the code', () => {
    expect(onDisk(DOC_FILES.contractJson)).toBe(renderContractJson())
  })

  test('the widget data contract on disk matches the code', () => {
    expect(onDisk(DOC_FILES.widgetData)).toBe(renderWidgetDataContract())
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
  /*
   * The same source the docs read — the product module's catalogue.
   *
   * It was the workbench renderer registry, and asserting against a *different*
   * source than the generator uses would only ever test that two lists happened
   * to agree. What keeps `built` honest is `analytics/widgets/built.test.ts`,
   * which fails if a type flagged built has no branch in the render switch.
   */
  const built = new Set(WIDGET_TYPES.filter((type) => type.built).map((type) => type.id))
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

describe('the divergence register is complete', () => {
  /*
   * Merge Plan §9, guard 3. The register is only worth generating if it is
   * exhaustive, and the failure mode is a divergence that exists in the code and
   * not in the table — so this reads the code.
   */
  const SOURCE_DIRS = ['src/analytics', 'src/domain', 'src/composition', 'src/access']

  const sources = (): string[] => {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name)
        if (entry.isDirectory()) walk(path)
        else if (/\.tsx?$/.test(entry.name)) files.push(path)
      }
    }
    for (const dir of SOURCE_DIRS) walk(join(ROOT, dir))
    return files
  }

  test('every divergence cited in the code is in the register', () => {
    const known = new Set(DIVERGENCES.map((entry) => entry.id))
    const cited = new Map<string, string>()

    for (const file of sources()) {
      const text = readFileSync(file, 'utf8')
      // `D` then digits, where the code is actually citing one: either
      // "Merge Plan D4" / "**D4**" or "D4 —" / "(D4," etc. Deliberately narrow,
      // so a variable called `D1` in a test does not count as a citation.
      for (const match of text.matchAll(/\b(D\d{1,2})\b(?=[\s,.)—:*]|$)/gm)) {
        const id = match[1]
        if (/Merge Plan|D\d{1,2} —|\*\*D\d{1,2}\*\*|\(D\d{1,2}/.test(
            text.slice(Math.max(0, match.index - 24), match.index + 8))) {
          if (!cited.has(id)) cited.set(id, file.replace(`${ROOT}/`, ''))
        }
      }
    }

    const missing = [...cited].filter(([id]) => !known.has(id))
    expect(missing).toEqual([])

    // The scanner has to actually find citations, or this test passes by looking
    // at nothing — which is how a completeness check quietly stops checking.
    expect(cited.size).toBeGreaterThanOrEqual(8)
  })

  test('ids are unique', () => {
    // They are permanent and cited from code comments, so a reused number
    // silently repoints every reference to it.
    const ids = DIVERGENCES.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('every entry gives a clause, a divergence and a reason', () => {
    for (const entry of DIVERGENCES) {
      /*
       * A clause has to be citable, and what counts as citable depends on which
       * contract the entry answers to: the FRD numbers its requirements, the API
       * has paths and schema names. Kept strict per authority rather than
       * loosened to accept both, or an entry citing nothing at all would pass.
       */
      expect(entry.clause).toMatch(entry.authority === 'api' ? /^API: \S/ : /^(FR-|§)/)
      expect(entry.divergence.length).toBeGreaterThan(20)
      // "Because the FRD is wrong" is not a reason. A real one names the failure
      // it avoids, and that does not fit in a sentence fragment.
      expect(entry.reason.length).toBeGreaterThan(120)
    }
  })

  test('a temporary or resolved entry names the stage that ends it', () => {
    for (const entry of resolvedDivergences()) {
      expect(entry.endedAt).toBeTruthy()
    }
  })

  test('no open entry claims to be resolved', () => {
    for (const entry of openDivergences()) {
      expect(entry.status).not.toBe('resolved')
    }
  })
})

/**
 * The widget data contract is written for the backend team, so the failures
 * that matter are the ones that would send them building the wrong thing.
 */
describe('widget data contract', () => {
  const doc = renderWidgetDataContract()
  const built = WIDGET_TYPES.filter((type) => type.built)

  test('every built Type appears', () => {
    // A widget missing from this document is a widget the backend does not know
    // it has to serve.
    for (const type of built) {
      expect(doc).toContain(`\`${type.id}\``)
    }
  })

  test('no unbuilt Type appears', () => {
    // The other direction. Telling them to support a Type we cannot draw wastes
    // their time and ours.
    for (const type of WIDGET_TYPES.filter((t) => !t.built)) {
      expect(doc).not.toContain(`\`${type.id}\``)
    }
  })

  test('every Type states what it needs', () => {
    // The `needs` column is the whole point for a Publisher deciding what to
    // declare. An em dash there means `slotsFor` returned nothing.
    const rowsWithNoNeeds = built.filter((type) => doc.includes(`\`${type.id}\`<br>${type.label} | —`))
    expect(rowsWithNoNeeds.map((t) => t.id)).toEqual([])
  })

  test('the four retrieval outcomes are all named', () => {
    // The easiest part of the contract to get wrong, because nothing in the FRD
    // says it about the API — only about the display.
    for (const outcome of ['rows', 'empty', 'denied', 'withdrawn']) {
      expect(doc).toContain(`'${outcome}'`)
    }
  })

  test('it reports the aggregation split rather than claiming a target', () => {
    /*
     * The number is derived, and it is currently unflattering — 3 of 37 send an
     * aggregated query. If this document ever states a round number by hand,
     * it has stopped being a report.
     */
    const aggregated = built.filter((type) => {
      const sample = SAMPLES[type.id]
      const spec = { id: 'doc', typeId: type.id, ...sample }
      return queryFor(spec, requireDataset(sample.datasetId)).measures !== undefined
    })

    expect(doc).toContain(`**${aggregated.length} currently send an aggregated`)
    expect(doc).toContain(`${built.length - aggregated.length} ask for records`)
  })

  test('it says what we will never ask for', () => {
    // Writes, joins and formatting. Each has cost someone a sprint somewhere.
    expect(doc).toContain('Writes.')
    expect(doc).toContain('Joins.')
    expect(doc).toContain('read-only')
  })
})
