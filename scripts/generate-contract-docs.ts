/**
 * Writes the Analytics contract documentation.
 *
 *   bun run docs
 *
 * All rendering lives in src/contract-docs/render.ts so it can be tested; this
 * script only puts the results on disk.
 *
 * Outputs:
 *   docs/PUBLICATION_CONTRACT.md  — what a Source System must declare (enforceable)
 *   docs/DATA_SHAPES.md           — what each Visualization Family needs (guidance)
 *   docs/analytics-contract.json  — both, machine-readable
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DOC_FILES,
  renderContractJson,
  renderDataShapes,
  renderPublicationContract,
} from '../src/contract-docs/render'

const out = join(import.meta.dir, '..', 'docs')
mkdirSync(out, { recursive: true })

writeFileSync(join(out, DOC_FILES.publicationContract), renderPublicationContract())
writeFileSync(join(out, DOC_FILES.dataShapes), renderDataShapes())
writeFileSync(join(out, DOC_FILES.contractJson), renderContractJson())

console.log(`Wrote ${Object.values(DOC_FILES).map((f) => `docs/${f}`).join(', ')}`)
